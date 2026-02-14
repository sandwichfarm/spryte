# SPA

User-facing web application for generating Spryte sprite sheets. Built with Svelte + Vite + Tailwind CSS.

> For programmatic integration, use [`@spryte/client`](../client/README.md) instead.

## Features

- Nostr login via NIP-07 browser extension, bunker URI, or NostrConnect QR
- Sprite generation through the CVM with payment support (NWC auto-pay or manual Lightning invoice)
- Sprite preview with CSS background-position rendering
- Hash-based routing (Home, Generate, User Docs, Dev Docs)

## Setup

```bash
cd spa
pnpm install
pnpm dev
```

Open http://localhost:5173

## Build

```bash
pnpm build
```

Output is in `dist/` — static files suitable for CDN hosting (deployed to bunny.net).

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with explanation and login |
| `/generate` | Authenticated sprite generation with payment flow |
| `/docs` | User documentation — what Spryte does, pricing, FAQ |
| `/dev-docs` | Developer documentation — protocol, integration guide, API reference |

## Auth

Uses `applesauce-signers` for Nostr authentication:

- **Extension** (NIP-07): `ExtensionSigner` for browser extensions (nos2x, Alby, etc.)
- **Bunker URI** (NIP-46): `NostrConnectSigner.fromBunkerURI()` for remote signers
- **NostrConnect QR**: `NostrConnectSigner` generates a URI to scan

## Configuration

CVM pubkey and relay URLs are in `src/lib/constants.ts`. Update these after deploying the CVM.

## Structure

| File | Description |
|------|-------------|
| `src/App.svelte` | Root component with router |
| `src/lib/nostr-auth.ts` | Nostr login methods (extension, bunker, NostrConnect) |
| `src/lib/cvm-client.ts` | CVM connection and tool calls |
| `src/lib/stores.ts` | Svelte stores (session, result, loading, error, payment) |
| `src/lib/constants.ts` | CVM pubkey, relay URLs, defaults |
| `src/components/` | LoginDialog, SpriteGenerator, SpriteDisplay, Header, Footer |
| `src/pages/` | Home, Generate, Docs, DevDocs |
