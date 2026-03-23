from fastapi import APIRouter
from pydantic import BaseModel, Field
from fastapi import HTTPException
from app.core.config import settings
from app.core.osrm_client import OSRMClient
from app.core.geocoder import NominatimGeocoder
from app.core.address_cache import get_cached_address, save_cached_address
from app.core.routes_log import save_route_log
from app.core.objects import get_burt_by_id, get_receiving_point_by_id

router = APIRouter(prefix="/route", tags=["route"])


class Point(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class RouteRequest(BaseModel):
    from_point: Point
    to_point: Point
    rate_per_km: float = Field(50.0, ge=0)  # ставка по умолчанию


class RouteResponse(BaseModel):
    distance_km: float
    cost: float
    geometry: dict | None = None  # позже будет GeoJSON

class RouteByAddressRequest(BaseModel):
    from_address: str = Field(..., min_length=3)
    to_address: str = Field(..., min_length=3)
    rate_per_km: float = Field(50.0, ge=0)

class RouteByAddressResponse(BaseModel):
    from_point: dict
    to_point: dict
    from_display_name: str | None = None
    to_display_name: str | None = None
    distance_km: float
    cost: float

class RouteByObjectRequest(BaseModel):
    from_object_type: str = Field(..., min_length=1)
    from_object_id: int = Field(..., gt=0)
    to_object_type: str = Field(..., min_length=1)
    to_object_id: int = Field(..., gt=0)
    rate_rub_per_km: float = Field(50.0, ge=0)
    fixed_costs: float = Field(0.0, ge=0)


class RouteByObjectResponse(BaseModel):
    from_object_type: str
    from_object_id: int
    to_object_type: str
    to_object_id: int
    from_point: dict
    to_point: dict
    distance_km: float
    cost_rub: float

def load_object_coordinates(object_type: str, object_id: int, geocoder: NominatimGeocoder):
    if object_type == "burt":
        obj = get_burt_by_id(object_id)
    elif object_type == "receiving_point":
        obj = get_receiving_point_by_id(object_id)
    else:
        raise ValueError(f"Unsupported object_type: {object_type}")

    if not obj:
        raise ValueError(f"Object not found: {object_type}#{object_id}")

    if obj.lat is not None and obj.lon is not None:
        return obj.address, obj.lat, obj.lon, obj.name

    cached = get_cached_address(obj.address)
    if cached:
        return obj.address, cached.lat, cached.lon, cached.display_name or obj.name

    lat, lon, display_name = geocoder.geocode(obj.address)
    save_cached_address(obj.address, lat, lon, display_name)
    return obj.address, lat, lon, display_name


@router.post("", response_model=RouteResponse)
def build_route(payload: RouteRequest):
    client = OSRMClient(settings.osrm_base_url)

    try:
        distance_km = client.route_distance_km(
            payload.from_point.lat,
            payload.from_point.lon,
            payload.to_point.lat,
            payload.to_point.lon,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSRM error: {e}")

    cost = round(distance_km * payload.rate_per_km, 2)
    return RouteResponse(distance_km=distance_km, cost=cost, geometry=None)

@router.post("/by-address", response_model=RouteByAddressResponse)
def route_by_address(payload: RouteByAddressRequest):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)
    osrm = OSRMClient(settings.osrm_base_url)

    try:
        # from_address: сначала кэш
        cached_from = get_cached_address(payload.from_address)
        if cached_from:
            f_lat = cached_from.lat
            f_lon = cached_from.lon
            f_name = cached_from.display_name or cached_from.address
        else:
            f_lat, f_lon, f_name = geocoder.geocode(payload.from_address)
            save_cached_address(payload.from_address, f_lat, f_lon, f_name)

        # to_address: сначала кэш
        cached_to = get_cached_address(payload.to_address)
        if cached_to:
            t_lat = cached_to.lat
            t_lon = cached_to.lon
            t_name = cached_to.display_name or cached_to.address
        else:
            t_lat, t_lon, t_name = geocoder.geocode(payload.to_address)
            save_cached_address(payload.to_address, t_lat, t_lon, t_name)

        distance_km = osrm.route_distance_km(f_lat, f_lon, t_lat, t_lon)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Geocode/route error: {e}")

    cost = round(distance_km * payload.rate_per_km, 2)

    save_route_log(
        from_address=payload.from_address,
        to_address=payload.to_address,
        from_lat=f_lat,
        from_lon=f_lon,
        to_lat=t_lat,
        to_lon=t_lon,
        from_display_name=f_name,
        to_display_name=t_name,
        distance_km=distance_km,
        cost=cost,
    )

    return RouteByAddressResponse(
        from_point={"lat": f_lat, "lon": f_lon},
        to_point={"lat": t_lat, "lon": t_lon},
        from_display_name=f_name,
        to_display_name=t_name,
        distance_km=distance_km,
        cost=cost,
    )

@router.post("/by-object", response_model=RouteByObjectResponse)
def route_by_object(payload: RouteByObjectRequest):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)
    osrm = OSRMClient(settings.osrm_base_url)

    try:
        from_address, f_lat, f_lon, f_name = load_object_coordinates(
            payload.from_object_type,
            payload.from_object_id,
            geocoder,
        )
        to_address, t_lat, t_lon, t_name = load_object_coordinates(
            payload.to_object_type,
            payload.to_object_id,
            geocoder,
        )

        distance_km = osrm.route_distance_km(f_lat, f_lon, t_lat, t_lon)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Route by object error: {e}")

    cost_rub = round(distance_km * payload.rate_rub_per_km + payload.fixed_costs, 2)

    save_route_log(
        from_object_type=payload.from_object_type,
        from_object_id=payload.from_object_id,
        to_object_type=payload.to_object_type,
        to_object_id=payload.to_object_id,
        from_address=from_address,
        to_address=to_address,
        from_lat=f_lat,
        from_lon=f_lon,
        to_lat=t_lat,
        to_lon=t_lon,
        from_display_name=f_name,
        to_display_name=t_name,
        distance_km=distance_km,
        cost=cost_rub,
    )

    return RouteByObjectResponse(
        from_object_type=payload.from_object_type,
        from_object_id=payload.from_object_id,
        to_object_type=payload.to_object_type,
        to_object_id=payload.to_object_id,
        from_point={"lat": f_lat, "lon": f_lon},
        to_point={"lat": t_lat, "lon": t_lon},
        distance_km=distance_km,
        cost_rub=cost_rub,
    )