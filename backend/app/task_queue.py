# task_queue.py — In-memory task queue (Railway side)
# Mini si vyzdvihne pending tasky keď príde online

import asyncio
import random
import string
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# In-memory queue (pre produkciu: PostgreSQL)
tasks: list[dict] = []

STALE_TIMEOUT_MINUTES = 15


def _task_id() -> str:
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
    return f"task_{int(datetime.now(timezone.utc).timestamp())}_{suffix}"


def enqueue(task_type: str, payload: dict, source: str = "user") -> dict:
    task = {
        "id": _task_id(),
        "type": task_type,
        "payload": payload,
        "source": source,
        "status": "pending",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "attempts": 0,
        "pickedAt": None,
        "completedAt": None,
        "result": None,
        "error": None,
    }
    tasks.append(task)
    logger.info(f"[QUEUE] Nový task: {task['id']} ({task_type})")
    return task


def dequeue() -> list[dict]:
    """Mini vyzdvihne všetky pending tasky"""
    pending = [t for t in tasks if t["status"] == "pending"]
    for t in pending:
        t["status"] = "processing"
        t["attempts"] += 1
        t["pickedAt"] = datetime.now(timezone.utc).isoformat()
    logger.info(f"[QUEUE] Mini vyzdvihol {len(pending)} taskov")
    return pending


def complete(task_id: str, result: Optional[dict], error: Optional[str]) -> bool:
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        return False
    task["status"] = "failed" if error else "done"
    task["result"] = result
    task["error"] = error
    task["completedAt"] = datetime.now(timezone.utc).isoformat()
    logger.info(f"[QUEUE] Task {task_id}: {task['status']}")
    return True


def retry(task_id: str) -> bool:
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        return False
    task["status"] = "pending"
    task["error"] = None
    logger.info(f"[QUEUE] Task {task_id} reset na pending")
    return True


def status_summary() -> dict:
    return {
        "pending": sum(1 for t in tasks if t["status"] == "pending"),
        "processing": sum(1 for t in tasks if t["status"] == "processing"),
        "done": sum(1 for t in tasks if t["status"] == "done"),
        "failed": sum(1 for t in tasks if t["status"] == "failed"),
        "tasks": tasks[-20:],
    }


async def stale_task_recovery_loop():
    """Obnoví 'processing' tasky ak Mini padol počas vykonávania"""
    while True:
        await asyncio.sleep(5 * 60)  # každých 5 minút
        now = datetime.now(timezone.utc)
        for t in tasks:
            if t["status"] == "processing" and t["pickedAt"]:
                picked = datetime.fromisoformat(t["pickedAt"])
                if (now - picked) > timedelta(minutes=STALE_TIMEOUT_MINUTES):
                    logger.info(f"[QUEUE] Stale task {t['id']} → reset na pending")
                    t["status"] = "pending"
                    t["pickedAt"] = None
