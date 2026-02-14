# Docs (`@spryte/docs`)

Static documentation site for Spryte implementers. Built with Svelte + Vite + Tailwind, matching the SPA's dark theme.

## Development

```bash
cd docs
pnpm install
pnpm dev
```

Opens at `http://localhost:5174/docs/`.

## Build

```bash
pnpm build
```

Outputs static files to `docs/dist/`.

## Deployment

Deployed to bunny.net at the `/docs/` path prefix via GitHub Actions (on push to `docs/` on `main`):

```bash
bash deploy/bunny/deploy.sh docs/dist docs/
```

## Content

Markdown files in `content/` are imported via Vite `?raw` and rendered at runtime with `marked` + `highlight.js`:

| File | Topic |
|------|-------|
| `overview.md` | What Spryte is, architecture, components |
| `getting-started.md` | Install, quick start, first generation |
| `client-library.md` | Full `@spryte/client` API reference |
| `sprite-format.md` | Mapping JSON schema, CSS rendering, framework examples |
| `cvm-protocol.md` | MCP tool schema, Nostr events, direct integration |
| `payments.md` | Free tier, pricing, CEP-8 flow, NWC setup |
| `self-hosting.md` | Blossom server, CVM deployment, environment variables |

## Stack

- **Svelte 5** + **Vite 6** + **Tailwind 3** (same as SPA)
- **svelte-spa-router** for hash-based routing
- **marked** + **marked-highlight** + **highlight.js** for markdown rendering
- **@tailwindcss/typography** for prose styling
