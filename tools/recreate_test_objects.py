import json
from urllib import request


API_BASE = "http://127.0.0.1:8000"


def post(path: str, payload: dict) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        f"{API_BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    burt = post(
        "/objects/burts",
        {
            "crm_id": "test-burt-3",
            "name": "Тестовый бурт",
            "address": "Москва, Тверская улица, 1",
            "lat": 55.7666517,
            "lon": 37.6028524,
            "category": "test",
            "quality": "A",
            "volume": 10,
            "status": "new",
        },
    )
    point = post(
        "/objects/receiving-points",
        {
            "crm_id": "test-rp-3",
            "name": "Тестовая точка приемки",
            "address": "Москва, Ленинградский проспект, 37",
            "lat": 55.7922525,
            "lon": 37.5408443,
            "point_type": "test",
        },
    )

    print(json.dumps({"burt": burt, "receiving_point": point}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
