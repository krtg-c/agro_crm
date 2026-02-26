import requests


class OSRMClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def route_distance_km(self, from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> float:
        # OSRM формат: lon,lat
        url = f"{self.base_url}/route/v1/driving/{from_lon},{from_lat};{to_lon},{to_lat}"
        params = {"overview": "false", "alternatives": "false", "steps": "false"}
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()

        routes = data.get("routes") or []
        if not routes:
            raise RuntimeError(f"No routes in OSRM response: {data}")

        distance_m = float(routes[0]["distance"])
        return round(distance_m / 1000.0, 3)