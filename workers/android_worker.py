"""
Android Worker — beží na Render/Hetzner VPS
Spúšťa sa: python workers/android_worker.py

Task queue: "android-worker"
Vykonáva: run_build activity pre Android
"""

import asyncio
import os
import logging
from temporalio.client import Client
from temporalio.worker import Worker
from orchestrator.activities.build import run_build

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEMPORAL_HOST = os.getenv("TEMPORAL_HOST", "localhost:7233")
TASK_QUEUE = "android-worker"


async def main():
    logger.info(f"🤖 Android Worker starting — connecting to Temporal at {TEMPORAL_HOST}")
    client = await Client.connect(TEMPORAL_HOST)
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        activities=[run_build],
    )
    logger.info(f"✅ Android Worker ready on queue: {TASK_QUEUE}")
    logger.info("Waiting for Android build tasks...")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
