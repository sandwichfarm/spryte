# Example Application

Development performance demo comparing sprite sheet loading vs individual image loading. Uses pre-generated sprite data from a local `output/` directory.

> For the user-facing application with CVM integration and Nostr auth, see [`spa/`](../spa/README.md).

## Features

- Side-by-side comparison of sprite vs individual image load times
- Network request monitoring and timing metrics
- Built with Svelte + Vite + Tailwind CSS

## Setup

1. Generate sprite data first:
   ```bash
   deno run --allow-net --allow-read --allow-write --unstable-sloppy-imports main.ts \
     --pubkey <hex-pubkey> --dimension 128 \
     --sprite output/sprite.png --json output/mapping.json \
     --sourceMapping output/source_files.json
   ```

2. Install and run:
   ```bash
   cd example
   pnpm install
   pnpm dev
   ```

3. Open http://localhost:5173

## Structure

| File | Description |
|------|-------------|
| `src/App.svelte` | Main component with load time comparison UI |
| `src/lib/constants.ts` | Avatar size and file path constants |
| `src/lib/spriteLogic.ts` | Sprite position calculation helpers |
| `output/` | Symlink to generated sprite data (sprite.png, mapping.json, source_files.json) |
