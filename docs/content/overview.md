# Overview

Spryte generates sprite sheet images containing the profile pictures of all accounts a Nostr user follows. Instead of a client making hundreds of individual HTTP requests to load avatars, it loads one image and uses CSS `background-position` to display each one.

## Architecture

```
client/  ──>  CVM (cvm/)  ──>  collector/  ──>  processor/  ──>  Blossom
  ^                                                                 |
  |                                                                 v
  └──────────────────── sprite URL + mapping URL ───────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Collector** | Queries Nostr relays for a pubkey's follow list and fetches profile image URLs with SQLite caching |
| **Processor** | Fetches images, resizes/crops them to a grid, and outputs a sprite PNG + mapping JSON |
| **CVM** | Context Vending Machine — exposes `generate-spryte` as an MCP tool over Nostr (kind 25910) with optional Lightning payments |
| **Client Library** | `@spryte/client` — turnkey library for generating and consuming sprite sheets |

## How It Works

1. A client sends a `generate-spryte` tool call to the CVM over Nostr relays
2. The CVM runs the **collector** to fetch the target pubkey's follow list and profile image URLs
3. The **processor** downloads and resizes each image, composites them into a single sprite PNG, and generates a mapping JSON
4. Both files are uploaded to a **Blossom** content-addressed storage server
5. The CVM returns the Blossom URLs to the client

## Output

A generation produces two files:

- **Sprite PNG** — A grid image where each cell contains one follower's avatar
- **Mapping JSON** — Maps each pubkey to its `x`/`y` pixel offset in the sprite, plus the original image source URL

Clients use the mapping to set CSS `background-position` on elements, displaying individual avatars from the single sprite image.

## Nostr Integration

Spryte communicates over Nostr using:

- **Kind 25910** — MCP tool call requests/responses via `@contextvm/sdk`
- **NIP-47 (NWC)** — Optional automatic Lightning payments for paid tiers
- **CEP-8** — Payment negotiation protocol between client and CVM
