#!/usr/bin/env bash
set -euo pipefail

DB_FILE="bandpass.db"
LOCAL_TMP="/tmp/$DB_FILE"

echo "==> Downloading production database..."
rm -f "$LOCAL_TMP" "$LOCAL_TMP-shm" "$LOCAL_TMP-wal"
fly sftp get "/app/data/$DB_FILE" "$LOCAL_TMP" --app bandpass

echo "==> Stopping dev machine to safely replace the database..."
DEV_MACHINE=$(fly machines list --app bandpass-dev --json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
fly machine stop "$DEV_MACHINE" --app bandpass-dev 2>/dev/null || true
sleep 3

echo "==> Uploading database to dev server..."
echo "put $LOCAL_TMP /app/data/$DB_FILE" | fly sftp shell --app bandpass-dev

echo "==> Starting dev machine..."
fly machine start "$DEV_MACHINE" --app bandpass-dev

echo "==> Cleaning up..."
rm -f "$LOCAL_TMP"

echo "==> Done! Production database copied to bandpass-dev."
