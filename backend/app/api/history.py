from fastapi import APIRouter, Query

from app.core.routes_query import list_route_logs

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get("/history")
def get_routes_history(limit: int = Query(100, ge=1, le=1000)):
    rows = list_route_logs(limit=limit)

    return [
        {
            "id": row.id,
            "from_object_type": row.from_object_type,
            "from_object_id": row.from_object_id,
            "to_object_type": row.to_object_type,
            "to_object_id": row.to_object_id,
            "from_address": row.from_address,
            "to_address": row.to_address,
            "from_lat": row.from_lat,
            "from_lon": row.from_lon,
            "to_lat": row.to_lat,
            "to_lon": row.to_lon,
            "from_display_name": row.from_display_name,
            "to_display_name": row.to_display_name,
            "distance_km": row.distance_km,
            "cost": row.cost,
            "created_at": row.created_at,
        }
        for row in rows
    ]