/**
 * Cross-platform math verification.
 *
 * Simulates the exact computations from Kotlin SpryteConsumer and Swift SpryteConsumer
 * using the same formulas, and verifies they match TypeScript getAvatarStyle().
 *
 * Usage: deno run --allow-read sdk/verify-cross-platform.ts
 */

import { fetchMapping } from "../client/src/sprites.ts";

// ---- TypeScript reference (from client/src/sprites.ts) ----
function tsGetAvatarStyle(
  mapping: any,
  imageWidth: number,
  imageHeight: number,
  pubkey: string,
  displaySize: number,
) {
  const entry = mapping.mapping[pubkey];
  if (!entry) return null;
  const scale = displaySize / mapping.cellDimensions.width;
  return {
    offsetX: -entry.x * scale,
    offsetY: -entry.y * scale,
    scaledWidth: imageWidth * scale,
    scaledHeight: imageHeight * scale,
  };
}

// ---- Kotlin simulation (uses Float, matching SpryteConsumer.kt) ----
function kotlinGetRenderInfo(
  mapping: any,
  imageWidth: number,
  imageHeight: number,
  pubkey: string,
  displaySize: number,
) {
  const entry = mapping.mapping[pubkey];
  if (!entry) return null;
  // Kotlin: displaySize.toFloat() / cellDimensions.width.toFloat()
  const scale = Math.fround(displaySize / mapping.cellDimensions.width);
  return {
    offsetX: Math.fround(-(Math.fround(entry.x * scale))),
    offsetY: Math.fround(-(Math.fround(entry.y * scale))),
    scaledWidth: Math.fround(Math.fround(imageWidth) * scale),
    scaledHeight: Math.fround(Math.fround(imageHeight) * scale),
  };
}

// ---- Swift simulation (uses CGFloat = Double, matching SpryteConsumer.swift) ----
function swiftRenderInfo(
  mapping: any,
  imageWidth: number,
  imageHeight: number,
  pubkey: string,
  displaySize: number,
) {
  const entry = mapping.mapping[pubkey];
  if (!entry) return null;
  // Swift: displaySize / CGFloat(cellDimensions.width) — Double precision
  const scale = displaySize / mapping.cellDimensions.width;
  return {
    offsetX: -(entry.x * scale),
    offsetY: -(entry.y * scale),
    scaledWidth: imageWidth * scale,
    scaledHeight: imageHeight * scale,
  };
}

// ---- Run verification ----
const raw = await Deno.readTextFile("sprite-mapping.json");
const mapping = JSON.parse(raw);

const entries = Object.values(mapping.mapping) as { x: number; y: number }[];
const maxX = Math.max(...entries.map((e) => e.x));
const maxY = Math.max(...entries.map((e) => e.y));
const imageWidth = maxX + mapping.cellDimensions.width;
const imageHeight = maxY + mapping.cellDimensions.height;

const pubkeys = Object.keys(mapping.mapping);
const displaySize = 48;

let allMatch = true;
let tested = 0;

for (const pubkey of pubkeys) {
  const ts = tsGetAvatarStyle(mapping, imageWidth, imageHeight, pubkey, displaySize)!;
  const kt = kotlinGetRenderInfo(mapping, imageWidth, imageHeight, pubkey, displaySize)!;
  const sw = swiftRenderInfo(mapping, imageWidth, imageHeight, pubkey, displaySize)!;

  // Check Swift matches TS exactly (both use double precision)
  const swiftMatch =
    ts.offsetX === sw.offsetX &&
    ts.offsetY === sw.offsetY &&
    ts.scaledWidth === sw.scaledWidth &&
    ts.scaledHeight === sw.scaledHeight;

  // Check Kotlin is within float tolerance of TS
  const tolerance = 0.01;
  const kotlinMatch =
    Math.abs(ts.offsetX - kt.offsetX) < tolerance &&
    Math.abs(ts.offsetY - kt.offsetY) < tolerance &&
    Math.abs(ts.scaledWidth - kt.scaledWidth) < tolerance &&
    Math.abs(ts.scaledHeight - kt.scaledHeight) < tolerance;

  if (!swiftMatch || !kotlinMatch) {
    console.log(`MISMATCH for ${pubkey}:`);
    console.log(`  TS:     offsetX=${ts.offsetX} offsetY=${ts.offsetY} w=${ts.scaledWidth} h=${ts.scaledHeight}`);
    console.log(`  Kotlin: offsetX=${kt.offsetX} offsetY=${kt.offsetY} w=${kt.scaledWidth} h=${kt.scaledHeight}`);
    console.log(`  Swift:  offsetX=${sw.offsetX} offsetY=${sw.offsetY} w=${sw.scaledWidth} h=${sw.scaledHeight}`);
    allMatch = false;
  }
  tested++;
}

console.log(`\nTested ${tested} pubkeys across TypeScript, Kotlin (Float), and Swift (Double).`);
if (allMatch) {
  console.log("ALL MATCH — cross-platform render math verified.");
} else {
  console.log("SOME MISMATCHES — see above.");
  Deno.exit(1);
}
