from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.coordinates import resolve_coordinates
from app.core.geocoder import NominatimGeocoder
from app.core.objects import (
    create_burt,
    create_receiving_point,
    delete_burt,
    delete_receiving_point,
    list_burts,
    list_receiving_points,
    update_burt,
    update_receiving_point,
)

router = APIRouter(prefix="/objects", tags=["objects"])


class BurtPayload(BaseModel):
    crm_id: str | None = None
    name: str
    address: str
    lat: float | None = None
    lon: float | None = None
    category: str | None = None
    quality: str | None = None
    volume: float | None = None
    status: str | None = None


class ReceivingPointPayload(BaseModel):
    crm_id: str | None = None
    name: str
    address: str
    lat: float | None = None
    lon: float | None = None
    point_type: str | None = None


def serialize_burt(row) -> dict:
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


def serialize_receiving_point(row) -> dict:
    return {
        "id": row.id,
        "crm_id": row.crm_id,
        "name": row.name,
        "address": row.address,
        "lat": row.lat,
        "lon": row.lon,
        "point_type": row.point_type,
    }


def resolve_payload_coordinates(payload, geocoder: NominatimGeocoder) -> tuple[float, float]:
    lat, lon, _display_name = resolve_coordinates(
        address=payload.address,
        geocoder=geocoder,
        lat=payload.lat,
        lon=payload.lon,
    )
    return lat, lon


@router.post("/burts")
def create_burt_endpoint(payload: BurtPayload):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)

    try:
        lat, lon = resolve_payload_coordinates(payload, geocoder)
        row = create_burt(
            crm_id=payload.crm_id,
            name=payload.name,
            address=payload.address,
            lat=lat,
            lon=lon,
            category=payload.category,
            quality=payload.quality,
            volume=payload.volume,
            status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create burt: {exc}")

    return serialize_burt(row)


@router.get("/burts")
def list_burts_endpoint():
    return [serialize_burt(row) for row in list_burts()]


@router.put("/burts/{object_id}")
def update_burt_endpoint(object_id: int, payload: BurtPayload):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)

    try:
        lat, lon = resolve_payload_coordinates(payload, geocoder)
        row = update_burt(
            object_id,
            crm_id=payload.crm_id,
            name=payload.name,
            address=payload.address,
            lat=lat,
            lon=lon,
            category=payload.category,
            quality=payload.quality,
            volume=payload.volume,
            status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update burt: {exc}")

    if not row:
        raise HTTPException(status_code=404, detail=f"Burt not found: {object_id}")

    return serialize_burt(row)


@router.delete("/burts/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_burt_endpoint(object_id: int):
    deleted = delete_burt(object_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Burt not found: {object_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/receiving-points")
def create_receiving_point_endpoint(payload: ReceivingPointPayload):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)

    try:
        lat, lon = resolve_payload_coordinates(payload, geocoder)
        row = create_receiving_point(
            crm_id=payload.crm_id,
            name=payload.name,
            address=payload.address,
            lat=lat,
            lon=lon,
            point_type=payload.point_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create receiving point: {exc}",
        )

    return serialize_receiving_point(row)


@router.get("/receiving-points")
def list_receiving_points_endpoint():
    return [serialize_receiving_point(row) for row in list_receiving_points()]


@router.put("/receiving-points/{object_id}")
def update_receiving_point_endpoint(object_id: int, payload: ReceivingPointPayload):
    geocoder = NominatimGeocoder(settings.geocoder_base_url)

    try:
        lat, lon = resolve_payload_coordinates(payload, geocoder)
        row = update_receiving_point(
            object_id,
            crm_id=payload.crm_id,
            name=payload.name,
            address=payload.address,
            lat=lat,
            lon=lon,
            point_type=payload.point_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to update receiving point: {exc}",
        )

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Receiving point not found: {object_id}",
        )

    return serialize_receiving_point(row)


@router.delete("/receiving-points/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_receiving_point_endpoint(object_id: int):
    deleted = delete_receiving_point(object_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Receiving point not found: {object_id}",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
