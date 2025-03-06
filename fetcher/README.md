# Fetcher Component

The Fetcher component is a utility for retrieving images from URLs with timeout handling and fallback mechanisms. It provides a reliable way to load images in the Sprite Generator system.

## Features

- Fetches images from URLs with configurable timeout
- Handles fetch failures gracefully with default image fallbacks
- Supports fetching images from key-based mappings
- Creates object URLs from fetched image blobs

## Usage

```ts
import { ImageFetcher } from "./fetcher/index";

// Create an instance with options
const fetcher = new ImageFetcher({
  defaultImageUrl: "path/to/default.png",
  timeout: 5000  // 5 seconds
});

// Fetch an image by URL
const imageUrl = await fetcher.fetchImage("https://example.com/image.png");

// Or fetch from a mapping
const mapping = { "key1": "https://example.com/image1.png" };
const imageUrl = await fetcher.fetchImageFromMapping(mapping, "key1");
```

## Integration

This component is used by the Svelte UI component `SpryteLoader.svelte` to handle image loading with visual feedback for loading states. 