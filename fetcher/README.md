# Fetcher

Browser utility for loading images from URLs with timeout handling and fallback support. Used by the `SpryteLoader` Svelte component.

> For a higher-level API that includes CVM integration and sprite rendering, see [`@spryte/client`](../client/README.md).

## Usage

```typescript
import { ImageFetcher } from "@spryte/fetcher";

const fetcher = new ImageFetcher({
  defaultImageUrl: "path/to/default.png",
  timeout: 5000,
});

// Fetch a single image (returns blob URL or default)
const blobUrl = await fetcher.fetchImage("https://example.com/image.png");

// Fetch from a key-based mapping
const mapping = { key1: "https://example.com/image1.png" };
const blobUrl = await fetcher.fetchImageFromMapping(mapping, "key1");
```

## API

### `ImageFetcher(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultImageUrl` | `string` | placeholder URL | Fallback when fetch fails or times out |
| `timeout` | `number` | `5000` | Timeout in milliseconds |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `fetchImage(url)` | `Promise<string>` | Fetch image, return blob URL or default |
| `fetchImageFromMapping(mapping, key)` | `Promise<string>` | Look up key in mapping, then fetch |
