> This repo was built using "Context Programming" techniques before "Context Programming" was coined.

# spryte

Generate sprite sheets of Nostr follower profile images. One image, hundreds of avatars — faster load times for clients.

Spryte runs as a Context Vending Machine (CVM) that exposes an MCP tool over Nostr relays. Clients call `generate-spryte` with a pubkey, and receive Blossom URLs for a sprite PNG and mapping JSON. Optional Lightning micropayments via CEP-8.

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
| [`cvm/`](./cvm/README.md) | Context Vending Machine — MCP server over Nostr with payments |
| [`client/`](./client/README.md) | Turnkey client library (`@spryte/client`) for generating and consuming sprites |
| [`spa/`](./spa/README.md) | User-facing web app — Svelte + Vite + Tailwind |
| [`fetcher/`](./fetcher/README.md) | Browser utility for image loading with timeout/fallback |
| [`svelte/`](./svelte/README.md) | Reusable Svelte component for displaying sprite images |
| [`example/`](./example/README.md) | Dev performance demo comparing sprite vs individual image loading |
| [`dvm/`](./dvm/) | Legacy DVM implementation (kept for reference) |
| [`dev/`](./dev/README.md) | Local dev infrastructure (Docker Blossom server) |
| [`deploy/`](./deploy/README.md) | Deployment automation (Ansible, bunny.net, GitHub Actions) |

## Quick Start

### Generate a sprite locally (CLI)

```bash
deno run --allow-net --allow-read --allow-write --unstable-sloppy-imports main.ts \
  --pubkey <hex-pubkey> --dimension 128
```

### Use the client library

```typescript
import { Spryte } from "@spryte/client";

const spryte = new Spryte({
  privateKey: "your-nostr-hex-private-key",
  serverPubkey: "spryte-cvm-pubkey",
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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CVM_PRIVATE_KEY` | Yes (CVM) | Hex Nostr private key for CVM identity |
| `BLOSSOM_SERVER_URL` | No | Blossom server for uploads (default: `http://localhost:3000`) |
| `CVM_RELAYS` | No | Comma-separated relay WSS URLs (default: `wss://relay.damus.io`) |
| `NWC_CONNECTION_STRING` | No | NIP-47 connection for Lightning payments (omit for free-only mode) |

## Documentation

- [Collector](./collector/README.md) — Nostr relay querying and caching
- [Processor](./processor/README.md) — Image processing and sprite generation
- [CVM Service](./cvm/README.md) — MCP server, Blossom uploads, payments
- [Client Library](./client/README.md) — Turnkey integration for app developers
- [SPA](./spa/README.md) — User-facing web application
- [Dev Setup](./dev/README.md) — Local development with Docker
- [Deployment](./deploy/README.md) — Ansible, bunny.net, CI/CD

## License

[MIT](LICENSE)
