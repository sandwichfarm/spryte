> This repo was built using "Context Programming" techniques before "Context Programming" was coined.

# spryte

A DVM for generating sprite sheets. 

## Features
- user
  - [x] npub: Follows: Profile Images
  - [ ] npub: custom emojis
  - [ ] npub: Follows: Feed: Long Form Images
  - [ ] npub: Followers: Profile Images 
  - [ ] npub: Feed: Image Thumbnails 
- generic
  - [ ] naddr: user lists: profile images
  - [ ] naddr: relay lsits: relay icons

## Components

- **Collector**: Fetches profile images from Nostr relays with caching support
- **Processor**: Processes images and generates sprite sheets with positional mapping
- **Fetcher**: Utility for reliable image loading with timeout and fallback support
- **Svelte Component**: Reusable UI component for displaying sprite images with loading states
- **Example App**: Demonstration application showcasing the full system integration

## Quick Start

```bash
# Clone the repository
git clone https://github.com/sandwichfarm/spryte.git
cd sprite-generator

# Run the generator for a specific pubkey
deno run --allow-net --allow-read --allow-write main.ts --pubkey <pubkey> --dimension 128
```

## Usage Example

```typescript
// 1. Collect images for a pubkey
const photoMapping = await collector("pubkey_hex_string");

// 2. Process images into a sprite sheet
await processor(
  photoMapping,
  128, // cell size in pixels
  "sprite.png", // output sprite image
  "mapping.json", // output mapping file
  "default.png" // fallback image
);

// 3. Use the sprite in your application
// See the Example application or the Svelte component for UI integration
```

## Documentation

Each component has its own README with detailed documentation:

- [Collector Documentation](./collector/README.md)
- [Processor Documentation](./processor/README.md)
- [Fetcher Documentation](./fetcher/README.md)
- [Svelte Component Documentation](./svelte/README.md)
- [Example Application](./example/README.md)

## License

[MIT](LICENSE)
