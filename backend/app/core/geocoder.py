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