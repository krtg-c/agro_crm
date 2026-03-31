from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.coordinates import resolve_coordinates
from app.core.geocoder import NominatimGeocoder
from app.core.optimal_route import find_optimal_route_by_object
from app.core.objects import (
    get_burt_by_id,
    get_receiving_point_by_id,
    update_burt_coordinates,
    update_receiving_point_coordinates,
)
from app.core.osrm_client import OSRMClient
from app.core.routes_log import save_route_log


router = APIRouter(prefix="/route", tags=["route"])


class Point(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class RouteRequest(BaseModel):
    from_point: Point
    to_point: Point
    rate_per_km: float = Field(50.0, ge=0)


class RouteResponse(BaseModel):
    distance_km: float
    cost: float
    geometry: dict | None = None


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
    geometry: list[list[float]]


class OptimalRouteRequest(BaseModel):
    from_object_type: str = Field(..., min_length=1)
    from_object_id: int = Field(..., gt=0)
    optimization_mode: str = Field("balanced", min_length=1)
    rate_rub_per_km: float = Field(50.0, ge=0)
    fixed_costs: float = Field(0.0, ge=0)
    alternatives_limit: int = Field(3, ge=1, le=10)


class OptimalAlternative(BaseModel):
    object_type: str
    object_id: int
    name: str
    address: str
    distance_km: float
    cost_rub: float
    score: float
    same_region: bool
    same_district: bool


class OptimalRouteResponse(RouteByObjectResponse):
    score: float
    optimization_mode: str
    to_name: str
    to_address: str
    explanation: list[str]
    candidates_checked: int
    alternatives: list[OptimalAlternative]


def load_object_coordinates(
    object_type: str,
    object_id: int,
    geocoder: NominatimGeocoder,
) -> tuple[str, float, float, str | None]:
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

    lat, lon, display_name = resolve_coordinates(address=obj.address, geocoder=geocoder)
    print("UPDATING OBJECT COORDINATES:", object_type, object_id, lat, lon)

    if object_type == "burt":
        update_burt_coordinates(object_id, lat, lon)
    else:
        update_receiving_point_coordinates(object_id, lat, lon)

    return obj.address, lat, lon, display_name or obj.name


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
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OSRM error: {exc}")

    cost = round(distance_km * payload.rate_per_km, 2)
    return RouteResponse(distance_km=distance_km, cost=cost, geometry=None)


@router.post("/by-address", response_model=RouteByAddressResponse)
def route_by_address(payload: RouteByAddressRequest):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)
    osrm = OSRMClient(settings.osrm_base_url)

    try:
        f_lat, f_lon, f_name = resolve_coordinates(
            address=payload.from_address,
            geocoder=geocoder,
        )
        t_lat, t_lon, t_name = resolve_coordinates(
            address=payload.to_address,
            geocoder=geocoder,
        )
        distance_km = osrm.route_distance_km(f_lat, f_lon, t_lat, t_lon)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Geocode/route error: {exc}")

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
        route_data = osrm.route_full(f_lat, f_lon, t_lat, t_lon)
        distance_km = route_data["distance_km"]
        geometry = route_data["geometry"]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Route by object error: {exc}")

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
        geometry=geometry,
    )


@router.post("/optimal/by-object", response_model=OptimalRouteResponse)
def optimal_route_by_object(payload: OptimalRouteRequest):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)
    osrm = OSRMClient(settings.osrm_base_url)
    mode = payload.optimization_mode.strip().lower()

    if mode not in {"balanced", "nearest", "cheapest"}:
        raise HTTPException(
            status_code=400,
            detail="optimization_mode must be one of: balanced, nearest, cheapest",
        )

    try:
        result = find_optimal_route_by_object(
            from_object_type=payload.from_object_type,
            from_object_id=payload.from_object_id,
            geocoder=geocoder,
            osrm=osrm,
            rate_rub_per_km=payload.rate_rub_per_km,
            fixed_costs=payload.fixed_costs,
            optimization_mode=mode,
            alternatives_limit=payload.alternatives_limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Optimal route error: {exc}")

    from_address, _f_lat, _f_lon, from_display_name = load_object_coordinates(
        result["from_object_type"],
        result["from_object_id"],
        geocoder,
    )

    save_route_log(
        from_object_type=result["from_object_type"],
        from_object_id=result["from_object_id"],
        to_object_type=result["to_object_type"],
        to_object_id=result["to_object_id"],
        from_address=from_address,
        to_address=result["to_address"],
        from_lat=result["from_point"]["lat"],
        from_lon=result["from_point"]["lon"],
        to_lat=result["to_point"]["lat"],
        to_lon=result["to_point"]["lon"],
        from_display_name=from_display_name,
        to_display_name=result["to_name"],
        distance_km=result["distance_km"],
        cost=result["cost_rub"],
    )

    return OptimalRouteResponse(**result)
