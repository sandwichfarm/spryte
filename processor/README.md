# Sprite Generator

This is a Deno application that builds a sprite image and a JSON mapping file from a given set of image URLs.

## How It Works

1. **Input:** Provide a JSON file (by default, `mapping.json`) that maps unique keys to image URLs.
2. **Image Processing:**
   - Each image is fetched. If a URL is invalid or fails, the local `default.jpg` is used.
   - The app detects the shortest side of the image.
   - The image is scaled so that its shortest side equals the desired dimension (default is 128×128 pixels).
   - The image is then center-cropped to a square of the desired dimension.
3. **Sprite Generation:**
   - All processed images are arranged in a grid to form a single sprite image.
   - A JSON mapping is created that tells you the `x` and `y` positions (plus width/height) of each image in the sprite.
4. **Output:** The sprite image (default name `sprite.png`) and the mapping JSON (default name `sprite-mapping.json`) are written to disk.

## Setup and Run

1. Place your default fallback image in the project root as `default.jpg`.

2. Edit the `mapping.json` file with your image URLs.

3. Run the application with:

   ```bash
   deno run --allow-net --allow-read --allow-write app.js --input mapping.json
   ```
Or, using the task defined in deno.json:

```
deno task start
```

4. Check the generated sprite.png and sprite-mapping.json.

## Parameters

- `--input`: Input JSON file (default: mapping.json)
- `--sprite`: Output sprite image filename (default: sprite.png)
- `--json`: Output JSON mapping filename (default: sprite-mapping.json)
- `--cellSize`: The desired dimension for the output square image cell (default: 128)
- `--default`: Path to the default image file (default: default.jpg)

```yaml
---
Assuming you have a valid `mapping.json` and a proper `default.jpg` image, run:

```bash
deno run --allow-net --allow-read --allow-write --unstable-sloppy-imports --unstable-worker-options main.ts --pubkey e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f --dimension 16 --mapping path/to/your/mapping.json --json output/mapping.json --sprite output/sprite.png --default processor/default.png --animated true --sourceMapping output/source_files.json
```
This will generate sprite.png (the sprite image) and sprite-mapping.json (the JSON mapping) in your project directory.