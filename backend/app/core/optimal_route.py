from math import asin, cos, radians, sin, sqrt

from app.core.coordinates import resolve_coordinates
from app.core.geocoder import NominatimGeocoder
from app.core.objects import (
    get_burt_by_id,
    get_receiving_point_by_id,
    list_burts,
    list_receiving_points,
    update_burt_coordinates,
    update_receiving_point_coordinates,
)
from app.core.osrm_client import OSRMClient


INACTIVE_STATUS_MARKERS = (
    "inactive",
    "archived",
    "closed",
    "disabled",
    "deleted",
    "cancelled",
    "неактив",
    "архив",
    "закрыт",
    "удален",
    "отмен",
)

LIMITED_STATUS_MARKERS = (
    "pause",
    "paused",
    "hold",
    "limited",
    "ожидан",
    "пауза",
    "огранич",
)


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


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    return 2 * radius_km * asin(sqrt(a))


def _normalize_status(status: str | None) -> str:
    return (status or "").strip().casefold()


def _is_inactive_status(status: str | None) -> bool:
    normalized = _normalize_status(status)
    return any(marker in normalized for marker in INACTIVE_STATUS_MARKERS)


def _status_penalty(status: str | None) -> float:
    normalized = _normalize_status(status)
    if not normalized:
        return 8.0
    if any(marker in normalized for marker in INACTIVE_STATUS_MARKERS):
        return 1000.0
    if any(marker in normalized for marker in LIMITED_STATUS_MARKERS):
        return 18.0
    return 0.0


def _completeness_penalty(item: dict) -> float:
    if item["type"] == "burt":
        fields = ("category", "quality", "volume", "status")
    else:
        fields = ("point_type",)
    missing = sum(1 for field in fields if item.get(field) in (None, ""))
    return float(missing * 4)


def _normalize_metric(value: float, min_value: float, max_value: float) -> float:
    if max_value <= min_value:
        return 0.0
    return (value - min_value) / (max_value - min_value) * 100.0


def _resolve_admin_area(
    lat: float,
    lon: float,
    geocoder: NominatimGeocoder,
    cache: dict[tuple[float, float], dict],
) -> dict:
    cache_key = (round(lat, 6), round(lon, 6))
    if cache_key in cache:
        return cache[cache_key]

    try:
        region_data = geocoder.reverse(lat, lon, zoom=5, polygon_geojson=False)
        district_data = geocoder.reverse(lat, lon, zoom=8, polygon_geojson=False)
        area = {
            "region": _extract_region_name(region_data.get("address") or {}),
            "district": _extract_district_name(district_data.get("address") or {}),
        }
    except Exception:
        area = {"region": None, "district": None}

    cache[cache_key] = area
    return area


def _load_object_record(object_type: str, object_id: int):
    if object_type == "burt":
        return get_burt_by_id(object_id)
    if object_type == "receiving_point":
        return get_receiving_point_by_id(object_id)
    raise ValueError(f"Unsupported object_type: {object_type}")


def _serialize_object(object_type: str, row) -> dict:
    return {
        "id": row.id,
        "type": object_type,
        "name": row.name,
        "address": row.address,
        "lat": row.lat,
        "lon": row.lon,
        "category": getattr(row, "category", None),
        "quality": getattr(row, "quality", None),
        "volume": getattr(row, "volume", None),
        "status": getattr(row, "status", None),
        "point_type": getattr(row, "point_type", None),
    }


def _load_object_details(
    object_type: str,
    object_id: int,
    geocoder: NominatimGeocoder,
) -> dict:
    row = _load_object_record(object_type, object_id)
    if not row:
        raise ValueError(f"Object not found: {object_type}#{object_id}")

    lat, lon, display_name = resolve_coordinates(
        address=row.address,
        geocoder=geocoder,
        lat=row.lat,
        lon=row.lon,
    )

    if row.lat is None or row.lon is None:
        if object_type == "burt":
            update_burt_coordinates(object_id, lat, lon)
        else:
            update_receiving_point_coordinates(object_id, lat, lon)

    item = _serialize_object(object_type, row)
    item["lat"] = lat
    item["lon"] = lon
    item["display_name"] = display_name or row.name
    return item


