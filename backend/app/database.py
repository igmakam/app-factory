"""
Database layer — PostgreSQL via asyncpg (migrated from SQLite)
"""

import asyncpg
import os
import bcrypt
from typing import AsyncGenerator

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/autolauncher")


class FakeRow(dict):
    """Emuluje aiosqlite Row správanie pre asyncpg kompatibilitu."""
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


class DBWrapper:
    """
    Wrapper ktorý emuluje aiosqlite Connection API nad asyncpg.
    Umožňuje minimálne zmeny v main.py.
    """
    def __init__(self, conn: asyncpg.Connection):
        self._conn = conn
        self._in_transaction = False

    async def execute(self, sql: str, *args):
        sql = _convert_sql(sql)
        return await self._conn.execute(sql, *args)

    async def executescript(self, script: str):
        await self._conn.execute(script)

    async def executemany(self, sql: str, args_list):
        sql = _convert_sql(sql)
        await self._conn.executemany(sql, args_list)

    async def fetchone(self, sql: str, *args) -> FakeRow | None:
        sql = _convert_sql(sql)
        row = await self._conn.fetchrow(sql, *args)
        return FakeRow(dict(row)) if row else None

    async def fetchall(self, sql: str, *args) -> list[FakeRow]:
        sql = _convert_sql(sql)
        rows = await self._conn.fetch(sql, *args)
        return [FakeRow(dict(r)) for r in rows]

    async def commit(self):
        pass  # asyncpg auto-commits

    async def close(self):
        pass  # managed by pool

    def row_factory(self, *args):
        pass


class CursorWrapper:
    """Emuluje aiosqlite Cursor."""
    def __init__(self, conn: asyncpg.Connection):
        self._conn = conn
        self.lastrowid = None

    async def execute(self, sql: str, args=()):
        sql = _convert_sql(sql)
        # Check if INSERT — need RETURNING id
        if sql.strip().upper().startswith("INSERT") and "RETURNING" not in sql.upper():
            sql = sql.rstrip(";") + " RETURNING id"
            result = await self._conn.fetchval(sql, *args)
            self.lastrowid = result
        else:
            await self._conn.execute(sql, *args)
        return self

    async def fetchone(self) -> FakeRow | None:
        return None

    async def fetchall(self) -> list[FakeRow]:
        return []


class AsyncDBContext:
    """Context manager vrátený get_db()."""
    def __init__(self, conn: asyncpg.Connection):
        self._conn = conn
        self._cursor = None
        self.row_factory = None

    async def execute(self, sql: str, args=()):
        cursor = CursorWrapper(self._conn)
        await cursor.execute(sql, args)
        return cursor

    async def executescript(self, script: str):
        # Split na jednotlivé statements
        statements = [s.strip() for s in script.split(";") if s.strip()]
        for stmt in statements:
            try:
                await self._conn.execute(stmt)
            except Exception as e:
                if "already exists" not in str(e).lower():
                    raise

    async def fetchone(self):
        return None

    async def fetchall(self):
        return []

    async def commit(self):
        pass

    async def close(self):
        pass

    def __setattr__(self, name, value):
        object.__setattr__(self, name, value)


class RealDB:
    """
    Plnohodnotný DB objekt pre get_db() dependency.
    Kompatibilný s aiosqlite API ktoré používa main.py.
    """
    def __init__(self, conn: asyncpg.Connection):
        self._conn = conn
        self.row_factory = None  # ignorujeme

    async def execute(self, sql: str, args=()):
        sql_pg = _convert_sql(sql)
        # INSERT → pridaj RETURNING id
        if sql_pg.strip().upper().startswith("INSERT") and "RETURNING" not in sql_pg.upper():
            sql_pg = sql_pg.rstrip(";") + " RETURNING id"
            rid = await self._conn.fetchval(sql_pg, *args)
            return _FakeCursor(rid)
        else:
            await self._conn.execute(sql_pg, *args)
            return _FakeCursor(None)

    async def executescript(self, script: str):
        statements = [s.strip() for s in script.split(";") if s.strip()]
        for stmt in statements:
            try:
                await self._conn.execute(stmt)
            except Exception as e:
                if "already exists" not in str(e).lower():
                    pass  # ignoruj chyby pri init

    async def commit(self):
        pass  # auto-commit

    async def close(self):
        pass

    async def fetchone(self):
        return None


