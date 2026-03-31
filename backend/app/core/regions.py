from collections.abc import Iterable

from app.core.geocoder import NominatimGeocoder


def _extract_region_name(address: dict) -> str | None:
    for key in ("state", "region", "province"):
        value = address.get(key)
        if value:
            return str(value).strip()
    return None


def _extract_district_name(address: dict) -> str | None:
    for key in ("county", "state_district", "district", "municipality", "city_district"):
        value = address.get(key)
        if value:
            return str(value).strip()
    return None


def _make_admin_key(data: dict, fallback_name: str) -> str:
    osm_type = data.get("osm_type")
    osm_id = data.get("osm_id")
    if osm_type and osm_id:
        return f"{osm_type}:{osm_id}"
    return f"name:{fallback_name.lower()}"


def _parse_bbox(raw_bbox: object) -> list[list[float]] | None:
    if not isinstance(raw_bbox, list) or len(raw_bbox) != 4:
        return None
    try:
        south = float(raw_bbox[0])
        north = float(raw_bbox[1])
        west = float(raw_bbox[2])
        east = float(raw_bbox[3])
    except (TypeError, ValueError):
        return None
    return [[south, west], [north, east]]


def _extract_boundary(data: dict | None) -> dict | None:
    if not data:
        return None
    geometry = data.get("geojson")
    if isinstance(geometry, dict) and geometry.get("type"):
        return geometry
    return None


def build_regions_payload(
    objects: Iterable[dict],
    geocoder: NominatimGeocoder,
) -> dict:
    payload = {"regions": [], "object_regions": []}
    regions_by_key: dict[str, dict] = {}
    dedup_points: set[tuple[float, float]] = set()

    for obj in objects:
        lat = obj.get("lat")
        lon = obj.get("lon")
        if lat is None or lon is None:
            continue
        dedup_points.add((float(lat), float(lon)))

    admin_cache: dict[tuple[float, float, int], dict] = {}

    def reverse_cached(lat: float, lon: float, zoom: int) -> dict | None:
        cache_key = (lat, lon, zoom)
        if cache_key in admin_cache:
            return admin_cache[cache_key]
        try:
            value = geocoder.reverse(lat, lon, zoom=zoom, polygon_geojson=False)
        except Exception:
            value = {}
        admin_cache[cache_key] = value
        return value

    point_admin: dict[tuple[float, float], dict] = {}

    for lat, lon in dedup_points:
        region_info = reverse_cached(lat, lon, zoom=5) or {}
        region_address = region_info.get("address") or {}
        region_name = _extract_region_name(region_address)
        if not region_name:
            continue

        region_key = _make_admin_key(region_info, region_name)
        if region_key not in regions_by_key:
            lookup_data = None
            try:
                osm_type = region_info.get("osm_type")
                osm_id = region_info.get("osm_id")
                if osm_type and osm_id:
                    lookup_data = geocoder.lookup(
                        osm_type=str(osm_type),
                        osm_id=int(osm_id),
                        polygon_geojson=True,
                    )
            except Exception:
                lookup_data = None

            regions_by_key[region_key] = {
                "key": region_key,
                "name": region_name,
                "bbox": _parse_bbox((lookup_data or region_info).get("boundingbox")),
                "boundary": _extract_boundary(lookup_data),
                "districts": [],
                "_districts_by_key": {},
            }

        district_info = reverse_cached(lat, lon, zoom=8) or {}
        district_address = district_info.get("address") or {}
        district_name = _extract_district_name(district_address)
        district_key = None
        if district_name:
            district_key = _make_admin_key(district_info, district_name)
            districts_by_key = regions_by_key[region_key]["_districts_by_key"]
            if district_key not in districts_by_key:
                district_lookup = None
                try:
                    osm_type = district_info.get("osm_type")
                    osm_id = district_info.get("osm_id")
                    if osm_type and osm_id:
                        district_lookup = geocoder.lookup(
                            osm_type=str(osm_type),
                            osm_id=int(osm_id),
                            polygon_geojson=True,
                        )
                except Exception:
                    district_lookup = None

                district_data = {
                    "key": district_key,
                    "name": district_name,
                    "bbox": _parse_bbox((district_lookup or district_info).get("boundingbox")),
                    "boundary": _extract_boundary(district_lookup),
                }
                districts_by_key[district_key] = district_data
                regions_by_key[region_key]["districts"].append(district_data)

        point_admin[(lat, lon)] = {
            "region_key": region_key,
            "district_key": district_key,
        }

    for region in regions_by_key.values():
        region.pop("_districts_by_key", None)
        payload["regions"].append(region)

    payload["regions"].sort(key=lambda item: item["name"].lower())

    for obj in objects:
        lat = obj.get("lat")
        lon = obj.get("lon")
        if lat is None or lon is None:
            continue
        admin_data = point_admin.get((float(lat), float(lon)))
        if not admin_data:
            continue
        payload["object_regions"].append(
            {
                "object_type": obj.get("type"),
                "object_id": obj.get("id"),
                "region_key": admin_data["region_key"],
                "district_key": admin_data["district_key"],
            }
        )

    return payload
