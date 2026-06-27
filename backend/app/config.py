from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Rebly AI API"
    database_url: str = "postgresql+psycopg://rebly:rebly@localhost:5432/rebly_ai"
    jwt_secret: str = Field(default="change-me-in-local-env", min_length=16)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7
    frontend_url: AnyHttpUrl = "http://localhost:3000"
    backend_url: AnyHttpUrl = "http://localhost:8000"
    cookie_secure: bool = False

    google_client_id: str = ""
    google_client_secret: str = ""
    google_auth_uri: str = "https://accounts.google.com/o/oauth2/auth"
    google_token_uri: str = "https://oauth2.googleapis.com/token"
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    integration_encryption_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
