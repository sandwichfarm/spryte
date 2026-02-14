# Collector

Fetches profile images from the Nostr network for a given pubkey and its followers. Connects to relays, queries events, and returns a mapping of pubkeys to profile image URLs.

## Features

- Queries `wss://purplepag.es` for follow lists (kind 3), relay lists (kind 10002), and metadata (kind 0)
- SQLite cache (`collector_cache.db`) to avoid redundant relay queries
- Batch processing with configurable relay timeouts
- Validates image URLs before including them in the output

## Usage

```typescript
import { collector } from "@spryte/collector";

// Returns { [pubkey: string]: imageUrl }
const photoMapping = await collector("hex-pubkey");
```

### CLI

```bash
deno run --allow-net --allow-read --allow-write collector/index.ts <hex-pubkey>
```

## How It Works

1. Fetch the target pubkey's follow list (kind 3) from relay, merging with cache
2. Build a set of all followed pubkeys
3. Fetch relay lists (kind 10002) for each pubkey
4. Fetch metadata (kind 0) in batches of 25 authors
5. Extract `picture` URLs from metadata and validate them
6. Return the final `pubkey -> imageUrl` mapping

## Exports

| Export | Description |
|--------|-------------|
| `collector(pubkey)` | Main function, returns `Promise<Record<string, string>>` |
| `queryRelay(url, filters, timeout?)` | Low-level relay query via WebSocket |
| `NostrEvent` | Event interface (kind, pubkey, created_at, tags, content) |
| `RelayFilter` | Filter interface (kinds, authors, since) |

## Used By

- `main.ts` — CLI pipeline
- `cvm/spryte-tool.ts` — CVM service
- `dvm/index.ts` — Legacy DVM
