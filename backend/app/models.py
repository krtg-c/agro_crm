from sqlalchemy import Column, DateTime, Float, Integer, String, func

from app.core.db import Base


class AddressCache(Base):
    __tablename__ = "address_cache"

    id = Column(Integer, primary_key=True, index=True)
    address = Column(String, unique=True, nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    display_name = Column(String, nullable=True)


class RouteLog(Base):
    __tablename__ = "routes_log"

    id = Column(Integer, primary_key=True, index=True)

    from_address = Column(String, nullable=False)
    to_address = Column(String, nullable=False)

    from_lat = Column(Float, nullable=False)
    from_lon = Column(Float, nullable=False)
    to_lat = Column(Float, nullable=False)
    to_lon = Column(Float, nullable=False)

    from_display_name = Column(String, nullable=True)
    to_display_name = Column(String, nullable=True)

    distance_km = Column(Float, nullable=False)
    cost = Column(Float, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)