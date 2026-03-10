#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SRC="$ROOT_DIR/extension"
OUT="$ROOT_DIR/extension-cws"
ZIP="$ROOT_DIR/bandpass-extension-cws.zip"

rm -rf "$OUT" "$ZIP"
cp -r "$SRC" "$OUT"

cat > "$OUT/manifest.json" << 'MANIFEST'
{
  "manifest_version": 3,
  "name": "Bandpass",
  "version": "1.0.0",
  "description": "Connect your Bandcamp account to Bandpass for filtered feed browsing and discovery.",
  "permissions": [
    "cookies",
    "storage"
  ],
  "host_permissions": [
    "https://*.bandcamp.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://bandpass.fly.dev/*"],
      "js": ["connector.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://*.bandcamp.com/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
MANIFEST

cd "$OUT"
zip -r "$ZIP" . -x ".*"

echo "Built CWS extension: $ZIP"
