# Dev Infrastructure

Local development setup using Docker. Provides a Blossom server for testing uploads without production dependencies.

## Usage

```bash
cd dev
docker compose up -d
```

This starts a [hzrd149/blossom-server](https://github.com/hzrd149/blossom-server) on http://localhost:3000 with:

- Uploads enabled with auth required
- Local file storage
- Dashboard at http://localhost:3000 for inspecting blobs
- 7-day expiration on dev blobs

## Environment

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `CVM_PRIVATE_KEY` | Generate with `openssl rand -hex 32` |
| `NWC_CONNECTION_STRING` | Optional — only needed for payment testing |
| `BLOSSOM_SERVER_URL` | `http://localhost:3000` for local dev |
| `CVM_RELAYS` | Relay URLs for CVM communication |

## Files

| File | Description |
|------|-------------|
| `docker-compose.yml` | Blossom server container config |
| `blossom-config.yml` | Blossom server settings (uploads, storage, dashboard) |
| `.env.example` | Environment variable template |
