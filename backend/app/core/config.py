from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "agro-geo-api"
    environment: str = "dev"

    # DB
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "agro_geo"
    postgres_user: str = "agro"
    postgres_password: str = "agro"
    osrm_base_url: str = "http://osrm:5000"
    geocoder_base_url: str = "http://nominatim:8080"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