class _FakeCursor:
    def __init__(self, lastrowid):
        self.lastrowid = lastrowid

    async def fetchone(self):
        return None


def _convert_sql(sql: str) -> str:
    """Konvertuje SQLite syntax na PostgreSQL."""
    import re

    # ? → $1, $2, ...
    count = [0]
    def replace_placeholder(m):
        count[0] += 1
        return f"${count[0]}"
    sql = re.sub(r'\?', replace_placeholder, sql)

    # SQLite specific → PostgreSQL
    sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    sql = sql.replace("INTEGER DEFAULT 0", "INTEGER DEFAULT 0")
    sql = sql.replace("PRAGMA journal_mode=WAL", "SELECT 1")
    sql = sql.replace("PRAGMA foreign_keys=ON", "SELECT 1")
    sql = re.sub(r"datetime\('now'\)", "NOW()", sql, flags=re.IGNORECASE)
    sql = re.sub(r"CURRENT_TIMESTAMP", "NOW()", sql, flags=re.IGNORECASE)

    # ON CONFLICT ... DO UPDATE SET (SQLite upsert je kompatibilný s PG)
    return sql


async def get_db():
    """FastAPI dependency — vracia DB connection."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        db = RealDB(conn)
        try:
            yield db
        finally:
            pass


async def init_db():
    """Inicializuje databázu — vytvára tabuľky."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        db = RealDB(conn)

        # Spusti schema zo SQLite verzie (prekonvertovaná na PG)
        schema = _get_schema()
        statements = [s.strip() for s in schema.split(";") if s.strip()]
        for stmt in statements:
            try:
                await conn.execute(stmt)
            except Exception as e:
                if "already exists" not in str(e).lower():
                    pass  # ignoruj pri opakovanom init

        # Pridaj nové stĺpce ak neexistujú (safe migrations)
        safe_alters = [
            "ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS block_type TEXT DEFAULT ''",
            "ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0",
        ]
        for alter in safe_alters:
            try:
                await conn.execute(alter)
            except Exception:
                pass

        # Seed default user
        existing = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1",
            os.getenv("SEED_EMAIL", "marcel.kamon@gmail.com")
        )
        if not existing:
            seed_email = os.getenv("SEED_EMAIL", "marcel.kamon@gmail.com")
            seed_password = os.getenv("SEED_PASSWORD", "Admin123!")
            pw_hash = bcrypt.hashpw(seed_password.encode(), bcrypt.gensalt()).decode()
            await conn.execute(
                "INSERT INTO users (email, password_hash, full_name, created_at) VALUES ($1, $2, $3, NOW())",
                seed_email, pw_hash, "Marcel Kamon"
            )

    print("✅ Database initialized (PostgreSQL)")


