from sqlalchemy import desc, select

from app.core.db import SessionLocal
from app.models import RouteLog


def list_route_logs(limit: int = 100) -> list[RouteLog]:
    with SessionLocal() as session:
        stmt = select(RouteLog).order_by(desc(RouteLog.id)).limit(limit)
        return list(session.execute(stmt).scalars().all())