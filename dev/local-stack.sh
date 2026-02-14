#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RELAY_PORT=7777
PIDS=()

cleanup() {
  echo ""
  echo "[local-stack] Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  echo "[local-stack] Stopping Blossom..."
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" down 2>/dev/null || true
  echo "[local-stack] Done."
}
trap cleanup EXIT INT TERM

# --- 1. Check dependencies ---
for cmd in nak deno docker openssl pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "[local-stack] ERROR: '$cmd' is required but not found in PATH"
    exit 1
  fi
done

# --- 2. Start ephemeral relay ---
echo "[local-stack] Starting ephemeral relay on port $RELAY_PORT..."
nak serve --port "$RELAY_PORT" -q &
PIDS+=($!)
sleep 1

# --- 3. Start Blossom ---
echo "[local-stack] Starting Blossom server..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

# --- 4. Generate ephemeral CVM keypair ---
CVM_PRIVATE_KEY=$(openssl rand -hex 32)
CVM_PUBKEY=$(echo "$CVM_PRIVATE_KEY" | nak key public)

# --- 5. Start CVM ---
echo "[local-stack] Starting CVM..."
CVM_PRIVATE_KEY="$CVM_PRIVATE_KEY" \
CVM_RELAYS="ws://127.0.0.1:$RELAY_PORT" \
BLOSSOM_SERVER_URL="http://localhost:3000" \
deno run --no-check \
  --allow-net --allow-read --allow-write --allow-env --allow-run --allow-sys --allow-ffi \
  --unstable-sloppy-imports \
  "$ROOT_DIR/cvm/index.ts" &
PIDS+=($!)

# --- 6. Install app dependencies and start dev server ---
echo "[local-stack] Installing app dependencies..."
(cd "$ROOT_DIR/app" && pnpm install --silent)

echo "[local-stack] Starting app dev server..."
VITE_CVM_PUBKEY="$CVM_PUBKEY" \
VITE_CVM_RELAYS="ws://127.0.0.1:$RELAY_PORT" \
pnpm --dir "$ROOT_DIR/app" dev --open=false &
PIDS+=($!)

# --- 7. Print connection info ---
echo ""
echo "============================================"
echo "  Local Spryte Stack Running"
echo "============================================"
echo "  Relay:       ws://127.0.0.1:$RELAY_PORT"
echo "  Blossom:     http://localhost:3000"
echo "  App:         http://localhost:5173"
echo "  CVM pubkey:  $CVM_PUBKEY"
echo ""
echo "  Client config:"
echo "    relays: [\"ws://127.0.0.1:$RELAY_PORT\"]"
echo "    serverPubkey: \"$CVM_PUBKEY\""
echo "============================================"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Wait for background processes
wait
