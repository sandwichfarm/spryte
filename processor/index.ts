// I am replacing the entire contents of index.ts with a new CLI implementation
import { parse } from "https://deno.land/std/flags/mod.ts";
import { processor } from "./core.ts";

if (import.meta.main) {
  const args = parse(Deno.args, {
    boolean: ["animated"],
    string: ["pubkey", "dimension", "mapping", "sprite", "json", "defaultImage", "sourceMapping"]
  });

  if (!args.pubkey || !args.dimension || !args.mapping || !args.sprite || !args.json) {
    console.error(
      "Usage: deno run --allow-read --allow-write --allow-net index.ts --pubkey=<pubkey> --dimension=<dimension> --mapping=<mapping_json_path> --sprite=<sprite_output_path> --json=<sprite_mapping_json_path> [--defaultImage=<default_image_path>] [--animated] [--sourceMapping=<source_files_json_output_path>]"
    );
    Deno.exit(1);
  }

  let mapping;
  try {
    const mappingContent = await Deno.readTextFile(args.mapping);
    mapping = JSON.parse(mappingContent);
  } catch (error) {
    console.error("Failed to read mapping JSON file:", error);
    Deno.exit(1);
  }

  const cellSize = parseInt(args.dimension);
  const pubkey = args.pubkey; // though not directly used here, could be used later if needed
  const spritePath = args.sprite;
  const jsonPath = args.json;
  const defaultImage = args.defaultImage || "./default.png";
  const animated = args.animated || false;
  const sourceMapping = args.sourceMapping; // new CLI argument for source files JSON output

  await processor(mapping, cellSize, spritePath, jsonPath, defaultImage, animated, sourceMapping, pubkey);
}
