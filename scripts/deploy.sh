#!/usr/bin/env bash
set -euo pipefail

APP="bandpass"

echo "Deploying $APP..."
fly deploy "$@"

echo ""
echo "Checking for stopped machines..."
stopped=$(fly machines list -a "$APP" --json | jq -r '.[] | select(.state == "stopped") | .id')

if [ -z "$stopped" ]; then
  echo "All machines running."
else
  for id in $stopped; do
    echo "Starting stopped machine $id..."
    fly machines start "$id" -a "$APP"
  done
  echo "All machines started."
fi
