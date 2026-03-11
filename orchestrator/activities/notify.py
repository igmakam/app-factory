"""
Activity: Notifications
Telegram + DB notifikácie
"""

import os
import json
import httpx
from dataclasses import dataclass
from temporalio import activity

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")


@dataclass
class NotifyInput:
    app_id: int | None
    type: str  # info | success | warning | error
    message: str


EMOJI = {
    "info": "ℹ️",
    "success": "✅",
    "warning": "⚠️",
    "error": "❌",
}


@activity.defn
async def send_notification(input: NotifyInput) -> bool:
    emoji = EMOJI.get(input.type, "📢")
    text = f"{emoji} *App Factory*\n\n{input.message}"

    # Save to DB
    try:
        from orchestrator.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO notifications (app_id, type, title, message) VALUES ($1, $2, $3, $4)",
                input.app_id, input.type, "Pipeline update", input.message
            )
    except Exception as e:
        activity.logger.warning(f"[notify] DB save failed: {e}")

    # Send Telegram
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={
                        "chat_id": TELEGRAM_CHAT_ID,
                        "text": text,
                        "parse_mode": "Markdown",
                    }
                )
                return resp.status_code == 200
        except Exception as e:
            activity.logger.warning(f"[notify] Telegram send failed: {e}")

    return True
