"""
Build Session Manager — manages parallel app builds (replaces Devin).
Each build = isolated subagent spawned by OpenClaw.
State stored in PostgreSQL for crash-safety.
"""
import asyncio
import os
from datetime import datetime, timezone
from typing import Optional

# Build stage descriptions (user-friendly)
STAGE_DESCRIPTIONS = {
    "queued": "Čaká v rade",
    "validating": "Overujem ideu",
    "generating": "Generujem kód",
    "building": "Budujem appku",
    "deploying": "Nasadzujem",
    "done": "Hotovo",
    "failed": "Zlyhalo",
    "cancelled": "Zrušené",
}

PLATFORM_LIMITS = {
    "ios": int(os.getenv("MAX_IOS_BUILDS", "2")),
    "android": int(os.getenv("MAX_ANDROID_BUILDS", "2")),
    "web": int(os.getenv("MAX_WEB_BUILDS", "3")),
}


async def get_active_count(db, platform: str) -> int:
    """Count active builds for a platform."""
    cursor = await db.execute(
        "SELECT COUNT(*) as cnt FROM build_sessions WHERE platform = ? AND status IN ('validating','generating','building','deploying')",
        (platform,)
    )
    row = await cursor.fetchone()
    return dict(row).get("cnt", 0) if row else 0


async def can_start_build(db, platform: str) -> bool:
    """Check if we can start another build for this platform."""
    active = await get_active_count(db, platform)
    limit = PLATFORM_LIMITS.get(platform, 2)
    return active < limit


async def update_session(db, session_id: int, **kwargs):
    """Update build session fields atomically."""
    kwargs["updated_at"] = datetime.now(timezone.utc)
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [session_id]
    await db.execute(f"UPDATE build_sessions SET {set_clause} WHERE id = ?", values)
    await db.commit()


async def append_log(db, session_id: int, line: str):
    """Append a line to build log."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    cursor = await db.execute("SELECT build_log FROM build_sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    current = dict(row).get("build_log", "") if row else ""
    new_log = current + f"\n[{ts}] {line}" if current else f"[{ts}] {line}"
    await update_session(db, session_id, build_log=new_log)
