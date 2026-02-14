# Getting Started

## Prerequisites

- **Node.js** 18+ (or any runtime supporting ES modules)
- A **Nostr private key** (hex-encoded) for client identity
- The **Spryte CVM server pubkey** (provided by the service operator)

## Install

```bash
npm install @spryte/client
```

## Quick Start

```typescript
import { Spryte } from "@spryte/client";

const spryte = new Spryte({
  privateKey: "your-hex-nostr-private-key",
  serverPubkey: "spryte-cvm-hex-pubkey",
});

await spryte.connect();

// Generate a sprite sheet for a pubkey's followers
const sheet = await spryte.generate("target-hex-pubkey");

// Render an avatar (48px display size)
const style = spryte.getAvatarStyle(sheet, "some-follower-pubkey", 48);
if (style) {
  element.setAttribute("style", spryte.avatarStyleToString(style));
}

await spryte.disconnect();
```

## What Happens During Generation

When you call `spryte.generate()`:

1. The client connects to Nostr relays and sends an MCP `tools/call` request to the CVM
2. The CVM collects the target pubkey's follow list from Nostr
3. Profile images are fetched, resized, and composited into a sprite sheet
4. The sprite PNG and mapping JSON are uploaded to a Blossom server
5. The client receives the URLs, fetches both files, and returns a ready-to-use `SpriteSheet` object

## First Generation

The free tier allows one generation per pubkey per month at 128px cell size. No payment setup is required for free-tier usage.

```typescript
// Free tier: default 128px cell size
const sheet = await spryte.generate("target-hex-pubkey");

console.log(`Generated sprite with ${Object.keys(sheet.mapping.mapping).length} avatars`);
console.log(`Sprite URL: ${sheet.spriteUrl}`);
```

## Loading Existing Sprites

If you already have sprite URLs from a previous generation, you can load them directly without calling the CVM:

```typescript
const sheet = await spryte.load(
  "https://blossom.example/abc123.png",
  "https://blossom.example/def456.json",
);
```

## Automatic Payments (NWC)

For paid tiers (higher resolutions or repeat generations), provide an NWC connection string to handle Lightning payments automatically:

```typescript
const spryte = new Spryte({
  privateKey: "your-hex-nostr-private-key",
  serverPubkey: "spryte-cvm-hex-pubkey",
  nwcConnectionString: "nostr+walletconnect://...",
});
```

See the [Payments](/docs/#/payments) page for details on pricing and payment flows.
