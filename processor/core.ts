import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { initializeImageMagick, ImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm";
import { logParent, logChild } from "./logger.ts";
import { pMap } from "../cvm/concurrency.ts";

const IMAGE_FETCH_CONCURRENCY = parseInt(Deno.env.get("IMAGE_FETCH_CONCURRENCY") ?? "20", 10);

interface ProcessedImage {
  key: string;
  image: Image;
  isDefault: boolean;
}

export async function processor(
  mapping: Record<string, string>,
  cellSize: number,
  spritePath: string,
  jsonPath: string,
  defaultImagePath: string = "./default.png",
  enabledeanimateGifs: boolean = false,
  sourceMappingPath?: string,
  pubkey?: string
): Promise<void> {
  // Load the default image once.
  const defaultData = await Deno.readFile(defaultImagePath);
  const defaultImg = await Image.decode(defaultData);

  // Helper function to detect GIF images
  function isGif(data: Uint8Array): boolean {
    const header = new TextDecoder().decode(data.subarray(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }

  // Modified loadImage returns an object with a flag indicating if the default was used.
  async function loadImage(url: string): Promise<{ image: Image; isDefault: boolean } | null> {
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      try {
        let img;
        if (enabledeanimateGifs && isGif(uint8Array) && typeof (Image as any).decodeAnimation === 'function') {
          logParent("Decoding animated GIF using decodeAnimation", "info");
          try {
            const anim = await (Image as any).decodeAnimation(uint8Array);
            if (anim && anim.frames && anim.frames.length > 0) {
              img = anim.frames[0];
            } else {
              logChild("decodeAnimation returned no frames, falling back to Image.decode", 1, "warn");
              img = await Image.decode(uint8Array);
            }
          } catch (err) {
            logChild("decodeAnimation failed, falling back to Image.decode: " + err, 1, "warn");
            img = await Image.decode(uint8Array);
          }
        } else {
          img = await Image.decode(uint8Array);
        }
        return { image: img, isDefault: false };
      } catch (decodeError) {
        // Only attempt conversion if URL indicates a resource
        if (!(url.startsWith("http://") || url.startsWith("https://"))) {
          throw decodeError;
        }
        if (decodeError instanceof Error && decodeError.message.includes("Unsupported image type")) {
          // If the image is an animated GIF and animated flag is enabled, attempt decodeAnimation in catch block
          if (enabledeanimateGifs && isGif(uint8Array) && typeof (Image as any).decodeAnimation === 'function') {
            logParent("Attempting decodeAnimation in catch block for animated GIF", "info");
            try {
              const anim = await (Image as any).decodeAnimation(uint8Array);
              if (anim && anim.frames && anim.frames.length > 0) {
                return { image: anim.frames[0], isDefault: false };
              } else {
                logChild("decodeAnimation in catch returned no frames, skipping image.", 1, "warn");
                return null;
              }
            } catch (err) {
              logChild("decodeAnimation in catch failed: " + err, 1, "warn");
              return null;
            }
          }

          // Check if the image size is greater than 5MB; if so, skip conversion to avoid RangeError
          if (uint8Array.length > 5 * 1024 * 1024) {
            logParent("Image size is too large for WASM conversion, skipping image", "warn");
            return null;
          }

          // Attempt conversion using a WASM-based ImageMagick conversion
          try {
            logParent("Starting WASM conversion", "info");
            const wasmUrl = new URL("./magick.wasm", import.meta.url);
            logChild("WASM file URL: " + wasmUrl.toString(), 1, "verbose");
            const wasmBytes = await Deno.readFile(decodeURIComponent(wasmUrl.pathname));
            logChild("WASM bytes length: " + wasmBytes.length, 1, "verbose");
            if (!wasmBytes || wasmBytes.length === 0) {
              throw new Error("Failed to load WASM file or file is empty.");
            }
            await initializeImageMagick(wasmBytes);

            logChild("Calling ImageMagick.read", 1, "verbose");
            const imImage = await new Promise<any>((resolve, reject) => {
              ImageMagick.read(uint8Array, (image: any) => {
                if (image) {
                  logChild("ImageMagick.read callback returned an image", 1, "success");
                  resolve(image);
                } else {
                  reject(new Error('Failed to read image'));
                }
              });
            });

            logChild("imImage created", 1, "verbose");
            logChild("Calling imImage.write", 1, "verbose");
            const convertedData = await new Promise<Uint8Array>((resolve, reject) => {
              let called = false;
              const timer = setTimeout(() => {
                if (!called) {
                  logChild("imImage.write callback timed out", 1, "warn");
                  reject(new Error('Conversion write timed out'));
                }
              }, 5000);
              try {
                imImage.write(MagickFormat.Png, (data: Uint8Array) => {
                  called = true;
                  clearTimeout(timer);
                  logChild("Conversion write callback triggered.", 1, "success");
                  return data ? resolve(data) : reject(new Error('Conversion failed'));
                });
              } catch (innerErr) {
                reject(innerErr);
              }
            });
            logChild("WASM conversion completed successfully.", 1, "success");
            const img = await Image.decode(convertedData);
            return { image: img, isDefault: false };
          } catch (convErr) {
            if (convErr instanceof RangeError) {
              logChild("WASM conversion failed with RangeError, skipping image.", 1, "error");
            } else {
              logChild("WASM conversion failed: " + convErr, 1, "error");
            }
            // Fallback to default image if conversion fails
            return null;
          }
        }
        throw decodeError;
      }
    } catch (err) {
      // If there was no response, fallback to default image
      if (!response) {
        if (err instanceof Error && err.message.includes("Unsupported image type")) {
          const contentType = "unknown";
          err.message = `Error: Unsupported image type. Received content type: ${contentType} from URL: ${url}`;
        }
        logParent(`Error loading image from URL: ${url}`, "error");
        logChild("No response received. Error: " + err, 1, "error");
        return null;
      } else {
        // If we got a response, then the image was returned but processing (decoding/conversion) failed
        logParent(`Error processing image from URL: ${url}`, "error");
        logChild("Skipping this image. Error: " + err, 1, "error");
        return null;
      }
    }
  }

  const keys = Object.keys(mapping);

  const processedResultsOrNull = await pMap(
    keys,
    IMAGE_FETCH_CONCURRENCY,
    async (key) => {
      const url = mapping[key];
      const res = await loadImage(url);
      if (!res) {
        logChild(`Skipping image for key ${key} as loadImage returned null`, 1, "warn");
        return null;
      }
      const { image, isDefault } = res;
      const shortSide = Math.min(image.width, image.height);
      const scaleFactor = cellSize / shortSide;
      const newWidth = Math.round(image.width * scaleFactor);
      const newHeight = Math.round(image.height * scaleFactor);
      const resized = image.resize(newWidth, newHeight);
      const cropX = Math.floor((newWidth - cellSize) / 2);
      const cropY = Math.floor((newHeight - cellSize) / 2);
      const cropped = resized.crop(cropX, cropY, cellSize, cellSize);
      return { key, image: cropped, isDefault };
    },
  );

  const processedResults: ProcessedImage[] = processedResultsOrNull.filter((item): item is ProcessedImage => item !== null);

  // Separate non-default and default items.
  const nonDefaultItems = processedResults.filter((item) => !item.isDefault);
  const defaultItems = processedResults.filter((item) => item.isDefault);

  // We'll use only one cell for all default images if any exist.
  const totalCells = nonDefaultItems.length + (defaultItems.length > 0 ? 1 : 0);

  const columns = Math.ceil(Math.sqrt(totalCells));
  const rows = Math.ceil(totalCells / columns);
  const spriteWidth = columns * cellSize;
  const spriteHeight = rows * cellSize;

  const sprite = new Image(spriteWidth, spriteHeight);
  const outputMapping: Record<string, { x: number; y: number; source: string }> = {};

  // Place non-default images first.
  nonDefaultItems.forEach((item, index) => {
    const x = (index % columns) * cellSize;
    const y = Math.floor(index / columns) * cellSize;
    sprite.composite(item.image, x, y);
    outputMapping[item.key] = { x, y, source: mapping[item.key] };
  });

  // Place one default cell if needed.
  if (defaultItems.length > 0) {
    const defaultIndex = nonDefaultItems.length; // next cell after non-default images
    const x = (defaultIndex % columns) * cellSize;
    const y = Math.floor(defaultIndex / columns) * cellSize;
    sprite.composite(defaultImg, x, y);
    // Map all keys that used default image to the same cell and include the source URL
    defaultItems.forEach((item) => {
      outputMapping[item.key] = { x, y, source: mapping[item.key] };
    });
  }

  const spriteData = await sprite.encode(0);
  await Deno.writeFile(spritePath, spriteData);
  logParent(`Sprite image written to ${spritePath}`, "success");

  const mappingOutput = {
    cellDimensions: { width: cellSize, height: cellSize },
    mapping: outputMapping
  };
  await Deno.writeTextFile(jsonPath, JSON.stringify(mappingOutput, null, 2));
  logParent(`Sprite mapping JSON written to ${jsonPath}`, "success");

  if (sourceMappingPath && pubkey) {
    await Deno.writeTextFile(sourceMappingPath, JSON.stringify(mapping, null, 2));
    logParent(`Source files JSON written to ${sourceMappingPath}`, "success");
  }
}
