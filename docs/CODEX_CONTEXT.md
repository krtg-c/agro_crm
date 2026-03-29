1. Общая информация

Проект: геомодуль для системы АгроCRM24.

Цель:

работа с объектами (бурты, точки приёмки)
отображение их на карте
расчет маршрутов между объектами
расчет стоимости перевозки

Проект разрабатывается как отдельный сервис с API.

2. Архитектура
Backend
FastAPI (Python)
SQLAlchemy
PostgreSQL
Сервисы
OSRM → расчет маршрутов (distance)
Nominatim → геокодирование адресов
address_cache → кэш геокодирования
Frontend
React (Vite)
карта (без leaflet на текущий момент или кастомная визуализация)
Инфраструктура
Docker Compose
несколько контейнеров:
api
postgres
osrm
nominatim
3. Основные сущности
1. Burt (бурт)
id
crm_id
name
address
lat
lon
category
quality
volume
status
2. Receiving Point (точка приёмки)
id
crm_id
name
address
lat
lon
point_type
3. Routes Log
from_object_type
from_object_id
to_object_type
to_object_id
from_address
to_address
from_lat
from_lon
to_lat
to_lon
distance_km
cost
4. Address Cache
address
lat
lon
display_name
4. API (ключевые endpoints)
Объекты
POST /objects/burts
POST /objects/receiving-points
GET /map/objects
Маршруты
POST /route/by-address
POST /route/by-object
Служебные
GET /health
5. Как сейчас работает система
Создание объектов
объект создаётся с address
lat/lon часто = null
Геокодирование
происходит только при построении маршрута (/route/by-object)
Проблема
объекты НЕ появляются на карте сразу
появляются только после расчета маршрута
6. Требуемое поведение (ВАЖНО)
При создании объекта:
если нет lat/lon:
вызвать Nominatim
получить координаты
сохранить в БД
записать в address_cache
Результат:
объект сразу имеет координаты
сразу отображается на карте
не зависит от маршрутов
7. Логика маршрутов
/route/by-object
берет координаты объектов
если нет → геокодирует
вызывает OSRM
получает distance

считает cost:

cost = distance_km * rate_rub_per_km

пишет запись в routes_log
8. Ограничения проекта
НЕ используем внешние платные API
всё локально:
OSRM
Nominatim
время маршрута НЕ считаем (ошибка в ТЗ)
только:
distance_km
cost
9. Текущие проблемы
объекты создаются без координат
карта не показывает объекты сразу
геокодирование не там где нужно (в маршрутах вместо создания)
фронт зависит от наличия lat/lon
10. Что нужно реализовать (приоритет)
Приоритет 1
геокодирование при создании объектов
сохранение lat/lon
Приоритет 2
корректное отображение объектов на карте
выбор from/to объектов
Приоритет 3
история маршрутов (routes_log → frontend)
Приоритет 4
подготовка интеграции с Bitrix24
11. Важно для разработки
использовать address_cache (не дергать Nominatim лишний раз)
не дублировать геокодирование
backend — главный источник правды
frontend не должен вычислять координаты
12. Пример проблемы для исправления

Bug:
Objects have lat=null and lon=null after creation.

Expected:
Objects must have coordinates immediately after POST /objects/*

Fix:
Move geocoding logic from route service to object creation endpoints.

13. Текущий статус
backend работает
OSRM работает
Nominatim работает
маршруты считаются
frontend запускается
карта отображается
но:
объекты без координат не отображаются