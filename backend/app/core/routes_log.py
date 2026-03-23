from app.core.db import SessionLocal
from app.models import RouteLog


def save_route_log(
    *,
    from_object_type: str | None,
    from_object_id: int | None,
    to_object_type: str | None,
    to_object_id: int | None,
    from_address: str,
    to_address: str,
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    from_display_name: str | None,
    to_display_name: str | None,
    distance_km: float,
    cost: float,
) -> RouteLog:
    with SessionLocal() as session:
        row = RouteLog(
            from_object_type=from_object_type,
            from_object_id=from_object_id,
            to_object_type=to_object_type,
            to_object_id=to_object_id,
            from_address=from_address,
            to_address=to_address,
            from_lat=from_lat,
            from_lon=from_lon,
            to_lat=to_lat,
            to_lon=to_lon,
            from_display_name=from_display_name,
            to_display_name=to_display_name,
            distance_km=distance_km,
            cost=cost,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row