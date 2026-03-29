from fastapi import APIRouter

from app.core.objects import list_burts, list_receiving_points

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