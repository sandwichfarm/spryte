# Self-Hosting

This guide covers deploying your own Spryte CVM instance with a Blossom storage server.

## Prerequisites

- **Deno** runtime (for the CVM, collector, and processor)
- **Docker** (for the local Blossom server, or use a public Blossom instance)
- A **Nostr private key** for the CVM identity

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CVM_PRIVATE_KEY` | Yes | Hex Nostr private key for CVM identity |
| `BLOSSOM_SERVER_URL` | No | Blossom server URL for uploads (default: `http://localhost:3000`) |
| `CVM_RELAYS` | No | Comma-separated relay WSS URLs (default: `wss://relay.damus.io`) |
| `NWC_CONNECTION_STRING` | No | NIP-47 connection for Lightning payments (omit for free-only mode) |

## Quick Start

### 1. Start a Local Blossom Server

The `dev/` directory contains a Docker Compose setup for local development:

```bash
cd dev
docker compose up -d
```

This starts a Blossom server at `http://localhost:3000` for content-addressed file storage.

### 2. Generate a CVM Private Key

```bash
export CVM_PRIVATE_KEY=$(openssl rand -hex 32)
echo "CVM pubkey will be derived from this key"
```

Save this key securely — it's the CVM's Nostr identity.

### 3. Start the CVM

```bash
export BLOSSOM_SERVER_URL=http://localhost:3000

deno run --allow-net --allow-read --allow-write --allow-env --unstable-sloppy-imports cvm/index.ts
```

The CVM will:
- Connect to the configured Nostr relays
- Advertise the `generate-spryte` MCP tool
- Listen for incoming tool call requests

### 4. Test with the Client

```typescript
import { Spryte } from "@spryte/client";

const spryte = new Spryte({
  privateKey: "a-client-private-key",
  serverPubkey: "your-cvm-pubkey",
  relays: ["wss://relay.damus.io"],
});

await spryte.connect();
const sheet = await spryte.generate("some-target-pubkey");
console.log(sheet.spriteUrl);
```

## CVM Deployment

### Systemd Service

For a persistent deployment on a Linux server:

```ini
[Unit]
Description=Spryte CVM
After=network.target

[Service]
Type=simple
User=spryte
WorkingDirectory=/opt/spryte
Environment=CVM_PRIVATE_KEY=<your-key>
Environment=BLOSSOM_SERVER_URL=https://your-blossom.example
Environment=CVM_RELAYS=wss://relay.damus.io,wss://nos.lol
ExecStart=/usr/bin/deno run --allow-net --allow-read --allow-write --allow-env --unstable-sloppy-imports cvm/index.ts
Restart=always

[Install]
WantedBy=multi-user.target
```

### Docker

```dockerfile
FROM denoland/deno:latest

WORKDIR /app
COPY . .

RUN deno cache --unstable-sloppy-imports cvm/index.ts

ENV CVM_PRIVATE_KEY=""
ENV BLOSSOM_SERVER_URL="http://localhost:3000"
ENV CVM_RELAYS="wss://relay.damus.io"

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--unstable-sloppy-imports", "cvm/index.ts"]
```

## Blossom Server

The CVM uploads sprite PNGs and mapping JSONs to a Blossom server. You can:

- **Use the bundled dev server**: `cd dev && docker compose up -d` (local only)
- **Deploy your own**: See [blossom-server](https://github.com/hzrd149/blossom-server) for production deployment
- **Use a public instance**: Configure `BLOSSOM_SERVER_URL` to point to a public Blossom server

The CVM signs upload requests with its Nostr private key using the Blossom upload protocol.

## Ansible Deployment

The `deploy/` directory contains Ansible playbooks for automated server provisioning:

```
deploy/
├── ansible/          # Ansible roles and playbooks
├── bunny/            # CDN deployment scripts (bunny.net)
└── README.md         # Deployment documentation
```

Refer to `deploy/README.md` for the full Ansible setup including:
- Server provisioning
- CVM service installation
- Blossom server configuration
- Reverse proxy setup
- SSL certificate management

## Monitoring

The CVM logs to stdout. Key events to monitor:

- **Incoming requests**: Tool call received with pubkey and parameters
- **Generation progress**: Collector and processor status
- **Upload results**: Blossom URLs for completed sprites
- **Payment events**: Invoice creation and payment confirmation (when NWC is enabled)
- **Errors**: Failed image fetches, upload failures, relay disconnections
