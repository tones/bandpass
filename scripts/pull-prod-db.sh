#!/usr/bin/env bash
#
# pull-prod-db.sh — dump the bandpass production Postgres on Fly and restore
# it into a local Postgres database. Use this whenever you need a fresh copy
# of prod for local development.
#
# Requirements:
#   * flyctl installed and authenticated (`fly auth login`)
#   * Local Postgres of the SAME MAJOR VERSION as prod (currently 17). If
#     mismatched, pg_dump aborts with "server version mismatch".
#   * jq (only if you want fancy parsing; this script avoids it)
#
# Usage:
#   ./scripts/pull-prod-db.sh                 # restores into bandpass_dev
#   LOCAL_DB=otherdb ./scripts/pull-prod-db.sh
#
set -euo pipefail

WEB_APP="bandpass"
PG_APP="bandpass-db"
LOCAL_PORT="${LOCAL_PORT:-5433}"
LOCAL_DB="${LOCAL_DB:-bandpass_dev}"
DUMP_FILE="${DUMP_FILE:-/tmp/${PG_APP}_dump.sql}"

# Prefer the Homebrew-installed Postgres binaries if present, since macOS
# ships without psql/pg_dump on PATH.
for v in 17 16; do
  if [[ -x "/opt/homebrew/opt/postgresql@${v}/bin/pg_dump" ]]; then
    PG_BIN="/opt/homebrew/opt/postgresql@${v}/bin"
    break
  fi
done
PG_BIN="${PG_BIN:-}"
if [[ -z "$PG_BIN" ]]; then
  if command -v pg_dump >/dev/null; then
    PG_BIN="$(dirname "$(command -v pg_dump)")"
  else
    echo "error: no pg_dump found. Install postgresql@17 (brew install postgresql@17)." >&2
    exit 1
  fi
fi

echo "==> Using Postgres binaries from: $PG_BIN"
"$PG_BIN/pg_dump" --version

# --- 1. Verify flyctl auth ---------------------------------------------------
if ! fly auth whoami >/dev/null 2>&1; then
  echo "error: flyctl is not authenticated. Run 'fly auth login' first." >&2
  exit 1
fi
echo "==> Logged in as $(fly auth whoami)"

# --- 2. Fetch prod DATABASE_URL from the web app's secrets -------------------
echo "==> Reading DATABASE_URL from $WEB_APP via fly ssh"
PROD_URL="$(fly ssh console -a "$WEB_APP" -C 'printenv DATABASE_URL' 2>&1 \
  | grep -E '^postgres://' | tr -d '\r' | tail -1)"
if [[ -z "$PROD_URL" ]]; then
  echo "error: could not retrieve DATABASE_URL from app '$WEB_APP'" >&2
  exit 1
fi

DB_USER="$(echo "$PROD_URL" | sed -E 's|postgres://([^:]+):.*|\1|')"
DB_PASS="$(echo "$PROD_URL" | sed -E 's|postgres://[^:]+:([^@]+)@.*|\1|')"
DB_NAME="$(echo "$PROD_URL" | sed -E 's|.*/([^?]+).*|\1|')"
echo "    user=$DB_USER db=$DB_NAME (password redacted)"

# --- 3. Start fly proxy in the background ------------------------------------
echo "==> Starting fly proxy: localhost:$LOCAL_PORT -> $PG_APP:5432"
fly proxy "$LOCAL_PORT:5432" -a "$PG_APP" >/tmp/fly-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT

# Wait for the proxy to start accepting connections
for _ in $(seq 1 20); do
  sleep 0.5
  if grep -q 'Proxying' /tmp/fly-proxy.log 2>/dev/null; then
    break
  fi
done
if ! grep -q 'Proxying' /tmp/fly-proxy.log 2>/dev/null; then
  echo "error: fly proxy did not start within 10s" >&2
  cat /tmp/fly-proxy.log >&2
  exit 1
fi

# --- 4. pg_dump the prod database -------------------------------------------
echo "==> Dumping prod to $DUMP_FILE"
PGPASSWORD="$DB_PASS" "$PG_BIN/pg_dump" \
  --host=localhost --port="$LOCAL_PORT" \
  --username="$DB_USER" --dbname="$DB_NAME" \
  --no-owner --no-privileges --no-comments \
  --clean --if-exists --format=plain \
  --file="$DUMP_FILE"

DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "    dump size: $DUMP_SIZE"

# --- 5. Recreate local DB and restore ---------------------------------------
echo "==> Recreating local database $LOCAL_DB"
"$PG_BIN/dropdb" --if-exists "$LOCAL_DB"
"$PG_BIN/createdb" "$LOCAL_DB"

echo "==> Restoring into $LOCAL_DB"
"$PG_BIN/psql" -d "$LOCAL_DB" -v ON_ERROR_STOP=1 -q -f "$DUMP_FILE" \
  > /tmp/restore.log 2>&1
echo "    restore log: /tmp/restore.log"

# --- 6. Quick sanity check ---------------------------------------------------
echo "==> Top tables in $LOCAL_DB:"
"$PG_BIN/psql" -d "$LOCAL_DB" -c "
  SELECT relname AS table, n_live_tup AS rows
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 10;
"

echo "==> Done. Local DATABASE_URL: postgres://$USER@localhost:5432/$LOCAL_DB"
