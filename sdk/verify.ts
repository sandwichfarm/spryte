/**
 * Cross-platform SDK verification script.
 *
 * Loads the generated sprite-mapping.json, computes render info using the
 * TypeScript reference implementation, and prints values that Kotlin and
 * Swift SDKs must match exactly.
 *
 * Usage:
 *   deno run --allow-read sdk/verify.ts
 */

import type { SpriteMapping } from "../client/src/types.ts";

const MAPPING_PATH = "sprite-mapping.json";
const DISPLAY_SIZE = 48;

// Load mapping
const raw = await Deno.readTextFile(MAPPING_PATH);
const mapping: SpriteMapping = JSON.parse(raw);

// Compute image dimensions from mapping (same as SDK approach)
const entries = Object.values(mapping.mapping);
const maxX = Math.max(...entries.map((e) => e.x));
const maxY = Math.max(...entries.map((e) => e.y));
const imageWidth = maxX + mapping.cellDimensions.width;
const imageHeight = maxY + mapping.cellDimensions.height;

console.log("=== Sprite Sheet Info ===");
console.log(`cellDimensions: ${mapping.cellDimensions.width}x${mapping.cellDimensions.height}`);
console.log(`imageWidth: ${imageWidth}`);
console.log(`imageHeight: ${imageHeight}`);
console.log(`Total pubkeys: ${Object.keys(mapping.mapping).length}`);
console.log();

// Pick a few pubkeys to verify
const pubkeys = Object.keys(mapping.mapping).slice(0, 5);

console.log("=== Render Info Verification (displaySize=48) ===");
console.log("These values must match exactly in Kotlin and Swift SDKs.");
console.log();

for (const pubkey of pubkeys) {
  const entry = mapping.mapping[pubkey];
  const scale = DISPLAY_SIZE / mapping.cellDimensions.width;
  const offsetX = -(entry.x * scale);
  const offsetY = -(entry.y * scale);
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;

  console.log(`pubkey: ${pubkey}`);
  console.log(`  entry: x=${entry.x}, y=${entry.y}`);
  console.log(`  scale: ${scale}`);
  console.log(`  offsetX: ${offsetX}`);
  console.log(`  offsetY: ${offsetY}`);
  console.log(`  scaledWidth: ${scaledWidth}`);
  console.log(`  scaledHeight: ${scaledHeight}`);
  console.log();
}

// Also verify with plan's reference test values
console.log("=== Reference Test (from plan) ===");
console.log("cellDimensions.width=128, displaySize=48, entry at x=256 y=128, imageWidth=1664, imageHeight=1664");
{
  const scale = 48 / 128;
  const offsetX = -(256 * scale);
  const offsetY = -(128 * scale);
  const scaledWidth = 1664 * scale;
  const scaledHeight = 1664 * scale;
  console.log(`  scale: ${scale} (expected 0.375)`);
  console.log(`  offsetX: ${offsetX} (expected -96.0)`);
  console.log(`  offsetY: ${offsetY} (expected -48.0)`);
  console.log(`  scaledWidth: ${scaledWidth} (expected 624.0)`);
  console.log(`  scaledHeight: ${scaledHeight} (expected 624.0)`);
}
