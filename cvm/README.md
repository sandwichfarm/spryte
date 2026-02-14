# CVM Service

Context Vending Machine that exposes sprite generation as an MCP tool over Nostr. Replaces the legacy DVM with typed tool definitions, Blossom uploads, and Lightning payments via CEP-8.

## How It Works

1. Client sends a `tools/call` request for `generate-spryte` via Nostr (kind 25910)
2. CVM enqueues the job into a persistent SQLite queue (`jobs.db`)
3. The worker picks up the job: collector fetches follower profile images
4. Profile images are served from Blossom cache where available (cache invalidates on URL change)
5. Processor generates the sprite sheet PNG and mapping JSON (image fetches bounded to `IMAGE_FETCH_CONCURRENCY`)
6. Both files are uploaded to a Blossom server
7. CVM returns the Blossom URLs to the client

Jobs survive server restarts — any job left in `processing` state on startup is automatically recovered and retried. Concurrent requests are serialized by default (`JOB_MAX_CONCURRENCY=1`) to prevent resource exhaustion.

## Running

```bash
# Required
export CVM_PRIVATE_KEY=$(openssl rand -hex 32)

# Optional
export BLOSSOM_SERVER_URL=http://localhost:3000
export CVM_RELAYS=wss://relay.damus.io
export NWC_CONNECTION_STRING=nostr+walletconnect://...

deno run --allow-net --allow-read --allow-write --allow-env --unstable-sloppy-imports cvm/index.ts
```

## Plans System

Plans are defined in `config/plans.yaml` — the single source of truth consumed by both the CVM and SPA.

### Free Tier
- Max 500 images per sprite
- 1 generation per month
- Repeat requests return the cached previous result

### Paid Plans (Pro, Unlimited)
- Higher image limits and generation frequency
- Subscribe via the `subscribe` MCP tool with Lightning payment

### One-Time Upgrade
- Pass `requestInvoice: true` to `generate-spryte` to pay 21 sats and bypass limits for a single generation

## MCP Tools

### `generate-spryte`

Generate a sprite sheet of Nostr follower profile images.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pubkey` | `string` | Yes | 64-char hex Nostr pubkey |
| `cellSize` | `number` | No | 32-512, default 128 |
| `uploadServer` | `string` | No | Blossom server URL (uses `BLOSSOM_SERVER_URL` if omitted) |
| `requestInvoice` | `boolean` | No | Pay per-generation to bypass plan limits |

**Output:**

```json
{
  "spriteUrl": "https://blossom.example/abc123.png",
  "mappingUrl": "https://blossom.example/def456.json",
  "pubkeyCount": 342,
  "cellSize": 128,
  "cached": false,
  "limitReasons": [],
  "totalFollowers": 1200
}
```

When limits are hit and `requestInvoice` is false, returns the previous cached result with `cached: true` and `limitReasons: ["time_limit"]`. When image count exceeds the plan's `maxImages`, the sprite is truncated and `limitReasons` includes `"image_limit"` with `totalFollowers` showing the actual count.

### `get-plans`

Returns the plans configuration (free, no payment required).

### `subscribe`

Subscribe to a paid plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `planId` | `string` | Yes | Plan ID (e.g. `pro`, `unlimited`) |
| `period` | `string` | Yes | `monthly` or `yearly` |

Payment is handled via CEP-8 — the `resolvePrice` callback returns the plan's pricing for the selected period.

## Image Cache

Profile images are cached on the Blossom server to avoid re-fetching from random internet URLs on every generation. The cache is stored in `image_cache.db` (SQLite) and maps each pubkey's source URL to a Blossom hash/URL.

- Cache invalidation: if a profile's source URL changes, the cached entry is ignored and the new image is fetched
- Background upload: uncached images are uploaded to Blossom asynchronously after generation completes (non-blocking)

## Pricing (CEP-8)

When `NWC_CONNECTION_STRING` is set, payment middleware is active:

- **Free tier**: Within plan limits (default: 1 generation/month, 500 images max)
- **One-time upgrade**: 21 sats to bypass limits for a single generation
- **Subscriptions**: Monthly/yearly plans with higher limits

Without NWC, all requests are free.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CVM_PRIVATE_KEY` | — | Required. Hex private key for Nostr signing |
| `BLOSSOM_SERVER_URL` | `http://localhost:3000` | Blossom server for uploads |
| `CVM_RELAYS` | `wss://relay.damus.io` | Comma-separated relay URLs |
| `NWC_CONNECTION_STRING` | — | NWC connection for Lightning payments |
| `JOB_MAX_CONCURRENCY` | `1` | Max concurrent sprite generations |
| `JOB_TIMEOUT_MS` | `300000` | Per-job timeout (5 minutes) |
| `JOB_MAX_ATTEMPTS` | `3` | Retry attempts before permanent failure |
| `JOB_POLL_INTERVAL_MS` | `500` | Worker poll interval in ms |
| `IMAGE_FETCH_CONCURRENCY` | `20` | Max concurrent image fetches per generation |

## Files

| File | Description |
|------|-------------|
| `index.ts` | Entry point — McpServer + NostrServerTransport + payments |
| `signer.ts` | PrivateKeySigner from `CVM_PRIVATE_KEY` env var |
| `spryte-tool.ts` | Tool logic: collector -> cache -> processor -> Blossom upload |
| `job-queue.ts` | SQLite-backed persistent job queue with worker loop |
| `plans.ts` | YAML plan config loader and validator |
| `subscriptions.ts` | SQLite-backed subscription management |
| `limits.ts` | Limit resolution combining plans + subscriptions + history |
| `image-cache.ts` | Blossom-backed profile image cache |
| `concurrency.ts` | Bounded-concurrency `pMap` utility |
| `blossom.ts` | Real Blossom uploads with nostr-tools signing |
| `deno.json` | Package config (`@spryte/cvm`) |

## Databases

| File | Description |
|------|-------------|
| `jobs.db` | Persistent job queue |
| `generations.db` | Generation history for rate limiting |
| `subscriptions.db` | Active user subscriptions |
| `image_cache.db` | Profile image → Blossom URL cache |
| `collector_cache.db` | Nostr event cache (managed by collector) |

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server
- `@contextvm/sdk` — Nostr transport and payment middleware
- `blossom-client-sdk` — Blossom upload protocol
- `nostr-tools` — Event signing
- `zod` — Input schema validation
- `@std/yaml` — YAML config parsing
