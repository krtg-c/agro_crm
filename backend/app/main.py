from fastapi import FastAPI
from app.core.config import settings
from app.api.health import router as health_router
from app.api.route import router as route_router


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    app.include_router(health_router)
    app.include_router(route_router)
    return app


app = create_app()
