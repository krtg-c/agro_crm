from app.core.address_cache import get_cached_address, save_cached_address
from app.core.geocoder import NominatimGeocoder


def resolve_coordinates(
    *,
    address: str,
    geocoder: NominatimGeocoder,
    lat: float | None = None,
    lon: float | None = None,
) -> tuple[float, float, str | None]:
    if lat is not None and lon is not None:
        save_cached_address(address, lat, lon)
        return lat, lon, None

    cached = get_cached_address(address)
    if cached:
        return cached.lat, cached.lon, cached.display_name

    lat, lon, display_name = geocoder.geocode(address)
    save_cached_address(address, lat, lon, display_name)
    return lat, lon, display_name
