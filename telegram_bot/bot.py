"""
App Factory — Telegram Bot
Interface medzi Marcelom a celým pipeline.

Príkazy:
  /new <idea>     — spustí nový workflow
  /status         — zoznam všetkých appiek
  /logs <app_id>  — posledné logy
  /stop <app_id>  — zastaví workflow
  /help           — nápoveda

Autonómny mód: bot rozhoduje sám, pingne len pri skutočnom blockeri.
"""

import os
import asyncio
import logging
import httpx
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://orchestrator:8000")

POLL_INTERVAL = 2  # seconds


# ── Telegram API helpers ───────────────────────────────────────────────────────

async def send_message(chat_id: str, text: str, parse_mode: str = "Markdown"):
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
        )


async def get_updates(offset: int = 0) -> list[dict]:
    async with httpx.AsyncClient(timeout=35.0) as client:
        resp = await client.get(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates",
            params={"offset": offset, "timeout": 30, "allowed_updates": ["message"]}
        )
        if resp.status_code == 200:
            return resp.json().get("result", [])
        return []


# ── Orchestrator API helpers ───────────────────────────────────────────────────

async def create_app(raw_idea: str, platform: str = "both") -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{ORCHESTRATOR_URL}/api/apps",
            json={"raw_idea": raw_idea, "platform": platform}
        )
        return resp.json()


async def get_dashboard() -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{ORCHESTRATOR_URL}/api/dashboard")
        return resp.json()


