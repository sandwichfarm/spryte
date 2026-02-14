# CVM Service

Context Vending Machine that exposes sprite generation as an MCP tool over Nostr. Replaces the legacy DVM with typed tool definitions, Blossom uploads, and Lightning payments via CEP-8.

## How It Works

1. Client sends a `tools/call` request for `generate-spryte` via Nostr (kind 25910)
2. CVM enqueues the job into a persistent SQLite queue (`jobs.db`)
3. The worker picks up the job: collector fetches follower profile images
4. Processor generates the sprite sheet PNG and mapping JSON (image fetches bounded to `IMAGE_FETCH_CONCURRENCY`)
5. Both files are uploaded to a Blossom server
6. CVM returns the Blossom URLs to the client

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

## MCP Tool: `generate-spryte`

### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pubkey` | `string` | Yes | 64-char hex Nostr pubkey |
| `cellSize` | `number` | No | 32-512, default 128 |
| `uploadServer` | `string` | No | Blossom server URL (uses `BLOSSOM_SERVER_URL` if omitted) |

### Output

```json
{
  "spriteUrl": "https://blossom.example/abc123.png",
  "mappingUrl": "https://blossom.example/def456.json",
  "pubkeyCount": 342,
  "cellSize": 128
}
```

## Pricing (CEP-8)

When `NWC_CONNECTION_STRING` is set, payment middleware is active:

- **Free tier**: Default cell size (128px), once per pubkey per month
- **Paid**: Higher resolutions or repeat generation within the month (21 sats)

Without NWC, all requests are free.

Generation history is tracked in `generations.db` (SQLite).

## Job Queue Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
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
| `spryte-tool.ts` | Tool logic: collector -> processor -> Blossom upload |
| `job-queue.ts` | SQLite-backed persistent job queue with worker loop |
| `concurrency.ts` | Bounded-concurrency `pMap` utility |
| `blossom.ts` | Real Blossom uploads with nostr-tools signing |
| `deno.json` | Package config (`@spryte/cvm`) |

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server
- `@contextvm/sdk` — Nostr transport and payment middleware
- `blossom-client-sdk` — Blossom upload protocol
- `nostr-tools` — Event signing
- `zod` — Input schema validation
