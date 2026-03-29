from sqlalchemy import select
from app.core.db import SessionLocal
from app.models import AddressCache


def get_cached_address(address: str) -> AddressCache | None:
    with SessionLocal() as session:
        stmt = select(AddressCache).where(AddressCache.address == address)
        return session.execute(stmt).scalar_one_or_none()


def save_cached_address(address: str, lat: float, lon: float, display_name: str | None = None) -> AddressCache:
    with SessionLocal() as session:
        stmt = select(AddressCache).where(AddressCache.address == address)
        existing = session.execute(stmt).scalar_one_or_none()

        if existing:
            return existing

        row = AddressCache(
            address=address,
            lat=lat,
            lon=lon,
            display_name=display_name,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row