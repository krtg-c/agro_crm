from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.objects import (
    create_burt,
    create_receiving_point,
    list_burts,
    list_receiving_points,
)

router = APIRouter(prefix="/objects", tags=["objects"])


class BurtCreateRequest(BaseModel):
    crm_id: str | None = None
    name: str
    address: str
    lat: float | None = None
    lon: float | None = None
    category: str | None = None
    quality: str | None = None
    volume: float | None = None
    status: str | None = None


class ReceivingPointCreateRequest(BaseModel):
    crm_id: str | None = None
    name: str
    address: str
    lat: float | None = None
    lon: float | None = None
    point_type: str | None = None


@router.post("/burts")
def create_burt_endpoint(payload: BurtCreateRequest):
    row = create_burt(
        crm_id=payload.crm_id,
        name=payload.name,
        address=payload.address,
        lat=payload.lat,
        lon=payload.lon,
        category=payload.category,
        quality=payload.quality,
        volume=payload.volume,
        status=payload.status,
    )
    return {
        "id": row.id,
        "crm_id": row.crm_id,
        "name": row.name,
        "address": row.address,
        "lat": row.lat,
        "lon": row.lon,
        "category": row.category,
        "quality": row.quality,
        "volume": row.volume,
        "status": row.status,
    }


@router.get("/burts")
def list_burts_endpoint():
    rows = list_burts()
    return [
        {
            "id": row.id,
            "crm_id": row.crm_id,
            "name": row.name,
            "address": row.address,
            "lat": row.lat,
            "lon": row.lon,
            "category": row.category,
            "quality": row.quality,
            "volume": row.volume,
            "status": row.status,
        }
        for row in rows
    ]


@router.post("/receiving-points")
def create_receiving_point_endpoint(payload: ReceivingPointCreateRequest):
    row = create_receiving_point(
        crm_id=payload.crm_id,
        name=payload.name,
        address=payload.address,
        lat=payload.lat,
        lon=payload.lon,
        point_type=payload.point_type,
    )
    return {
        "id": row.id,
        "crm_id": row.crm_id,
        "name": row.name,
        "address": row.address,
        "lat": row.lat,
        "lon": row.lon,
        "point_type": row.point_type,
    }


@router.get("/receiving-points")
def list_receiving_points_endpoint():
    rows = list_receiving_points()
    return [
        {
            "id": row.id,
            "crm_id": row.crm_id,
            "name": row.name,
            "address": row.address,
            "lat": row.lat,
            "lon": row.lon,
            "point_type": row.point_type,
        }
        for row in rows
    ]