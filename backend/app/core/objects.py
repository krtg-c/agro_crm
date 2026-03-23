from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Burt, ReceivingPoint


def create_burt(
    *,
    crm_id: str | None,
    name: str,
    address: str,
    lat: float | None = None,
    lon: float | None = None,
    category: str | None = None,
    quality: str | None = None,
    volume: float | None = None,
    status: str | None = None,
) -> Burt:
    with SessionLocal() as session:
        row = Burt(
            crm_id=crm_id,
            name=name,
            address=address,
            lat=lat,
            lon=lon,
            category=category,
            quality=quality,
            volume=volume,
            status=status,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def create_receiving_point(
    *,
    crm_id: str | None,
    name: str,
    address: str,
    lat: float | None = None,
    lon: float | None = None,
    point_type: str | None = None,
) -> ReceivingPoint:
    with SessionLocal() as session:
        row = ReceivingPoint(
            crm_id=crm_id,
            name=name,
            address=address,
            lat=lat,
            lon=lon,
            point_type=point_type,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def get_burt_by_id(object_id: int) -> Burt | None:
    with SessionLocal() as session:
        stmt = select(Burt).where(Burt.id == object_id)
        return session.execute(stmt).scalar_one_or_none()


def get_receiving_point_by_id(object_id: int) -> ReceivingPoint | None:
    with SessionLocal() as session:
        stmt = select(ReceivingPoint).where(ReceivingPoint.id == object_id)
        return session.execute(stmt).scalar_one_or_none()


def list_burts() -> list[Burt]:
    with SessionLocal() as session:
        stmt = select(Burt).order_by(Burt.id)
        return list(session.execute(stmt).scalars().all())


def list_receiving_points() -> list[ReceivingPoint]:
    with SessionLocal() as session:
        stmt = select(ReceivingPoint).order_by(ReceivingPoint.id)
        return list(session.execute(stmt).scalars().all())