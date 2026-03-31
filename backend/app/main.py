from fastapi import FastAPI
from app.core.config import settings
from app.api.health import router as health_router
from app.api.route import router as route_router
from app.core.db import Base, engine
import app.models 
from app.api.objects import router as objects_router
from app.api.map import router as map_router
from app.api.history import router as history_router
from fastapi.middleware.cors import CORSMiddleware


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    app.include_router(health_router)
    app.include_router(route_router)
    Base.metadata.create_all(bind=engine)
    app.include_router(objects_router)
    app.include_router(map_router)
    app.include_router(history_router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://172.18.0.1:5173",
            "http://172.18.0.1:5174",
            "http://10.255.255.254:5173",
            "http://10.255.255.254:5174",
        ],
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+):\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


app = create_app()
