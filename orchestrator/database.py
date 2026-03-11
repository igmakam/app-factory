"""
PostgreSQL database layer — asyncpg
Handles: app tracking, pipeline state, credentials, store listings
"""

import asyncpg
import os
import json
from datetime import datetime, timezone

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/appfactory")

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def init_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS apps (
                id          SERIAL PRIMARY KEY,
                name        TEXT NOT NULL,
                bundle_id   TEXT DEFAULT '',
                platform    TEXT DEFAULT 'both',
                status      TEXT DEFAULT 'idea',
                github_repo TEXT DEFAULT '',
                icon_url    TEXT DEFAULT '',
                created_at  TIMESTAMPTZ DEFAULT NOW(),
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS workflow_runs (
                id              SERIAL PRIMARY KEY,
                app_id          INTEGER REFERENCES apps(id) ON DELETE CASCADE,
                temporal_run_id TEXT NOT NULL DEFAULT '',
                workflow_id     TEXT NOT NULL DEFAULT '',
                status          TEXT DEFAULT 'running',
                current_stage   TEXT DEFAULT 'idea',
                started_at      TIMESTAMPTZ DEFAULT NOW(),
                completed_at    TIMESTAMPTZ,
                error           TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS stage_logs (
                id          SERIAL PRIMARY KEY,
                run_id      INTEGER REFERENCES workflow_runs(id) ON DELETE CASCADE,
                stage       TEXT NOT NULL,
                status      TEXT DEFAULT 'pending',
                log_output  TEXT DEFAULT '',
                error       TEXT DEFAULT '',
                started_at  TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                metadata    JSONB DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS credentials (
                id              SERIAL PRIMARY KEY,
                credential_type TEXT NOT NULL,
                credential_data JSONB NOT NULL DEFAULT '{}',
                is_valid        BOOLEAN DEFAULT FALSE,
                validated_at    TIMESTAMPTZ,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(credential_type)
            );

            CREATE TABLE IF NOT EXISTS ideas (
                id              SERIAL PRIMARY KEY,
                app_id          INTEGER REFERENCES apps(id) ON DELETE CASCADE,
                raw_input       TEXT NOT NULL DEFAULT '',
                idea_name       TEXT NOT NULL DEFAULT '',
                product_type    TEXT NOT NULL DEFAULT '',
                overall_score   REAL DEFAULT 0,
                structured_idea JSONB DEFAULT '{}',
                scores          JSONB DEFAULT '{}',
                valuation       JSONB DEFAULT '{}',
                build_brief     JSONB DEFAULT '{}',
                created_at      TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS store_listings (
                id              SERIAL PRIMARY KEY,
                app_id          INTEGER REFERENCES apps(id) ON DELETE CASCADE,
                platform        TEXT NOT NULL DEFAULT 'ios',
                locale          TEXT DEFAULT 'en-US',
                title           TEXT DEFAULT '',
                subtitle        TEXT DEFAULT '',
                description     TEXT DEFAULT '',
                keywords        TEXT DEFAULT '',
                whats_new       TEXT DEFAULT '',
                category        TEXT DEFAULT '',
                aso_score       INTEGER DEFAULT 0,
                aso_tips        JSONB DEFAULT '[]',
                viral_hooks     JSONB DEFAULT '[]',
                generated_by_ai BOOLEAN DEFAULT TRUE,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(app_id, platform, locale)
            );

            CREATE TABLE IF NOT EXISTS build_artifacts (
                id          SERIAL PRIMARY KEY,
                app_id      INTEGER REFERENCES apps(id) ON DELETE CASCADE,
                platform    TEXT NOT NULL,
                version     TEXT DEFAULT '1.0.0',
                build_num   INTEGER DEFAULT 1,
                ipa_url     TEXT DEFAULT '',
                aab_url     TEXT DEFAULT '',
                status      TEXT DEFAULT 'pending',
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id          SERIAL PRIMARY KEY,
                app_id      INTEGER,
                type        TEXT DEFAULT 'info',
                title       TEXT DEFAULT '',
                message     TEXT DEFAULT '',
                is_read     BOOLEAN DEFAULT FALSE,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_app_id ON workflow_runs(app_id);
            CREATE INDEX IF NOT EXISTS idx_stage_logs_run_id ON stage_logs(run_id);
            CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
        """)
    print("✅ Database initialized")
