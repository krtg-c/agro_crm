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
    optimal_burt = post(
        "/objects/burts",
        {
            "crm_id": "demo-optimal-burt-1",
            "name": "Демо бурт для оптимального маршрута",
            "address": "Москва, 1-я Тверская-Ямская улица, 7",
            "lat": 55.771056,
            "lon": 37.595092,
            "category": "Пшеница",
            "quality": "3 класс",
            "volume": 1200,
            "status": "активен",
        },
    )
    optimal_point = post(
        "/objects/receiving-points",
        {
            "crm_id": "demo-optimal-point-1",
            "name": "Демо точка приемки рядом",
            "address": "Москва, Ленинградский проспект, 11",
            "lat": 55.782054,
            "lon": 37.576457,
            "point_type": "элеватор",
        },
    )
    fallback_point = post(
        "/objects/receiving-points",
        {
            "crm_id": "demo-optimal-point-far-1",
            "name": "Демо точка приемки далеко",
            "address": "Москва, Каширское шоссе, 61к3А",
            "lat": 55.621216,
            "lon": 37.712381,
            "point_type": "элеватор",
        },
    )

    print(
        json.dumps(
            {
                "optimal_burt": optimal_burt,
                "optimal_receiving_point": optimal_point,
                "fallback_receiving_point": fallback_point,
                "how_to_test": {
                    "source_type": "burt",
                    "source_id": optimal_burt["id"],
                    "expected_best_target_id": optimal_point["id"],
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