async def get_app_logs(app_id: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{ORCHESTRATOR_URL}/api/apps/{app_id}/logs")
        return resp.json().get("logs", [])


async def get_app_status(app_id: int) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{ORCHESTRATOR_URL}/api/apps/{app_id}/status")
        if resp.status_code == 200:
            return resp.json()
        return {}


# ── Command handlers ───────────────────────────────────────────────────────────

async def handle_new(chat_id: str, args: str):
    """Spustí nový app workflow."""
    if not args.strip():
        await send_message(chat_id, "❌ Chýba idea. Použitie: `/new <tvoja idea>`")
        return

    # Parse platform flag if present
    platform = "both"
    idea = args.strip()
    if idea.endswith("--ios"):
        platform = "ios"
        idea = idea[:-5].strip()
    elif idea.endswith("--android"):
        platform = "android"
        idea = idea[:-9].strip()

    await send_message(chat_id,
        f"🚀 *Spúšťam pipeline...*\n\n"
        f"💡 Idea: {idea}\n"
        f"📱 Platform: {platform}\n\n"
        f"_Pracujem autonómne — pingnem ťa len pri blockeri._"
    )

    try:
        result = await create_app(idea, platform)
        app_id = result.get("app_id")
        workflow_id = result.get("workflow_id")

        await send_message(chat_id,
            f"✅ *Workflow spustený*\n\n"
            f"🆔 App ID: `{app_id}`\n"
            f"⚙️ Workflow: `{workflow_id}`\n\n"
            f"Stages: idea → validate → plan → code → analyze → test → build → submit\n"
            f"Sleduj: `/logs {app_id}`"
        )
    except Exception as e:
        await send_message(chat_id, f"❌ *Error:* {str(e)}")


async def handle_status(chat_id: str):
    """Zobrazí dashboard."""
    try:
        data = await get_dashboard()
        total = data.get("total_apps", 0)
        by_status = data.get("by_status", {})
        recent = data.get("recent_apps", [])[:5]
        notifications = data.get("notifications", [])

        status_lines = "\n".join(
            f"  • {status}: {count}" for status, count in by_status.items()
        ) or "  (žiadne)"

        recent_lines = "\n".join(
            f"  `{a['id']}` {a['name'][:30]} — _{a['status']}_"
            for a in recent
        ) or "  (žiadne)"

        notif_lines = ""
        if notifications:
            unread = notifications[:3]
            notif_lines = "\n\n*🔔 Notifikácie:*\n" + "\n".join(
                f"  {n['title']}: {n['message'][:60]}"
                for n in unread
            )

        await send_message(chat_id,
            f"📊 *App Factory Dashboard*\n\n"
            f"*Celkom appiek:* {total}\n\n"
            f"*Podľa statusu:*\n{status_lines}\n\n"
            f"*Posledné appky:*\n{recent_lines}"
            f"{notif_lines}"
        )
    except Exception as e:
        await send_message(chat_id, f"❌ Dashboard error: {str(e)}")


async def handle_logs(chat_id: str, args: str):
    """Zobrazí logy pre app."""
    try:
        app_id = int(args.strip())
    except ValueError:
        await send_message(chat_id, "❌ Použitie: `/logs <app_id>`")
        return

    try:
        logs = await get_app_logs(app_id)
        status = await get_app_status(app_id)

        if not logs:
            await send_message(chat_id, f"📋 App `{app_id}`: žiadne logy zatiaľ.")
            return

        stage = status.get("stage", "?")
        wf_status = status.get("status", "?")

        log_lines = []
        for log in logs[-8:]:  # Last 8 stages
            emoji = {"completed": "✅", "failed": "❌", "running": "🔄", "pending": "⏳"}.get(
                log.get("status", ""), "•"
            )
            log_lines.append(f"{emoji} `{log['stage']}` — {log['status']}")
            if log.get("error"):
                log_lines.append(f"   ⚠️ {log['error'][:80]}")

        await send_message(chat_id,
            f"📋 *App `{app_id}` — {wf_status}*\n"
            f"Current stage: `{stage}`\n\n"
            + "\n".join(log_lines)
        )
    except Exception as e:
        await send_message(chat_id, f"❌ Logs error: {str(e)}")


async def handle_help(chat_id: str):
    await send_message(chat_id,
        "🏭 *App Factory*\n\n"
        "*Príkazy:*\n"
        "`/new <idea>` — spustí nový pipeline\n"
        "`/new <idea> --ios` — iba iOS\n"
        "`/new <idea> --android` — iba Android\n"
        "`/status` — dashboard\n"
        "`/logs <id>` — logy appky\n"
        "`/help` — táto správa\n\n"
        "*Autonómny mód:* Bot pracuje sám a pingne ťa len pri blockeri."
    )


# ── Message router ─────────────────────────────────────────────────────────────

async def handle_message(message: dict):
    chat_id = str(message.get("chat", {}).get("id", ""))
    text = message.get("text", "").strip()

    # Security: only respond to authorized chat
    if TELEGRAM_CHAT_ID and chat_id != TELEGRAM_CHAT_ID:
        logger.warning(f"Unauthorized message from chat_id: {chat_id}")
        return

    if not text:
        return

    logger.info(f"Message from {chat_id}: {text[:100]}")

    if text.startswith("/new"):
        await handle_new(chat_id, text[4:].strip())
    elif text.startswith("/status"):
        await handle_status(chat_id)
    elif text.startswith("/logs"):
        await handle_logs(chat_id, text[5:].strip())
    elif text.startswith("/help") or text == "/start":
        await handle_help(chat_id)
    else:
        # Free-form message → treat as new idea
        await send_message(chat_id,
            f"💡 Chceš spustiť pipeline pre: _{text[:100]}_?\n\n"
            f"Odpovedz `/new {text[:50]}` alebo upresni `/help`"
        )


# ── Main polling loop ──────────────────────────────────────────────────────────

async def main():
    if not TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN not set!")
        return

    logger.info("🤖 App Factory Telegram Bot starting...")

    # Startup message
    if TELEGRAM_CHAT_ID:
        await send_message(TELEGRAM_CHAT_ID,
            "🏭 *App Factory online*\n\n"
            "Pracujem autonómne. Pingnem ťa len pri blockeri.\n\n"
            "`/help` — príkazy\n"
            "`/status` — dashboard"
        )

    offset = 0
    while True:
        try:
            updates = await get_updates(offset)
            for update in updates:
                offset = update["update_id"] + 1
                if "message" in update:
                    await handle_message(update["message"])
        except Exception as e:
            logger.error(f"Polling error: {e}")
            await asyncio.sleep(5)
        else:
            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
