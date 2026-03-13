#!/usr/bin/env bash
set -euo pipefail

DB_FILE="bandpass.db"
LOCAL_TMP="/tmp/$DB_FILE"

echo "==> Downloading production database..."
rm -f "$LOCAL_TMP"
fly sftp get "/app/data/$DB_FILE" "$LOCAL_TMP" --app bandpass

echo "==> Deleting existing database on dev server..."
fly ssh console --app bandpass-dev -C "rm -f /app/data/$DB_FILE /app/data/$DB_FILE-shm /app/data/$DB_FILE-wal"

echo "==> Uploading database to dev server..."
echo "put $LOCAL_TMP /app/data/$DB_FILE" | fly sftp shell --app bandpass-dev

echo "==> Fixing file ownership (sftp uploads as root)..."
fly ssh console --app bandpass-dev -C "chown 1001:65533 /app/data/$DB_FILE"

echo "==> Restarting dev machine..."
DEV_MACHINE=$(fly machines list --app bandpass-dev --json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
fly machine stop "$DEV_MACHINE" --app bandpass-dev 2>/dev/null || true
sleep 2
fly machine start "$DEV_MACHINE" --app bandpass-dev

echo "==> Cleaning up..."
rm -f "$LOCAL_TMP"

echo "==> Done! Production database copied to bandpass-dev."