def _get_schema() -> str:
    return """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL DEFAULT '',
            avatar_url TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS credentials (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            credential_type TEXT NOT NULL,
            credential_data TEXT NOT NULL DEFAULT '{}',
            is_valid INTEGER DEFAULT 0,
            validated_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, credential_type)
        );

        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            name TEXT NOT NULL,
            bundle_id TEXT DEFAULT '',
            github_repo TEXT DEFAULT '',
            platform TEXT DEFAULT 'both',
            status TEXT DEFAULT 'setup',
            icon_url TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS questionnaire_answers (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            question_key TEXT NOT NULL,
            answer_text TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, question_key)
        );

        CREATE TABLE IF NOT EXISTS store_listings (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            platform TEXT NOT NULL DEFAULT 'ios',
            locale TEXT DEFAULT 'en-US',
            title TEXT DEFAULT '',
            subtitle TEXT DEFAULT '',
            description TEXT DEFAULT '',
            keywords TEXT DEFAULT '',
            whats_new TEXT DEFAULT '',
            promotional_text TEXT DEFAULT '',
            category TEXT DEFAULT '',
            secondary_category TEXT DEFAULT '',
            pricing_model TEXT DEFAULT 'free',
            price TEXT DEFAULT '0',
            privacy_url TEXT DEFAULT '',
            support_url TEXT DEFAULT '',
            marketing_url TEXT DEFAULT '',
            aso_score INTEGER DEFAULT 0,
            aso_tips TEXT DEFAULT '[]',
            viral_hooks TEXT DEFAULT '[]',
            growth_strategies TEXT DEFAULT '[]',
            competitor_analysis TEXT DEFAULT '',
            generated_by_ai INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, platform, locale)
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            status TEXT DEFAULT 'pending',
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS pipeline_steps (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
            step_name TEXT NOT NULL,
            step_order INTEGER DEFAULT 0,
            platform TEXT DEFAULT 'both',
            status TEXT DEFAULT 'pending',
            log_output TEXT DEFAULT '',
            error_message TEXT DEFAULT '',
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            block_type TEXT DEFAULT '',
            retry_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ai_generation_logs (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            generation_type TEXT NOT NULL,
            prompt_summary TEXT DEFAULT '',
            result_summary TEXT DEFAULT '',
            tokens_used INTEGER DEFAULT 0,
            model_used TEXT DEFAULT 'gpt-4o-mini',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS project_strategy (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            strategy_data TEXT DEFAULT '{}',
            monetization_data TEXT DEFAULT '{}',
            metrics_data TEXT DEFAULT '{}',
            mistakes_data TEXT DEFAULT '[]',
            screenshot_tips TEXT DEFAULT '[]',
            onboarding_tips TEXT DEFAULT '[]',
            tokens_used INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id)
        );

        CREATE TABLE IF NOT EXISTS campaign_content (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            content_type TEXT NOT NULL,
            content_data TEXT DEFAULT '{}',
            tokens_used INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, content_type)
        );

        CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            key TEXT NOT NULL,
            value TEXT DEFAULT '',
            UNIQUE(user_id, key)
        );

        CREATE TABLE IF NOT EXISTS setup_feedback (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            credential_type TEXT NOT NULL,
            message TEXT DEFAULT '',
            screenshot_base64 TEXT DEFAULT '',
            status TEXT DEFAULT 'new',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS helixa_ideas (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            raw_input TEXT NOT NULL,
            idea_name TEXT NOT NULL,
            product_type TEXT NOT NULL,
            overall_score REAL NOT NULL DEFAULT 0,
            structured_idea TEXT NOT NULL DEFAULT '{}',
            scores TEXT NOT NULL DEFAULT '{}',
            valuation TEXT NOT NULL DEFAULT '{}',
            build_brief TEXT NOT NULL DEFAULT '{}',
            autonomy TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS helixa_synthesized_ideas (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            source_idea_ids TEXT NOT NULL DEFAULT '[]',
            source_idea_names TEXT NOT NULL DEFAULT '[]',
            concept TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending',
            user_comment TEXT NOT NULL DEFAULT '',
            ai_revision TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS helixa_experimental_ideas (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            idea_name TEXT NOT NULL,
            product_type TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            overall_score REAL NOT NULL DEFAULT 0,
            structured_idea TEXT NOT NULL DEFAULT '{}',
            scores TEXT NOT NULL DEFAULT '{}',
            generation_number INTEGER NOT NULL DEFAULT 1,
            learning_note TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            user_comment TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            type TEXT NOT NULL DEFAULT 'info',
            title TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS project_settings (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, key)
        );

        CREATE TABLE IF NOT EXISTS planter_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            idea_id INTEGER,
            idea_name TEXT NOT NULL DEFAULT '',
            devin_session_id TEXT NOT NULL DEFAULT '',
            session_url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'running',
            title TEXT NOT NULL DEFAULT '',
            pr_url TEXT NOT NULL DEFAULT '',
            frontend_url TEXT NOT NULL DEFAULT '',
            backend_url TEXT NOT NULL DEFAULT '',
            repo_url TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """
