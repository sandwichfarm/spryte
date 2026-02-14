import type { SpriteMapping, SpriteSheet, SpriteAvatarStyle } from "./types.js";

/**
 * Fetch and parse a sprite mapping JSON from a URL.
 */
export async function fetchMapping(mappingUrl: string): Promise<SpriteMapping> {
  const res = await fetch(mappingUrl);
  if (!res.ok) throw new Error(`Failed to fetch mapping: ${res.status}`);
  return res.json();
}

/**
 * Probe the natural dimensions of a sprite image.
 * Works in browser environments.
 */
export function probeImageSize(
  spriteUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image constructor not available (server environment)"));
      return;
    }
    const img = new (globalThis as any).Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load sprite: ${spriteUrl}`));
    img.src = spriteUrl;
  });
}

/**
 * Load a complete SpriteSheet: fetch the mapping and probe the image dimensions.
 */
export async function loadSpriteSheet(
  spriteUrl: string,
  mappingUrl: string,
): Promise<SpriteSheet> {
  const [mapping, size] = await Promise.all([
    fetchMapping(mappingUrl),
    probeImageSize(spriteUrl),
  ]);

  return {
    spriteUrl,
    mapping,
    imageWidth: size.width,
    imageHeight: size.height,
  };
}

/**
 * Compute CSS properties to render a single avatar from a sprite sheet.
 *
 * @param sheet - A loaded SpriteSheet
 * @param pubkey - The hex pubkey to look up
 * @param displaySize - Desired avatar size in pixels (default: 48)
 * @returns CSS properties object, or null if pubkey not in mapping
 */
export function getAvatarStyle(
  sheet: SpriteSheet,
  pubkey: string,
  displaySize: number = 48,
): SpriteAvatarStyle | null {
  const entry = sheet.mapping.mapping[pubkey];
  if (!entry) return null;

  const { width } = sheet.mapping.cellDimensions;
  const scale = displaySize / width;

  return {
    backgroundImage: `url('${sheet.spriteUrl}')`,
    backgroundPosition: `${-entry.x * scale}px ${-entry.y * scale}px`,
    backgroundSize: `${sheet.imageWidth * scale}px ${sheet.imageHeight * scale}px`,
    backgroundRepeat: "no-repeat",
    width: `${displaySize}px`,
    height: `${displaySize}px`,
  };
}

/**
 * Convert a SpriteAvatarStyle to a CSS string for use in style attributes.
 */
export function avatarStyleToString(style: SpriteAvatarStyle): string {
  return [
    `background-image: ${style.backgroundImage}`,
    `background-position: ${style.backgroundPosition}`,
    `background-size: ${style.backgroundSize}`,
    `background-repeat: ${style.backgroundRepeat}`,
    `width: ${style.width}`,
    `height: ${style.height}`,
  ].join("; ");
}

/**
 * Get all pubkeys present in a sprite mapping.
 */
export function getPubkeys(mapping: SpriteMapping): string[] {
  return Object.keys(mapping.mapping);
}

/**
 * Check if a pubkey exists in a sprite mapping.
 */
export function hasPubkey(mapping: SpriteMapping, pubkey: string): boolean {
  return pubkey in mapping.mapping;
}
