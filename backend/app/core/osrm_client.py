import requests


class OSRMClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def route_full(self, from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> dict:
        url = (
            f"{self.base_url}/route/v1/driving/"
            f"{from_lon},{from_lat};{to_lon},{to_lat}"
        )
        params = {
            "overview": "full",
            "geometries": "geojson",
            "alternatives": "false",
            "steps": "false",
        }

        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()

        if not data.get("routes"):
            raise ValueError("Route not found")

        route = data["routes"][0]
        distance_km = round(route["distance"] / 1000, 3)
        geometry = route["geometry"]["coordinates"]

        return {
            "distance_km": distance_km,
            "geometry": geometry,
        }