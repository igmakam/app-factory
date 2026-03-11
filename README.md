# 🏭 App Factory

> Autonomous mobile app pipeline: idea → validate → code → build → deploy → monetize

Powered by **Temporal.io** + **Claude AI** + **Fastlane** + **App Store Connect / Google Play API**

## Architecture

```
Telegram → OpenClaw (AI orchestrator)
              ↓
         Temporal Workflow (1 per app)
              ↓
    ┌─────────────────────────────┐
    │  Activities:                │
    │  1. idea generation         │ ← Claude Sonnet
    │  2. market validation       │ ← Claude Sonnet
    │  3. task planning           │ ← Claude Sonnet
    │  4. store listing gen       │ ← Claude Sonnet
    │  5. code generation         │ ← Claude Sonnet
    │  6. static analysis         │ ← Claude Haiku + SwiftLint
    │  7. test generation         │ ← Claude Haiku
    │  8. fix loop (max 3x)       │ ← Claude Sonnet
    │  9. build + sign            │ ← Fastlane (workers)
    │  10. store submit           │ ← App Store Connect / GP API
    └─────────────────────────────┘
              ↓
    Mac Mini M4 (ios-worker)
    Render/Hetzner VPS (android-worker)
              ↓
    Telegram report
```

## Stack

| Layer | Technology |
|-------|-----------|
| Orchestration | Temporal.io |
| Database | PostgreSQL (asyncpg) |
| AI | Claude Sonnet/Haiku (Anthropic) |
| Backend | FastAPI + Python 3.12 |
| iOS builds | Fastlane + Xcode (Mac Mini M4) |
| Android builds | Fastlane + Gradle (VPS) |
| Dashboard | Next.js (coming) |
| Monitoring | Grafana + Prometheus |
| Alerts | Telegram bot |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/igmakam/app-factory.git
cd app-factory

# 2. Environment
cp .env.example .env
# Edit .env with your keys

# 3. Start everything
docker-compose up -d

# 4. Check services
# Temporal UI:    http://localhost:8080
# API:            http://localhost:8000
# Grafana:        http://localhost:3001
```

## Workers Setup

### Mac Mini M4 (iOS Worker)
```bash
# On the Mac Mini:
pip install -r requirements.txt
TEMPORAL_HOST=your-temporal-server:7233 python workers/ios_worker.py
```

### VPS (Android Worker)
```bash
# On the VPS (with Java + Android SDK):
pip install -r requirements.txt
TEMPORAL_HOST=your-temporal-server:7233 python workers/android_worker.py
```

## API

```bash
# Start new app pipeline
POST /api/apps
{
  "raw_idea": "A habit tracker that uses AI to suggest optimal habits based on user's lifestyle",
  "platform": "both"
}

# Check status
GET /api/apps/{app_id}/status

# View logs
GET /api/apps/{app_id}/logs

# Send signal (approve/reject)
POST /api/apps/{app_id}/signal
{"action": "approve"}

# Dashboard
GET /api/dashboard
```

## Roadmap

- [x] Core Temporal workflow
- [x] AI activities (idea, validation, planning, codegen, listing)
- [x] Static analysis + fix loop
- [x] Build workers (iOS/Android)
- [x] Store submit (App Store Connect + Google Play)
- [x] Docker Compose + monitoring
- [ ] Next.js dashboard
- [ ] Traffic acquisition module
- [ ] Monetization A/B testing
- [ ] Autolauncher credentials migration
