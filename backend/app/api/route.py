from fastapi import APIRouter
from pydantic import BaseModel, Field
from fastapi import HTTPException
from app.core.config import settings
from app.core.osrm_client import OSRMClient
from app.core.geocoder import NominatimGeocoder

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

@router.post("/route/by-address", response_model=RouteByAddressResponse)
def route_by_address(payload: RouteByAddressRequest):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)
    osrm = OSRMClient(settings.osrm_base_url)

    try:
        f_lat, f_lon, f_name = geocoder.geocode(payload.from_address)
        t_lat, t_lon, t_name = geocoder.geocode(payload.to_address)
        distance_km = osrm.route_distance_km(f_lat, f_lon, t_lat, t_lon)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Geocode/route error: {e}")

    cost = round(distance_km * payload.rate_per_km, 2)
    return RouteByAddressResponse(
        from_point={"lat": f_lat, "lon": f_lon},
        to_point={"lat": t_lat, "lon": t_lon},
        from_display_name=f_name,
        to_display_name=t_name,
        distance_km=distance_km,
        cost=cost,
    )