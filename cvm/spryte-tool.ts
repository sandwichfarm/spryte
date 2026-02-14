import { collector } from "../collector/index.ts"
import { processor } from "../processor/core.ts"
import { uploadToBlossomServer, createSigner } from "./blossom.ts"
import { applyCachedUrls, setCachedImage } from "./image-cache.ts"
import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { BlossomClient } from "blossom-client-sdk"

export interface SpryteToolResult {
  spriteUrl: string
  mappingUrl: string
  pubkeyCount: number
  cellSize: number
  cached?: boolean
  limitReasons?: string[]
  totalFollowers?: number
}

export interface GenerationRecord {
  id: string
  clientPubkey: string
  targetPubkey: string
  generatedAt: number
  cellSize: number
  spriteUrl: string | null
  mappingUrl: string | null
  pubkeyCount: number | null
}

const DEFAULT_CELL_SIZE = 128

let generationsDb: DB | null = null

function getGenerationsDb(): DB {
  if (!generationsDb) {
    generationsDb = new DB("generations.db")

    // Check if the old schema exists (composite PK without id column)
    const tableInfo = generationsDb.query("PRAGMA table_info(generations)")
    const columns = tableInfo.map((row) => row[1] as string)

    if (columns.length > 0 && !columns.includes("id")) {
      // Old schema detected — drop and recreate
      console.log("[spryte-tool] Migrating generations table to new schema")
      generationsDb.execute("DROP TABLE generations")
    }

    generationsDb.execute(`
      CREATE TABLE IF NOT EXISTS generations (
        id TEXT PRIMARY KEY,
        client_pubkey TEXT NOT NULL,
        target_pubkey TEXT NOT NULL,
        generated_at INTEGER NOT NULL,
        cell_size INTEGER NOT NULL,
        sprite_url TEXT,
        mapping_url TEXT,
        pubkey_count INTEGER
      )
    `)
    generationsDb.execute(
      `CREATE INDEX IF NOT EXISTS idx_gen_client ON generations (client_pubkey, generated_at)`,
    )
    generationsDb.execute(
      `CREATE INDEX IF NOT EXISTS idx_gen_lookup ON generations (client_pubkey, target_pubkey, generated_at)`,
    )
  }
  return generationsDb
}

/** Count recent generations for a client pubkey since a cutoff timestamp. */
export function getRecentGenerationCount(clientPubkey: string, sinceCutoff: number): number {
  const db = getGenerationsDb()
  const rows = db.query(
    "SELECT COUNT(*) FROM generations WHERE client_pubkey = ? AND generated_at > ?",
    [clientPubkey, sinceCutoff],
  )
  return (rows[0]?.[0] as number) ?? 0
}

/** Get the latest generation for a client+target pair. */
export function getLatestGeneration(clientPubkey: string, targetPubkey: string): GenerationRecord | null {
  const db = getGenerationsDb()
  const rows = db.query(
    "SELECT id, client_pubkey, target_pubkey, generated_at, cell_size, sprite_url, mapping_url, pubkey_count FROM generations WHERE client_pubkey = ? AND target_pubkey = ? ORDER BY generated_at DESC LIMIT 1",
    [clientPubkey, targetPubkey],
  )
  if (rows.length === 0) return null
  const [id, cp, tp, generatedAt, cellSize, spriteUrl, mappingUrl, pubkeyCount] = rows[0] as [
    string, string, string, number, number, string | null, string | null, number | null,
  ]
  return { id, clientPubkey: cp, targetPubkey: tp, generatedAt, cellSize, spriteUrl, mappingUrl, pubkeyCount }
}

/** Record a completed generation. */
export function recordGeneration(
  clientPubkey: string,
  targetPubkey: string,
  cellSize: number,
  spriteUrl: string | null,
  mappingUrl: string | null,
  pubkeyCount: number | null,
): void {
  const db = getGenerationsDb()
  const id = crypto.randomUUID()
  db.query(
    "INSERT INTO generations (id, client_pubkey, target_pubkey, generated_at, cell_size, sprite_url, mapping_url, pubkey_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, clientPubkey, targetPubkey, Date.now(), cellSize, spriteUrl, mappingUrl, pubkeyCount],
  )
}

export interface GenerateSpryteOptions {
  clientPubkey?: string
  maxImages?: number | null
  paid?: boolean
}

