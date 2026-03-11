"""
App Factory — FastAPI main + Temporal worker
"""

import asyncio
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from temporalio.client import Client as TemporalClient
from temporalio.worker import Worker

from orchestrator.database import init_db, get_pool
from orchestrator.workflows.app_workflow import AppWorkflow
from orchestrator.activities.idea import generate_idea
from orchestrator.activities.validation import validate_market
from orchestrator.activities.planner import plan_tasks
from orchestrator.activities.codegen import generate_code
from orchestrator.activities.analysis import run_static_analysis
from orchestrator.activities.tests import run_tests
from orchestrator.activities.fix_loop import fix_code
from orchestrator.activities.listing_gen import generate_listing
from orchestrator.activities.store_submit import submit_to_stores
from orchestrator.activities.notify import send_notification

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEMPORAL_HOST = os.getenv("TEMPORAL_HOST", "localhost:7233")
TEMPORAL_TASK_QUEUE = "app-factory-main"

temporal_client: TemporalClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global temporal_client
    await init_db()
    logger.info("✅ Database initialized")

    try:
        temporal_client = await TemporalClient.connect(TEMPORAL_HOST)
        logger.info(f"✅ Connected to Temporal at {TEMPORAL_HOST}")
    except Exception as e:
        logger.warning(f"⚠️ Temporal not available: {e} — running without workflow engine")

    yield

    if temporal_client:
        await temporal_client.close()


app = FastAPI(title="App Factory Orchestrator", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "temporal": temporal_client is not None}


# ── Apps ──────────────────────────────────────────────────────────────────────

class CreateAppRequest(BaseModel):
    raw_idea: str
    platform: str = "both"  # ios | android | both
    name: str = ""


@app.post("/api/apps")
async def create_app(req: CreateAppRequest):
    """Vytvorí novú appku a spustí Temporal workflow."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        app_id = await conn.fetchval(
            "INSERT INTO apps (name, platform, status) VALUES ($1, $2, 'idea') RETURNING id",
            req.name or req.raw_idea[:50],
            req.platform,
        )

    if temporal_client:
        handle = await temporal_client.start_workflow(
            AppWorkflow.run,
            {"app_id": app_id, "raw_idea": req.raw_idea, "platform": req.platform},
            id=f"app-{app_id}",
            task_queue=TEMPORAL_TASK_QUEUE,
        )
        workflow_id = handle.id
        run_id = handle.result_run_id

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO workflow_runs (app_id, temporal_run_id, workflow_id) VALUES ($1, $2, $3)",
                app_id, run_id or "", workflow_id
            )

        return {"app_id": app_id, "workflow_id": workflow_id, "status": "started"}
    else:
        return {"app_id": app_id, "workflow_id": None, "status": "created", "warning": "Temporal not connected"}


@app.get("/api/apps")
async def list_apps():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM apps ORDER BY created_at DESC LIMIT 50")
    return [dict(r) for r in rows]


@app.get("/api/apps/{app_id}")
async def get_app(app_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM apps WHERE id = $1", app_id)
        if not row:
            raise HTTPException(status_code=404, detail="App not found")
        runs = await conn.fetch(
            "SELECT * FROM workflow_runs WHERE app_id = $1 ORDER BY started_at DESC LIMIT 5",
            app_id
        )
    return {"app": dict(row), "runs": [dict(r) for r in runs]}


@app.get("/api/apps/{app_id}/logs")
async def get_app_logs(app_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        run = await conn.fetchrow(
            "SELECT id FROM workflow_runs WHERE app_id = $1 ORDER BY started_at DESC LIMIT 1",
            app_id
        )
        if not run:
            return {"logs": []}
        logs = await conn.fetch(
            "SELECT * FROM stage_logs WHERE run_id = $1 ORDER BY started_at",
            run["id"]
        )
    return {"logs": [dict(l) for l in logs]}


@app.post("/api/apps/{app_id}/signal")
async def send_signal(app_id: int, data: dict):
    """Pošle signál do bežiaceho workflow (napr. user approval)."""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal not connected")

    handle = temporal_client.get_workflow_handle(f"app-{app_id}")
    await handle.signal(AppWorkflow.user_signal, data)
    return {"status": "signal_sent"}


@app.get("/api/apps/{app_id}/status")
async def get_workflow_status(app_id: int):
    """Získa live status z Temporal."""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal not connected")

    try:
        handle = temporal_client.get_workflow_handle(f"app-{app_id}")
        status = await handle.query(AppWorkflow.get_status)
        return status
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
async def dashboard():
    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM apps")
        by_status = await conn.fetch("SELECT status, COUNT(*) as cnt FROM apps GROUP BY status")
        recent = await conn.fetch("SELECT * FROM apps ORDER BY created_at DESC LIMIT 10")
        notifications = await conn.fetch(
            "SELECT * FROM notifications WHERE is_read = FALSE ORDER BY created_at DESC LIMIT 20"
        )
    return {
        "total_apps": total,
        "by_status": {r["status"]: r["cnt"] for r in by_status},
        "recent_apps": [dict(r) for r in recent],
        "notifications": [dict(n) for n in notifications],
    }


# ── Worker runner (spúšťa sa samostatne) ─────────────────────────────────────

async def run_worker():
    """Spustí Temporal worker pre main task queue."""
    client = await TemporalClient.connect(TEMPORAL_HOST)
    worker = Worker(
        client,
        task_queue=TEMPORAL_TASK_QUEUE,
        workflows=[AppWorkflow],
        activities=[
            generate_idea, validate_market, plan_tasks,
            generate_code, run_static_analysis, run_tests,
            fix_code, generate_listing, submit_to_stores,
            send_notification,
        ],
    )
    logger.info(f"🚀 Worker started on queue: {TEMPORAL_TASK_QUEUE}")
    await worker.run()


if __name__ == "__main__":
    import sys
    if "--worker" in sys.argv:
        asyncio.run(run_worker())
    else:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8000)
