# Collector Component

The Collector is responsible for retrieving profile images from the Nostr network for a specified pubkey. It connects to Nostr relays, queries events, and builds a mapping between pubkeys and their associated image URLs.

## Features

- Connects to multiple Nostr relays to fetch profile metadata
- Maintains a local SQLite cache to reduce redundant queries
- Handles WebSocket connections with timeouts and error handling
- Queries profile information and picture URLs for a pubkey and its contacts

## Usage

The collector is used by providing a pubkey:

```ts
import { collector } from "./collector/index";

// Returns an object mapping pubkeys to image URLs
const photoMapping = await collector("pubkey_hex_string");
```

## Technical Details

- Uses WebSocket connections to query Nostr relays
- Implements caching with SQLite to improve performance
- Follows the NIP-01 protocol standard for Nostr communication
- Handles batch processing of requests for efficiency 