from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None
    avatar_url: str | None
    google_connected: bool
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserResponse


class TelegramBotStatus(BaseModel):
    connected: bool
    target_chat_id: str | None = None
    bot_username: str | None = None
    updated_at: datetime | None = None


class IntegrationsResponse(BaseModel):
    telegram_bot: TelegramBotStatus


class TelegramBotConnectRequest(BaseModel):
    bot_token: str = Field(min_length=9, max_length=256)
    target_chat_id: str = Field(min_length=1, max_length=255)


class PublishTelegramRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4096)
    run_id: str | None = Field(default=None, max_length=80)
    source: str | None = Field(default=None, max_length=80)


class PublishTelegramResponse(BaseModel):
    ok: bool
    platform: str = "telegram"
    message_id: int | None = None
    chat_id: str | int | None = None
