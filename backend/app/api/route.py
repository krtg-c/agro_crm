from fastapi import APIRouter
from pydantic import BaseModel, Field
from fastapi import HTTPException
from app.core.config import settings
from app.core.osrm_client import OSRMClient

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