def _candidate_pool(source_type: str) -> list[dict]:
    if source_type == "burt":
        return [_serialize_object("receiving_point", row) for row in list_receiving_points()]
    if source_type == "receiving_point":
        return [_serialize_object("burt", row) for row in list_burts()]
    raise ValueError(f"Unsupported object_type: {source_type}")


def _resolve_candidate_coordinates(candidate: dict, geocoder: NominatimGeocoder) -> dict | None:
    try:
        lat, lon, display_name = resolve_coordinates(
            address=candidate["address"],
            geocoder=geocoder,
            lat=candidate.get("lat"),
            lon=candidate.get("lon"),
        )
    except Exception:
        return None

    if candidate.get("lat") is None or candidate.get("lon") is None:
        if candidate["type"] == "burt":
            update_burt_coordinates(candidate["id"], lat, lon)
        else:
            update_receiving_point_coordinates(candidate["id"], lat, lon)

    resolved = dict(candidate)
    resolved["lat"] = lat
    resolved["lon"] = lon
    resolved["display_name"] = display_name or candidate["name"]
    return resolved


def _build_explanation(
    *,
    source: dict,
    candidate: dict,
    same_region: bool,
    same_district: bool,
    mode: str,
) -> list[str]:
    reasons = []
    if mode == "cheapest":
        reasons.append("Маршрут выбран по минимальной итоговой стоимости с учетом расстояния.")
    elif mode == "nearest":
        reasons.append("Маршрут выбран как наиболее короткий по расстоянию.")
    else:
        reasons.append("Маршрут выбран по сбалансированной оценке стоимости, расстояния и территориальной близости.")

    if same_region:
        reasons.append("Точка назначения находится в том же регионе.")
    if same_district:
        reasons.append("Маршрут дополнительно выигрывает за счет совпадения района.")

    if source["type"] == "burt" and source.get("volume"):
        reasons.append("Для бурта учтено, что большой объем делает длинные плечи менее выгодными.")

    if candidate["type"] == "burt" and candidate.get("status"):
        reasons.append(f"Статус бурта учтен в оценке: {candidate['status']}.")

    if candidate["type"] == "receiving_point" and candidate.get("point_type"):
        reasons.append(f"Выбрана точка приемки типа: {candidate['point_type']}.")

    return reasons


