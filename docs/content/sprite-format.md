# Sprite Format

Spryte outputs two files: a **sprite PNG** and a **mapping JSON**. This page describes their format and how to render avatars from them.

## Mapping JSON

The mapping file describes the grid layout and maps each pubkey to its position in the sprite:

```json
{
  "cellDimensions": {
    "width": 128,
    "height": 128
  },
  "mapping": {
    "a1b2c3d4...": {
      "x": 0,
      "y": 0,
      "source": "https://original-avatar-url.jpg"
    },
    "e5f6a7b8...": {
      "x": 128,
      "y": 0,
      "source": "https://another-avatar-url.jpg"
    }
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `cellDimensions.width` | `number` | Width of each cell in pixels |
| `cellDimensions.height` | `number` | Height of each cell in pixels |
| `mapping[pubkey].x` | `number` | Pixel X offset of this avatar in the sprite |
| `mapping[pubkey].y` | `number` | Pixel Y offset of this avatar in the sprite |
| `mapping[pubkey].source` | `string` | Original profile image URL |

## Sprite Grid Layout

The processor arranges avatars in a square grid:

- **Columns** = `ceil(sqrt(totalCells))`
- Each cell is `cellSize × cellSize` pixels
- Non-default images are placed first, followed by a single cell for all pubkeys that share the default/fallback image
- Only pubkeys with successfully fetched images are included in the mapping

For example, a sprite with 342 followers at 128px would produce a 19×19 grid (361 cells, some empty) = a 2432×2432 pixel image.

## CSS Rendering Technique

To display a single avatar from the sprite sheet, use CSS `background-position` and `background-size`:

```javascript
const entry = mapping.mapping[pubkey];
const cell = mapping.cellDimensions;
const displaySize = 48; // desired avatar size in pixels
const scale = displaySize / cell.width;

element.style.backgroundImage = `url(${spriteUrl})`;
element.style.backgroundPosition = `${-entry.x * scale}px ${-entry.y * scale}px`;
element.style.backgroundSize = `${spriteNaturalWidth * scale}px ${spriteNaturalHeight * scale}px`;
element.style.backgroundRepeat = "no-repeat";
element.style.width = `${displaySize}px`;
element.style.height = `${displaySize}px`;
```

The key insight is **scaling**: the sprite's natural size is scaled down (or up) by `displaySize / cellSize`, and the background position is scaled by the same factor.

## Framework Examples

### Vanilla JavaScript

```javascript
async function renderAvatar(element, spriteUrl, mappingUrl, pubkey, size = 48) {
  const res = await fetch(mappingUrl);
  const mapping = await res.json();
  const entry = mapping.mapping[pubkey];
  if (!entry) return;

  const img = new Image();
  img.onload = () => {
    const scale = size / mapping.cellDimensions.width;
    element.style.backgroundImage = `url('${spriteUrl}')`;
    element.style.backgroundPosition = `${-entry.x * scale}px ${-entry.y * scale}px`;
    element.style.backgroundSize = `${img.naturalWidth * scale}px ${img.naturalHeight * scale}px`;
    element.style.backgroundRepeat = "no-repeat";
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
  };
  img.src = spriteUrl;
}
```

### Svelte

```svelte
<script>
  import { loadSpriteSheet, getAvatarStyle, avatarStyleToString } from "@spryte/client";

  export let spriteUrl;
  export let mappingUrl;
  export let pubkey;
  export let size = 48;

  let styleStr = "";

  $: loadSpriteSheet(spriteUrl, mappingUrl).then((sheet) => {
    const style = getAvatarStyle(sheet, pubkey, size);
    styleStr = style ? avatarStyleToString(style) : "";
  });
</script>

<div class="avatar" style={styleStr}></div>

<style>
  .avatar {
    border-radius: 50%;
    display: inline-block;
  }
</style>
```

### React

```tsx
import { useEffect, useState } from "react";
import { loadSpriteSheet, getAvatarStyle, avatarStyleToString } from "@spryte/client";

function SpriteAvatar({ spriteUrl, mappingUrl, pubkey, size = 48 }) {
  const [style, setStyle] = useState<string>("");

  useEffect(() => {
    loadSpriteSheet(spriteUrl, mappingUrl).then((sheet) => {
      const avatarStyle = getAvatarStyle(sheet, pubkey, size);
      if (avatarStyle) setStyle(avatarStyleToString(avatarStyle));
    });
  }, [spriteUrl, mappingUrl, pubkey, size]);

  return <div style={{ ...parseStyle(style), borderRadius: "50%" }} />;
}
```

### Using `@spryte/client` (Recommended)

The client library handles all of the above for you:

```typescript
import { Spryte } from "@spryte/client";

const spryte = new Spryte({ privateKey, serverPubkey });
await spryte.connect();

const sheet = await spryte.generate("target-pubkey");

// Get CSS for any follower's avatar
const style = spryte.getAvatarStyle(sheet, "follower-pubkey", 48);
if (style) {
  element.setAttribute("style", spryte.avatarStyleToString(style));
}
```
