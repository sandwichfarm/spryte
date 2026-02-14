# Processor

Processes a mapping of keys to image URLs into a single sprite sheet PNG and a JSON mapping file. Handles image fetching, resizing, cropping, format conversion, and grid layout.

## Features

- Fetches images from URLs with 15-second timeout
- Resizes and center-crops to configurable cell dimensions
- WASM-based ImageMagick conversion for unsupported image formats
- Optional animated GIF support (extract first frame)
- Consolidates default/fallback images into a single cell
- Square grid layout (columns = ceil(sqrt(totalCells)))

## Usage

```typescript
import { processor } from "@spryte/processor";

await processor(
  mapping,           // Record<string, string> — key to image URL
  128,               // cellSize in pixels
  "sprite.png",      // output sprite path
  "mapping.json",    // output mapping JSON path
  "./default.png",   // fallback image path
  false,             // enableDeanimateGifs
  "source.json",     // optional source mapping output path
  "pubkey"           // optional reference pubkey
);
```

### CLI

```bash
deno run --allow-net --allow-read --allow-write processor/index.ts \
  --pubkey=<pubkey> \
  --dimension=128 \
  --mapping=mapping.json \
  --sprite=sprite.png \
  --json=sprite-mapping.json \
  [--defaultImage=./default.png] \
  [--animated] \
  [--sourceMapping=source_files.json]
```

## Output Format

### Sprite PNG

A grid image where each cell is `cellSize x cellSize` pixels. Non-default images are placed first, followed by a single cell for all default images.

### Mapping JSON

```json
{
  "cellDimensions": { "width": 128, "height": 128 },
  "mapping": {
    "pubkey-hex": {
      "x": 0,
      "y": 0,
      "source": "https://original-avatar-url.jpg"
    }
  }
}
```

## Dependencies

- `imagescript` — Image decoding, resizing, cropping, compositing, and PNG encoding
- `@imagemagick/magick-wasm` — Format conversion fallback via bundled `magick.wasm`

## Used By

- `main.ts` — CLI pipeline
- `cvm/spryte-tool.ts` — CVM service
- `dvm/index.ts` — Legacy DVM
