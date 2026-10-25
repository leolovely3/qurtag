#!/usr/bin/env bash
# The local end-to-end test of QuR Tag on its own backend.
#
#   bash scripts/qurtag/run-local.sh          (npm run test:e2e)
#
# Starts Supabase's Postgres 17 image as a stand-in for the shared project (container
# qurtag-e2e-pg on 127.0.0.1:56850, removed at the end), adds decoy apps
# (scripts/qurtag/decoys.sql), applies db/qurtag.sql and db/logins.sql exactly as
# the rollout does (as `postgres`, which is not a superuser there, with fresh passwords
# sent as SCRAM verifiers), starts the four server functions (with email off, as in production today: accounts are confirmed at once) on 127.0.0.1:56851, and
# runs scripts/qurtag/e2e.test.mjs. QURTAG_E2E_KEEP=1 leaves the database running
# afterwards. QURTAG_LOCAL_SERVE=1 skips the tests and keeps the server functions up for
# trying the app by hand (npm run dev:local).
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE="${QURTAG_E2E_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.002}"
NAME=qurtag-e2e-pg
PG_PORT=56850
API_PORT=56851
if [[ "${QURTAG_LOCAL_SERVE:-}" == 1 ]]; then
  # Its own container and ports, so the tests can run beside it.
  NAME=qurtag-dev-pg
  PG_PORT=56860
  API_PORT=56861
fi
WORK="$(mktemp -d)"
PW="$(openssl rand -hex 16)"
server_pid=""

cleanup() {
  [[ -n "$server_pid" ]] && kill "$server_pid" 2>/dev/null || true
  if [[ "${QURTAG_E2E_KEEP:-}" != 1 ]]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PW" -p "127.0.0.1:$PG_PORT:5432" "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  PGPASSWORD="$PW" psql "host=127.0.0.1 port=$PG_PORT user=postgres dbname=postgres" -XAtc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
sleep 3

ADMIN="postgres://postgres:$PW@127.0.0.1:$PG_PORT/postgres"
PLATFORM="postgres://supabase_admin:$PW@127.0.0.1:$PG_PORT/postgres"
AUTH_PW="$(openssl rand -hex 24)"; DATA_PW="$(openssl rand -hex 24)"; SERVER_PW="$(openssl rand -hex 24)"
FACTORY_TOKEN="$(openssl rand -hex 24)"

psql "$PLATFORM" -X -q -v ON_ERROR_STOP=1 -f scripts/qurtag/decoys.sql
psql "$ADMIN" -X -q -v ON_ERROR_STOP=1 -1 -f db/qurtag.sql
AUTH_PW="$AUTH_PW" DATA_PW="$DATA_PW" SERVER_PW="$SERVER_PW" FACTORY_TOKEN="$FACTORY_TOKEN" ADMIN="$ADMIN" \
  node scripts/qurtag/apply-logins.mjs
echo "schema and logins applied"

export QURTAG_AUTH_URL="http://127.0.0.1:$API_PORT"
export QURTAG_DATABASE_URL="postgres://qurtag_auth:$AUTH_PW@127.0.0.1:$PG_PORT/postgres"
export QURTAG_DATABASE_URL_DATA="postgres://qurtag_authenticator:$DATA_PW@127.0.0.1:$PG_PORT/postgres"
export QURTAG_DATABASE_URL_SERVER="postgres://qurtag_server:$SERVER_PW@127.0.0.1:$PG_PORT/postgres"
export QURTAG_AUTH_SECRET="$(openssl rand -hex 32)"
export CRON_SECRET="$(openssl rand -hex 16)"
export QURTAG_LOCAL_PORT=$API_PORT

if [[ "${QURTAG_LOCAL_SERVE:-}" == 1 ]]; then
  # Try the app by hand: the server stays up until Ctrl-C, then everything is removed.
  # In another Terminal: QURTAG_API_PROXY=http://127.0.0.1:$API_PORT npm run dev
  echo "server functions on http://127.0.0.1:$API_PORT; run the app with QURTAG_API_PROXY=http://127.0.0.1:$API_PORT npm run dev"
  export QURTAG_AUTH_URL="http://localhost:5173"
  npx tsx scripts/qurtag/local-server.ts
  exit 0
fi

npx tsx scripts/qurtag/local-server.ts > "$WORK/server.log" 2>&1 &
server_pid=$!
for _ in $(seq 1 40); do
  curl -s "http://127.0.0.1:$API_PORT/api/auth/ok" >/dev/null 2>&1 && break
  sleep 0.5
done

QURTAG_TEST_BASE="http://127.0.0.1:$API_PORT" \
QURTAG_TEST_ADMIN_DB="$ADMIN" \
QURTAG_TEST_LOGIN_DB_AUTH="$QURTAG_DATABASE_URL" \
QURTAG_TEST_LOGIN_DB_DATA="$QURTAG_DATABASE_URL_DATA" \
QURTAG_TEST_LOGIN_DB_SERVER="$QURTAG_DATABASE_URL_SERVER" \
QURTAG_TEST_FACTORY_TOKEN="$FACTORY_TOKEN" \
  npx tsx scripts/qurtag/e2e.test.mjs || { echo "--- server log"; tail -40 "$WORK/server.log"; exit 1; }