/** Execute the generate-spryte pipeline: collect -> cache -> process -> upload */
export async function generateSpryte(
  pubkey: string,
  cellSize?: number,
  uploadServer?: string,
  options?: GenerateSpryteOptions,
): Promise<SpryteToolResult> {
  const resolvedCellSize = cellSize ?? DEFAULT_CELL_SIZE
  const blossomServer = uploadServer ?? Deno.env.get("BLOSSOM_SERVER_URL") ?? "http://localhost:3000"
  const clientPubkey = options?.clientPubkey ?? ""
  const maxImages = options?.maxImages
  const limitReasons: string[] = []

  // Create a temp directory to isolate this request
  const tempDir = await Deno.makeTempDir({ prefix: "spryte-" })
  const spritePath = `${tempDir}/sprite.png`
  const jsonPath = `${tempDir}/mapping.json`
  const defaultImagePath = new URL("../processor/default.png", import.meta.url).pathname

  try {
    // Step 1: Collect follower profile images
    console.log(`[spryte-tool] Collecting images for pubkey: ${pubkey}`)
    const mapping = await collector(pubkey)
    const totalFollowers = Object.keys(mapping).length
    console.log(`[spryte-tool] Collected ${totalFollowers} profile images`)

    // Step 2: Apply image cache — swap in Blossom URLs where available
    const { resolvedMapping, uncachedPubkeys } = await applyCachedUrls(mapping)

    // Step 3: Truncate if maxImages is set
    let finalMapping = resolvedMapping
    if (maxImages != null && Object.keys(finalMapping).length > maxImages) {
      const keys = Object.keys(finalMapping).slice(0, maxImages)
      const truncated: Record<string, string> = {}
      for (const key of keys) {
        truncated[key] = finalMapping[key]
      }
      finalMapping = truncated
      limitReasons.push("image_limit")
    }

    const pubkeyCount = Object.keys(finalMapping).length

    // Step 4: Process into sprite sheet
    console.log(`[spryte-tool] Processing sprite (cellSize: ${resolvedCellSize}, images: ${pubkeyCount})`)
    await processor(finalMapping, resolvedCellSize, spritePath, jsonPath, defaultImagePath)

    // Step 5: Upload to Blossom
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

    // Record this generation
    if (clientPubkey) {
      recordGeneration(clientPubkey, pubkey, resolvedCellSize, spriteUrl, mappingUrl, pubkeyCount)
    }

    console.log(`[spryte-tool] Complete. Sprite: ${spriteUrl}, Mapping: ${mappingUrl}`)

    // Step 6: Async fire-and-forget — upload uncached images to Blossom
    if (uncachedPubkeys.length > 0) {
      cacheUncachedImages(uncachedPubkeys, mapping, blossomServer, signer).catch((err) => {
        console.error("[spryte-tool] Background image caching failed:", err)
      })
    }

    const result: SpryteToolResult = { spriteUrl, mappingUrl, pubkeyCount, cellSize: resolvedCellSize }
    if (limitReasons.length > 0) result.limitReasons = limitReasons
    if (totalFollowers !== pubkeyCount) result.totalFollowers = totalFollowers
    return result
  } finally {
    // Clean up temp directory
    try {
      await Deno.remove(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}

/** Upload uncached profile images to Blossom and record in cache (fire-and-forget). */
async function cacheUncachedImages(
  uncachedPubkeys: string[],
  originalMapping: Record<string, string>,
  blossomServer: string,
  signer: { getPublicKey(): string; signEvent(t: any): Promise<any> },
): Promise<void> {
  const blossomSigner = async (draft: { created_at: number; kind: number; content: string; tags: string[][] }) => {
    return await signer.signEvent(draft)
  }

  for (const pk of uncachedPubkeys) {
    const sourceUrl = originalMapping[pk]
    if (!sourceUrl) continue

    try {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) continue
      const data = await response.arrayBuffer()

      const ext = sourceUrl.split(".").pop()?.split("?")[0] ?? "png"
      const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png"
      const file = new File([data], `avatar.${ext}`, { type: contentType })

      const auth = await BlossomClient.createUploadAuth(blossomSigner, file, {
        servers: [blossomServer],
        message: "Cache profile image",
      })
      const blob = await BlossomClient.uploadBlob(blossomServer, file, { auth })

      setCachedImage(pk, sourceUrl, blob.sha256 ?? "", blob.url)
    } catch {
      // Skip failed uploads silently
    }
  }
}

/** Close the generations database. */
export function closeGenerationsDb(): void {
  if (generationsDb) {
    generationsDb.close()
    generationsDb = null
  }
}
