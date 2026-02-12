from fastapi import APIRouter
from pydantic import BaseModel, Field

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
    # Заглушка: расстояние = 0, стоимость = 0
    # На следующем шаге подключим OSRM и будем считать distance_km реально
    distance_km = 0.0
    cost = round(distance_km * payload.rate_per_km, 2)
    return RouteResponse(distance_km=distance_km, cost=cost, geometry=None)
