# watchdog.py — Mac Mini heartbeat monitoring
# POST /heartbeat  — Mini pinguje každých 5 min
# GET  /watchdog/status — stav Mini
# Background task: ak Mini nepošle heartbeat 10 min → Telegram alert

import asyncio
import httpx
import os
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
HEARTBEAT_TIMEOUT_SECONDS = 10 * 60  # 10 minút

# Stav
last_heartbeat: Optional[dict] = None
alert_sent: bool = False
alert_count: int = 0
mini_online: bool = False


def set_mini_online(online: bool):
    global mini_online
    mini_online = online


def get_mini_online() -> bool:
    return mini_online


async def receive_heartbeat(data: dict) -> dict:
    global last_heartbeat, alert_sent, alert_count, mini_online

    prev = last_heartbeat
    last_heartbeat = {"timestamp": datetime.now(timezone.utc), "data": data}

    # Back online po výpadku
    if alert_sent:
        downtime = "?"
        if prev:
            diff = (last_heartbeat["timestamp"] - prev["timestamp"]).seconds // 60
            downtime = str(diff)
        services = _format_services(data.get("services", {}))
        await _send_telegram(f"✅ *Mac Mini ONLINE*\n\nVýpadok trval: ~{downtime} minút\nSlužby: {services}")
        alert_sent = False
        alert_count = 0

    mini_online = True
    logger.info(f"[HEARTBEAT] alive — {last_heartbeat['timestamp'].isoformat()}")
    return {"ok": True}


def get_status() -> dict:
    if not last_heartbeat:
        return {"lastHeartbeat": None, "secondsAgo": None, "status": "unknown", "services": None}

    diff = (datetime.now(timezone.utc) - last_heartbeat["timestamp"]).seconds
    status = "alive" if diff < HEARTBEAT_TIMEOUT_SECONDS else "offline"
    return {
        "lastHeartbeat": last_heartbeat["timestamp"].isoformat(),
        "secondsAgo": diff,
        "status": status,
        "services": last_heartbeat["data"].get("services")
    }


async def watchdog_loop():
    """Beží ako background task — kontroluje každú minútu"""
    global alert_sent, alert_count, mini_online

    while True:
        await asyncio.sleep(60)

        if not last_heartbeat:
            continue

        diff = (datetime.now(timezone.utc) - last_heartbeat["timestamp"]).total_seconds()

        if diff > HEARTBEAT_TIMEOUT_SECONDS:
            mini_online = False
            minutes = int(diff // 60)

            if not alert_sent:
                await _send_offline_alert(minutes)
                alert_sent = True
                alert_count = 1
            elif alert_count == 1 and diff > 20 * 60:
                await _send_escalation_alert(minutes, 1)
                alert_count = 2
            elif alert_count == 2 and diff > 40 * 60:
                await _send_escalation_alert(minutes, 2)
                alert_count = 3
        else:
            mini_online = True


async def _send_offline_alert(minutes: int):
    last_seen = last_heartbeat["timestamp"].isoformat() if last_heartbeat else "nikdy"
    text = f"""🔴 *Mac Mini OFFLINE*

Posledný heartbeat: {last_seen}
Výpadok: ~{minutes} minút

*Čo skúsiť:*

1️⃣ *Tailscale offline?*
`sudo tailscale up`
`ssh marcelkamon@100.82.223.101`

2️⃣ *Mini uspané?*
System Settings → Energy → "Prevent sleeping"

3️⃣ *Heartbeat service padla?*
`launchctl list | grep openclaw`
`launchctl load ~/Library/LaunchAgents/com.openclaw.heartbeat.plist`

4️⃣ *OpenClaw padol?*
`cd ~/openclaw && npm start`

5️⃣ *Reštart všetkého:*
`launchctl unload ~/Library/LaunchAgents/com.openclaw.*.plist`
`launchctl load ~/Library/LaunchAgents/com.openclaw.*.plist`"""
    await _send_telegram(text)


async def _send_escalation_alert(minutes: int, level: int):
    messages = {
        1: f"""🟠 *Mac Mini stále OFFLINE* ({minutes} min)

Tailscale a heartbeat nereagujú.

*Skontroluj fyzicky:*
- Má Mini prúd?
- Je pripojený k internetu?
- Svieti kontrolka?

Fallback Railway backend beží:
https://autolauncher-backend-production.up.railway.app""",
        2: f"""🚨 *Mac Mini OFFLINE {minutes} minút*

OpenClaw nefunguje. Devin tasky pozastavené.

*Posledná možnosť:* Reštartuj Mini cez smart plug (ak máš)."""
    }
    await _send_telegram(messages.get(level, messages[2]))


def _format_services(services: dict) -> str:
    if not services:
        return "N/A"
    return ", ".join(
        f"{'✅' if v == 'running' else '❌'} {k}"
        for k, v in services.items()
    )


async def _send_telegram(text: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.error("[WATCHDOG] Chýba TELEGRAM_BOT_TOKEN alebo TELEGRAM_CHAT_ID")
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"},
                timeout=10
            )
    except Exception as e:
        logger.error(f"[WATCHDOG] Telegram error: {e}")
