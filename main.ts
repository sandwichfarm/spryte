import { parse } from "https://deno.land/std@0.203.0/flags/mod.ts";
import { collector } from "./collector/index";
import { processor } from "./processor/core";

const args = parse(Deno.args, {
  string: ["pubkey", "dimension", "sprite", "json", "defaultImage", "sourceMapping"],
  boolean: ["deanimate"],
  default: {
    sprite: "sprite.png",
    json: "sprite-mapping.json",
    dimension: "128",
    defaultImage: "./default.png",
    deanimate: false
  },
});

if (!args.pubkey) {
  console.error(
    "Usage: deno run --allow-net --allow-read --allow-write main.ts --pubkey <pubkey> --dimension <size> --mapping <mapping_json_path> --sprite <sprite_filename> --json <json_filename> [--defaultImage <default_image_path>] [--deanimate] [--sourceMapping <source_mapping_json>]"
  );
  Deno.exit(1);
}

const pubkey: string = args.pubkey;
const cellSize: number = parseInt(args.dimension, 10);

console.log(`Collecting photo mapping for pubkey: ${pubkey}...`);
const photoMapping = await collector(pubkey);

console.log(`Processing sprite with cell dimension: ${cellSize}px...`);
await processor(
  photoMapping,
  cellSize,
  args.sprite,
  args.json,
  args.defaultImage,
  args.deanimate,
  args.sourceMapping,
  pubkey
);

console.log("Sprite generation complete.");