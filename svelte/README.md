# Svelte Component

The Svelte component provides a reusable UI element for loading and displaying images from sprite sheets. It includes loading states and error handling.

## Features

- Displays images with loading state indicators
- Shimmer effect for placeholders during image loading
- Handles image loading failures with default image fallbacks
- Supports loading images via direct URL or from key-based mappings

## Usage

```svelte
<script>
  import SpryteLoader from 'path/to/SpryteLoader.svelte';
  
  // Option 1: Direct URL
  let imageUrl = 'https://example.com/image.png';
  
  // Option 2: Using mapping
  let mapping = { 
    'profile1': 'https://example.com/profile1.png'
  };
</script>

<!-- Using direct URL -->
<SpryteLoader 
  imageUrl={imageUrl}
  timeout={5000}
  defaultImage="path/to/default.png"
/>

<!-- Using mapping -->
<SpryteLoader 
  mapping={mapping}
  mappingKey="profile1"
  timeout={5000}
  defaultImage="path/to/default.png"
/>
```

## Props

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| imageUrl | string | URL of the image to load | '' |
| mapping | object | Object mapping keys to image URLs | null |
| mappingKey | string | Key to use with the mapping | null |
| timeout | number | Fetch timeout in milliseconds | 5000 |
| defaultImage | string | Fallback image URL | placeholder URL | 