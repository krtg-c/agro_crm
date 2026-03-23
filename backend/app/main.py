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
    allow_origins=["http://localhost:5173","http://172.18.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],)
    return app


app = create_app()
