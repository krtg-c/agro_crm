from fastapi import APIRouter

from app.core.config import settings
from app.core.geocoder import NominatimGeocoder
from app.core.objects import list_burts, list_receiving_points
from app.core.regions import build_regions_payload

router = APIRouter(prefix="/map", tags=["map"])


@router.get("/objects")
def get_map_objects():
    burts = list_burts()
    receiving_points = list_receiving_points()

    result = []

    for row in burts:
        result.append(
            {
                "id": row.id,
                "type": "burt",
                "crm_id": row.crm_id,
                "name": row.name,
                "address": row.address,
                "lat": row.lat,
                "lon": row.lon,
                "status": row.status,
                "category": row.category,
                "quality": row.quality,
                "volume": row.volume,
            }
        )

    for row in receiving_points:
        result.append(
            {
                "id": row.id,
                "type": "receiving_point",
                "crm_id": row.crm_id,
                "name": row.name,
                "address": row.address,
                "lat": row.lat,
                "lon": row.lon,
                "point_type": row.point_type,
            }
        )

    return result


@router.get("/regions")
def get_map_regions():
    burts = list_burts()
    receiving_points = list_receiving_points()

    objects = []
    for row in burts:
        objects.append(
            {
                "id": row.id,
                "type": "burt",
                "lat": row.lat,
                "lon": row.lon,
            }
        )
    for row in receiving_points:
        objects.append(
            {
                "id": row.id,
                "type": "receiving_point",
                "lat": row.lat,
                "lon": row.lon,
            }
        )

    geocoder = NominatimGeocoder(settings.geocoder_base_url)
    return build_regions_payload(objects, geocoder)
