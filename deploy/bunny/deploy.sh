#!/usr/bin/env bash
set -euo pipefail

# Deploy static files to bunny.net storage zone and purge CDN cache.
#
# Usage: bash deploy.sh [DIST_DIR] [UPLOAD_PREFIX]
#   DIST_DIR       - Local directory to upload (default: app/dist)
#   UPLOAD_PREFIX  - Remote path prefix (e.g. "docs/"). Omit for root.
#
# Required environment variables:
#   BUNNY_STORAGE_ZONE     - Storage zone name
#   BUNNY_API_KEY          - Storage API key (per-zone)
#   BUNNY_PULLZONE_ID      - Pull zone ID for cache purging
#   BUNNY_ACCOUNT_API_KEY  - Account-level API key for purge endpoint

DIST_DIR="${1:-app/dist}"
UPLOAD_PREFIX="${2:-}"
STORAGE_URL="https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/"

if [ ! -d "$DIST_DIR" ]; then
  echo "Error: dist directory not found at $DIST_DIR"
  exit 1
fi

echo "Uploading files from $DIST_DIR to bunny.net storage zone: $BUNNY_STORAGE_ZONE"

# Upload each file to the storage zone
find "$DIST_DIR" -type f | while read -r file; do
  relative="${file#$DIST_DIR/}"
  echo "  Uploading: $relative"
  curl -s --fail \
    --request PUT \
    --url "${STORAGE_URL}${UPLOAD_PREFIX}${relative}" \
    --header "AccessKey: ${BUNNY_API_KEY}" \
    --header "Content-Type: application/octet-stream" \
    --data-binary "@${file}"
done

echo "Upload complete."

# Purge CDN cache
echo "Purging CDN cache for pull zone: $BUNNY_PULLZONE_ID"
curl -s --fail \
  --request POST \
  --url "https://api.bunny.net/pullzone/${BUNNY_PULLZONE_ID}/purgeCache" \
  --header "AccessKey: ${BUNNY_ACCOUNT_API_KEY}" \
  --header "Content-Type: application/json"

echo "Cache purged. Deployment complete."
