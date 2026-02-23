#!/usr/bin/env bash
# ============================================================================
# deploy.sh — Run migrations + reload PostgREST schema cache
#
# Usage:
#   ./scripts/deploy.sh                     # uses env vars
#   SUPABASE_DB_URL=... ./scripts/deploy.sh # explicit DB URL
#
# Requirements:
#   - SUPABASE_DB_URL or (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
#   - psql (for direct SQL) OR supabase CLI
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
fail() { echo -e "${RED}[deploy]${NC} $*"; exit 1; }

# ── Step 1: Check prerequisites ──────────────────────────────────────
log "Checking prerequisites..."

if command -v supabase &>/dev/null; then
    HAS_SUPABASE_CLI=true
    log "  supabase CLI: $(supabase --version 2>/dev/null || echo 'available')"
else
    HAS_SUPABASE_CLI=false
    warn "  supabase CLI not found — will use psql if available"
fi

if command -v psql &>/dev/null; then
    HAS_PSQL=true
    log "  psql: available"
else
    HAS_PSQL=false
    warn "  psql not found"
fi

if [ "$HAS_SUPABASE_CLI" = false ] && [ "$HAS_PSQL" = false ]; then
    fail "Neither supabase CLI nor psql found. Install one to run migrations."
fi

# ── Step 2: Push migrations ──────────────────────────────────────────
log "Running migrations..."

if [ "$HAS_SUPABASE_CLI" = true ]; then
    supabase db push --linked 2>/dev/null || {
        warn "supabase db push failed (project may not be linked)"
        warn "Trying migration files directly..."

        if [ "$HAS_PSQL" = true ] && [ -n "${SUPABASE_DB_URL:-}" ]; then
            for f in supabase/migrations/*.sql; do
                log "  Applying: $(basename "$f")"
                psql "$SUPABASE_DB_URL" -f "$f" 2>&1 | tail -1
            done
        else
            fail "Cannot apply migrations: no DB URL and supabase CLI not linked"
        fi
    }
else
    if [ -z "${SUPABASE_DB_URL:-}" ]; then
        fail "SUPABASE_DB_URL required when supabase CLI is not available"
    fi
    for f in supabase/migrations/*.sql; do
        log "  Applying: $(basename "$f")"
        psql "$SUPABASE_DB_URL" -f "$f" 2>&1 | tail -1
    done
fi

# ── Step 3: Reload PostgREST schema cache ────────────────────────────
log "Reloading PostgREST schema cache..."

if [ "$HAS_PSQL" = true ] && [ -n "${SUPABASE_DB_URL:-}" ]; then
    psql "$SUPABASE_DB_URL" -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null && \
        log "  Schema cache reloaded via NOTIFY" || \
        warn "  NOTIFY failed — schema cache may need manual reload"
else
    warn "  Cannot reload schema cache (no psql + DB URL)"
    warn "  Run in Supabase SQL Editor: NOTIFY pgrst, 'reload schema';"
fi

# ── Step 4: Health check ─────────────────────────────────────────────
log "Running health check..."

HEALTH_URL="${APP_URL:-http://localhost:3000}/api/health"

if command -v curl &>/dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log "  Health check passed (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "000" ]; then
        warn "  Health check skipped — app not running at $HEALTH_URL"
    else
        warn "  Health check returned HTTP $HTTP_CODE — check /api/health"
    fi
else
    warn "  curl not found — skipping health check"
fi

# ── Done ─────────────────────────────────────────────────────────────
log "Deploy complete."
