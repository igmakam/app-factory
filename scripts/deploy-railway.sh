#!/bin/bash
# Railway deployment — spusti keď máš personal token
# Použitie: RAILWAY_TOKEN=xxx ./scripts/deploy-railway.sh

set -e

if [ -z "$RAILWAY_TOKEN" ]; then
  echo "❌ Nastav RAILWAY_TOKEN"
  echo "   Získaj na: railway.app/account/tokens (Personal token)"
  exit 1
fi

export RAILWAY_TOKEN

echo "🚂 Deploying App Factory to Railway..."

# Login check
railway whoami

# Create project
echo "Creating project..."
railway init --name app-factory

# Add PostgreSQL
echo "Adding PostgreSQL..."
railway add --plugin postgresql

# Add Redis (pre Temporal ak treba)
# railway add --plugin redis

# Set environment variables
echo "Setting environment variables..."
railway variables set \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  OPENAI_API_KEY="${OPENAI_API_KEY}" \
  TEMPORAL_HOST="${TEMPORAL_HOST:-localhost:7233}" \
  ALLOWED_ORIGINS="*" \
  JWT_SECRET="$(openssl rand -hex 32)"

# Deploy orchestrator
echo "Deploying orchestrator..."
railway up --service orchestrator

# Get URL
echo ""
echo "✅ Deployment complete!"
railway domain
