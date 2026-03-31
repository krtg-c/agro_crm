import requests


class NominatimGeocoder:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def geocode(self, query: str) -> tuple[float, float, str]:
        url = f"{self.base_url}/search"
        params = {"q": query, "format": "json", "limit": 1, "countrycodes": "ru"}
        headers = {"User-Agent": "agro-geo-api"}
        r = requests.get(url, params=params, headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
        if not data:
            raise ValueError(f"Address not found: {query}")
        lat = float(data[0]["lat"])
        lon = float(data[0]["lon"])
        name = data[0].get("display_name", "")
        return lat, lon, name

    def reverse(
        self,
        lat: float,
        lon: float,
        *,
        zoom: int,
        polygon_geojson: bool = False,
    ) -> dict:
        url = f"{self.base_url}/reverse"
        params = {
            "lat": lat,
            "lon": lon,
            "zoom": zoom,
            "format": "jsonv2",
            "addressdetails": 1,
        }
        if polygon_geojson:
            params["polygon_geojson"] = 1
        headers = {"User-Agent": "agro-geo-api"}
        r = requests.get(url, params=params, headers=headers, timeout=20)
        r.raise_for_status()
        return r.json()

    def lookup(
        self,
        *,
        osm_type: str,
        osm_id: int,
        polygon_geojson: bool = False,
    ) -> dict | None:
        osm_prefix = {"relation": "R", "way": "W", "node": "N"}.get(osm_type)
        if not osm_prefix:
            return None

        url = f"{self.base_url}/lookup"
        params = {"osm_ids": f"{osm_prefix}{osm_id}", "format": "jsonv2"}
        if polygon_geojson:
            params["polygon_geojson"] = 1
        headers = {"User-Agent": "agro-geo-api"}
        r = requests.get(url, params=params, headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
        if not data:
            return None
        return data[0]
