> This repo was built using "Context Programming" techniques before "Context Programming" was coined.

# spryte

Generate sprite sheets of Nostr follower profile images. One image, hundreds of avatars — faster load times for clients.

Spryte runs as a Context Vending Machine (CVM) that exposes MCP tools over Nostr relays. Clients call `generate-spryte` with a pubkey and receive Blossom URLs for a sprite PNG and mapping JSON. Optional Lightning micropayments via CEP-8.

## Architecture

```
client/  ──>  CVM (cvm/)  ──>  collector/  ──>  processor/  ──>  Blossom
  ^                                                                 |
  |                                                                 v
  └──────────────────── sprite URL + mapping URL ──────────────────-┘
```

## Components

| Directory | Description |
|-----------|-------------|
| [`collector/`](./collector/README.md) | Fetches follower profile images from Nostr relays with SQLite caching |
| [`processor/`](./processor/README.md) | Resizes, crops, and composites images into a sprite sheet PNG |
| [`cvm/`](./cvm/README.md) | Context Vending Machine — MCP server over Nostr with job queue, plans, subscriptions, image cache, and Lightning payments |
| [`config/`](./config/) | Shared configuration — `plans.yaml` defines plan tiers and pricing |
| [`client/`](./client/README.md) | Turnkey client library (`@spryte/client`) for generating and consuming sprites |
| [`spa/`](./spa/README.md) | User-facing web app — Svelte + Vite + Tailwind with Nostr auth and payment flows |
| [`docs/`](./docs/README.md) | Static documentation site for implementers (Svelte + Vite + Tailwind) |
| [`fetcher/`](./fetcher/README.md) | Browser utility for image loading with timeout/fallback |
| [`svelte/`](./svelte/README.md) | Reusable Svelte component for displaying sprite images |
| [`example/`](./example/README.md) | Dev performance demo comparing sprite vs individual image loading |
| [`dev/`](./dev/README.md) | Local dev infrastructure (Docker Blossom server) |
| [`deploy/`](./deploy/README.md) | Deployment automation (Ansible, bunny.net, GitHub Actions) |
| [`dvm/`](./dvm/) | Legacy DVM implementation (kept for reference) |

## Quick Start

### Generate a sprite locally (CLI)

```bash
deno task start --pubkey <hex-pubkey> --dimension 128
```

Or directly:

```bash
deno run --allow-net --allow-read --allow-write --unstable-sloppy-imports main.ts \
  --pubkey <hex-pubkey> --dimension 128
```

### Use the client library

```typescript
import { Spryte } from "@spryte/client";
import { fromApplesauce } from "@spryte/client/signers";
import { ExtensionSigner } from "applesauce-signers";

const spryte = new Spryte({
  signer: fromApplesauce(new ExtensionSigner()),
  serverPubkey: "spryte-cvm-hex-pubkey",
});

await spryte.connect();

// Generate and load a sprite sheet
const sheet = await spryte.generate("target-hex-pubkey");

// Get CSS for a specific avatar
const style = spryte.getAvatarStyle(sheet, "some-pubkey", 48);
if (style) {
  element.setAttribute("style", spryte.avatarStyleToString(style));
}

await spryte.disconnect();
```

### Run the CVM locally

```bash
# Start local Blossom server
cd dev && docker compose up -d

# Set environment
export CVM_PRIVATE_KEY=$(openssl rand -hex 32)
export BLOSSOM_SERVER_URL=http://localhost:3000

# Start CVM
deno run --allow-net --allow-read --allow-write --allow-env --unstable-sloppy-imports cvm/index.ts
```

## Plans

Plans are defined in [`config/plans.yaml`](./config/plans.yaml) — the single source of truth consumed by both the CVM and SPA.

| Plan | Images | Generations/month | Price |
|------|--------|-------------------|-------|
| Free | 500 | 1 | — |
| Pro | 2,000 | 30 | 1,000 sats/mo |
| Unlimited | No limit | No limit | 5,000 sats/mo |

One-time upgrade: pass `requestInvoice: true` to pay 21 sats and bypass limits for a single generation.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CVM_PRIVATE_KEY` | Yes (CVM) | Hex Nostr private key for CVM identity |
| `BLOSSOM_SERVER_URL` | No | Blossom server for uploads (default: `http://localhost:3000`) |
| `CVM_RELAYS` | No | Comma-separated relay WSS URLs (default: `wss://relay.damus.io`) |
| `NWC_CONNECTION_STRING` | No | NIP-47 connection for Lightning payments (omit for free-only mode) |
| `JOB_MAX_CONCURRENCY` | No | Max concurrent sprite generations (default: `1`) |
| `JOB_TIMEOUT_MS` | No | Per-job timeout in ms (default: `300000`) |
| `JOB_MAX_ATTEMPTS` | No | Retry attempts before permanent failure (default: `3`) |
| `REGEN_INTERVAL_MS` | No | Background regeneration sweep interval (default: `6h`) |

## Testing

```bash
# Run all CVM tests (unit + integration)
deno task test:cvm

# Run a single test file
deno test --no-check --allow-read --allow-write --allow-env --allow-net --allow-run --allow-sys --allow-ffi --unstable-sloppy-imports cvm/tests/plans.test.ts

# Integration tests require the nak binary
deno test --no-check --allow-read --allow-write --allow-env --allow-net --allow-run --allow-sys --allow-ffi --unstable-sloppy-imports cvm/tests/integration.test.ts
```

Test coverage spans all CVM modules: plans, subscriptions, job queue, limits, image cache, generation records, background regeneration, and full MCP round-trip over an ephemeral Nostr relay.

## Documentation

- [Collector](./collector/README.md) — Nostr relay querying and caching
- [Processor](./processor/README.md) — Image processing and sprite generation
- [CVM Service](./cvm/README.md) — MCP server, job queue, plans, payments, image cache
- [Client Library](./client/README.md) — Turnkey integration for app developers
- [SPA](./spa/README.md) — User-facing web application
- [Docs Site](./docs/README.md) — Implementer documentation (overview, API reference, self-hosting)
- [Dev Setup](./dev/README.md) — Local development with Docker
- [Deployment](./deploy/README.md) — Ansible, bunny.net, CI/CD

## License

[MIT](LICENSE)
