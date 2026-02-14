import { collector } from "../collector/index.ts"
import { processor } from "../processor/core.ts"
import { uploadToBlossomServer, createSigner } from "./blossom.ts"
import { DB } from "https://deno.land/x/sqlite/mod.ts"

export interface SpryteToolResult {
  spriteUrl: string
  mappingUrl: string
  pubkeyCount: number
  cellSize: number
}

const DEFAULT_CELL_SIZE = 128
const FREE_TIER_CELL_SIZE = 128
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000

let generationsDb: DB | null = null

function getGenerationsDb(): DB {
  if (!generationsDb) {
    generationsDb = new DB("generations.db")
    generationsDb.execute(`
      CREATE TABLE IF NOT EXISTS generations (
        pubkey TEXT NOT NULL,
        generated_at INTEGER NOT NULL,
        cell_size INTEGER NOT NULL,
        PRIMARY KEY (pubkey, generated_at)
      )
    `)
  }
  return generationsDb
}

/** Check if a pubkey has generated a free sprite within the current month */
export function hasRecentFreeGeneration(pubkey: string): boolean {
  const db = getGenerationsDb()
  const cutoff = Date.now() - ONE_MONTH_MS
  const rows = db.query(
    "SELECT COUNT(*) FROM generations WHERE pubkey = ? AND generated_at > ? AND cell_size = ?",
    [pubkey, cutoff, FREE_TIER_CELL_SIZE],
  )
  const count = rows[0]?.[0] as number
  return count > 0
}

/** Record a generation for rate-limiting */
function recordGeneration(pubkey: string, cellSize: number): void {
  const db = getGenerationsDb()
  db.query("INSERT INTO generations (pubkey, generated_at, cell_size) VALUES (?, ?, ?)", [
    pubkey,
    Date.now(),
    cellSize,
  ])
}

/** Determine if this request should be paid */
export function shouldCharge(pubkey: string, cellSize: number): boolean {
  if (cellSize !== FREE_TIER_CELL_SIZE) return true
  return hasRecentFreeGeneration(pubkey)
}

/** Execute the generate-spryte pipeline: collect -> process -> upload */
export async function generateSpryte(
  pubkey: string,
  cellSize?: number,
  uploadServer?: string,
): Promise<SpryteToolResult> {
  const resolvedCellSize = cellSize ?? DEFAULT_CELL_SIZE
  const blossomServer = uploadServer ?? Deno.env.get("BLOSSOM_SERVER_URL") ?? "http://localhost:3000"

  // Create a temp directory to isolate this request
  const tempDir = await Deno.makeTempDir({ prefix: "spryte-" })
  const spritePath = `${tempDir}/sprite.png`
  const jsonPath = `${tempDir}/mapping.json`
  const defaultImagePath = new URL("../processor/default.png", import.meta.url).pathname

  try {
    // Step 1: Collect follower profile images
    console.log(`[spryte-tool] Collecting images for pubkey: ${pubkey}`)
    const mapping = await collector(pubkey)
    const pubkeyCount = Object.keys(mapping).length
    console.log(`[spryte-tool] Collected ${pubkeyCount} profile images`)

    // Step 2: Process into sprite sheet
    console.log(`[spryte-tool] Processing sprite (cellSize: ${resolvedCellSize})`)
    await processor(mapping, resolvedCellSize, spritePath, jsonPath, defaultImagePath)

    // Step 3: Upload to Blossom
    console.log(`[spryte-tool] Uploading to Blossom server: ${blossomServer}`)
    const spriteData = await Deno.readFile(spritePath)
    const mappingJson = await Deno.readTextFile(jsonPath)

    const hexKey = Deno.env.get("CVM_PRIVATE_KEY")
    if (!hexKey) throw new Error("CVM_PRIVATE_KEY not set")
    const signer = createSigner(hexKey)

    const { spriteUrl, mappingUrl } = await uploadToBlossomServer(
      spriteData,
      mappingJson,
      blossomServer,
      signer,
    )

    // Record this generation for rate-limiting
    recordGeneration(pubkey, resolvedCellSize)

    console.log(`[spryte-tool] Complete. Sprite: ${spriteUrl}, Mapping: ${mappingUrl}`)
    return { spriteUrl, mappingUrl, pubkeyCount, cellSize: resolvedCellSize }
  } finally {
    // Clean up temp directory
    try {
      await Deno.remove(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}
