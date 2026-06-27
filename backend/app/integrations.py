from __future__ import annotations

import base64
import hashlib
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.models import TelegramBotIntegration, User
from app.schemas import (
    IntegrationsResponse,
    PublishTelegramRequest,
    PublishTelegramResponse,
    TelegramBotConnectRequest,
    TelegramBotStatus,
)
from app.security import get_current_user

router = APIRouter(tags=["integrations"])


def integration_fernet() -> Fernet:
    settings = get_settings()
    secret = settings.integration_encryption_secret or settings.jwt_secret
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    return integration_fernet().encrypt(token.encode("utf-8")).decode("ascii")


def decrypt_token(value: str) -> str:
    try:
        return integration_fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Telegram integration token cannot be decrypted",
        ) from exc


def telegram_status(integration: TelegramBotIntegration | None) -> TelegramBotStatus:
    if not integration:
        return TelegramBotStatus(connected=False)
    return TelegramBotStatus(
        connected=True,
        target_chat_id=integration.target_chat_id,
        bot_username=integration.bot_username,
        updated_at=integration.updated_at,
    )


def get_telegram_integration(db: Session, user_id: int) -> TelegramBotIntegration | None:
    return db.scalar(select(TelegramBotIntegration).where(TelegramBotIntegration.user_id == user_id))


def verify_telegram_bot(token: str) -> str | None:
    try:
        with httpx.Client(timeout=15) as client:
            response = client.get(f"https://api.telegram.org/bot{token}/getMe")
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram bot verification failed",
        ) from exc
    try:
        payload = response.json() if response.content else {}
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram bot verification returned an invalid response",
        ) from exc
    if response.status_code >= 400 or not payload.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram bot token is invalid",
        )
    result = payload.get("result") or {}
    username = result.get("username")
    return str(username) if username else None


def send_telegram_message(token: str, chat_id: str, text: str) -> dict[str, Any]:
    try:
        with httpx.Client(timeout=20) as client:
            response = client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "disable_web_page_preview": False,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Telegram publish request failed",
        ) from exc
    try:
        payload = response.json() if response.content else {}
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Telegram publish returned an invalid response",
        ) from exc
    if response.status_code >= 400 or not payload.get("ok"):
        description = str(payload.get("description") or "Telegram rejected the message")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=description[:300])
    result = payload.get("result") or {}
    return result if isinstance(result, dict) else {}


@router.get("/api/integrations", response_model=IntegrationsResponse)
def integrations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntegrationsResponse:
    return IntegrationsResponse(telegram_bot=telegram_status(get_telegram_integration(db, user.id)))


@router.post("/api/integrations/telegram-bot", response_model=IntegrationsResponse)
def connect_telegram_bot(
    payload: TelegramBotConnectRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntegrationsResponse:
    token = payload.bot_token.strip()
    target_chat_id = payload.target_chat_id.strip()
    bot_username = verify_telegram_bot(token)
    integration = get_telegram_integration(db, user.id)
    if integration:
        integration.encrypted_bot_token = encrypt_token(token)
        integration.target_chat_id = target_chat_id
        integration.bot_username = bot_username
    else:
        integration = TelegramBotIntegration(
            user_id=user.id,
            encrypted_bot_token=encrypt_token(token),
            target_chat_id=target_chat_id,
            bot_username=bot_username,
        )
        db.add(integration)
    db.commit()
    db.refresh(integration)
    return IntegrationsResponse(telegram_bot=telegram_status(integration))


@router.post("/api/publish/telegram", response_model=PublishTelegramResponse)
def publish_telegram(
    payload: PublishTelegramRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PublishTelegramResponse:
    integration = get_telegram_integration(db, user.id)
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram Bot is not connected",
        )
    token = decrypt_token(integration.encrypted_bot_token)
    result = send_telegram_message(token, integration.target_chat_id, payload.text.strip())
    chat = result.get("chat") if isinstance(result.get("chat"), dict) else {}
    return PublishTelegramResponse(
        ok=True,
        message_id=result.get("message_id"),
        chat_id=chat.get("id") or integration.target_chat_id,
    )