def find_optimal_route_by_object(
    *,
    from_object_type: str,
    from_object_id: int,
    geocoder: NominatimGeocoder,
    osrm: OSRMClient,
    rate_rub_per_km: float,
    fixed_costs: float,
    optimization_mode: str,
    alternatives_limit: int,
) -> dict:
    source = _load_object_details(from_object_type, from_object_id, geocoder)

    if source["type"] == "burt" and _is_inactive_status(source.get("status")):
        raise ValueError("Для неактивного бурта оптимальный маршрут не рассчитывается")

    raw_candidates = _candidate_pool(source["type"])
    resolved_candidates = []

    for candidate in raw_candidates:
        if candidate["type"] == source["type"] and candidate["id"] == source["id"]:
            continue
        if candidate["type"] == "burt" and _is_inactive_status(candidate.get("status")):
            continue

        resolved = _resolve_candidate_coordinates(candidate, geocoder)
        if not resolved:
            continue
        resolved_candidates.append(resolved)

    if not resolved_candidates:
        raise ValueError("Не найдено подходящих объектов для подбора оптимального маршрута")

    resolved_candidates.sort(
        key=lambda candidate: _haversine_km(
            source["lat"],
            source["lon"],
            candidate["lat"],
            candidate["lon"],
        )
    )
    shortlisted = resolved_candidates[: max(alternatives_limit * 5, 12)]

    admin_cache: dict[tuple[float, float], dict] = {}
    source_admin = _resolve_admin_area(source["lat"], source["lon"], geocoder, admin_cache)
    scored_candidates = []

    for candidate in shortlisted:
        try:
            distance_km = osrm.route_distance_km(
                source["lat"],
                source["lon"],
                candidate["lat"],
                candidate["lon"],
            )
        except Exception:
            continue

        admin = _resolve_admin_area(candidate["lat"], candidate["lon"], geocoder, admin_cache)
        same_region = bool(source_admin["region"] and source_admin["region"] == admin["region"])
        same_district = bool(
            source_admin["district"] and source_admin["district"] == admin["district"]
        )
        volume_basis = source.get("volume") if source["type"] == "burt" else candidate.get("volume")
        volume_basis = float(volume_basis or 0.0)
        volume_weighted_distance = distance_km * (1 + min(volume_basis, 5000.0) / 5000.0)
        scored_candidates.append(
            {
                "candidate": candidate,
                "distance_km": distance_km,
                "cost_rub": round(distance_km * rate_rub_per_km + fixed_costs, 2),
                "same_region": same_region,
                "same_district": same_district,
                "status_penalty": _status_penalty(candidate.get("status")),
                "completeness_penalty": _completeness_penalty(candidate),
                "volume_weighted_distance": volume_weighted_distance,
            }
        )

    if not scored_candidates:
        raise ValueError("Не удалось рассчитать маршрут ни для одного кандидата")

    distance_values = [item["distance_km"] for item in scored_candidates]
    cost_values = [item["cost_rub"] for item in scored_candidates]
    volume_values = [item["volume_weighted_distance"] for item in scored_candidates]

    for item in scored_candidates:
        distance_score = _normalize_metric(
            item["distance_km"],
            min(distance_values),
            max(distance_values),
        )
        cost_score = _normalize_metric(
            item["cost_rub"],
            min(cost_values),
            max(cost_values),
        )
        volume_score = _normalize_metric(
            item["volume_weighted_distance"],
            min(volume_values),
            max(volume_values),
        )
        territory_bonus = (18.0 if item["same_region"] else 0.0) + (
            8.0 if item["same_district"] else 0.0
        )

        if optimization_mode == "cheapest":
            weighted = cost_score * 0.60 + distance_score * 0.25 + volume_score * 0.10
        elif optimization_mode == "nearest":
            weighted = distance_score * 0.75 + cost_score * 0.10 + volume_score * 0.10
        else:
            weighted = distance_score * 0.50 + cost_score * 0.20 + volume_score * 0.15

        weighted += item["completeness_penalty"] * 0.5
        weighted += item["status_penalty"]
        weighted -= territory_bonus
        item["score"] = round(weighted, 2)

    scored_candidates.sort(key=lambda item: (item["score"], item["distance_km"], item["cost_rub"]))
    best = scored_candidates[0]
    best_route = osrm.route_full(
        source["lat"],
        source["lon"],
        best["candidate"]["lat"],
        best["candidate"]["lon"],
    )

    return {
        "from_object_type": source["type"],
        "from_object_id": source["id"],
        "to_object_type": best["candidate"]["type"],
        "to_object_id": best["candidate"]["id"],
        "from_point": {"lat": source["lat"], "lon": source["lon"]},
        "to_point": {"lat": best["candidate"]["lat"], "lon": best["candidate"]["lon"]},
        "distance_km": best_route["distance_km"],
        "cost_rub": round(best_route["distance_km"] * rate_rub_per_km + fixed_costs, 2),
        "geometry": best_route["geometry"],
        "score": best["score"],
        "optimization_mode": optimization_mode,
        "to_name": best["candidate"]["name"],
        "to_address": best["candidate"]["address"],
        "explanation": _build_explanation(
            source=source,
            candidate=best["candidate"],
            same_region=best["same_region"],
            same_district=best["same_district"],
            mode=optimization_mode,
        ),
        "candidates_checked": len(scored_candidates),
        "alternatives": [
            {
                "object_type": item["candidate"]["type"],
                "object_id": item["candidate"]["id"],
                "name": item["candidate"]["name"],
                "address": item["candidate"]["address"],
                "distance_km": round(item["distance_km"], 2),
                "cost_rub": item["cost_rub"],
                "score": item["score"],
                "same_region": item["same_region"],
                "same_district": item["same_district"],
            }
            for item in scored_candidates[:alternatives_limit]
        ],
    }
