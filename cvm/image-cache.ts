import { DB } from "https://deno.land/x/sqlite/mod.ts"

export interface CachedImage {
  pubkey: string
  sourceUrl: string
  blossomHash: string
  blossomUrl: string
  cachedAt: number
}

let db: DB | null = null

function getDb(): DB {
  if (!db) {
    db = new DB("image_cache.db")
    db.execute(`
      CREATE TABLE IF NOT EXISTS image_cache (
        pubkey TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        blossom_hash TEXT NOT NULL,
        blossom_url TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      )
    `)
  }
  return db
}

/** Get cached image for a pubkey. Returns null if URL changed (cache invalidated). */
export function getCachedImage(pubkey: string, currentSourceUrl: string): CachedImage | null {
  const d = getDb()
  const rows = d.query(
    "SELECT pubkey, source_url, blossom_hash, blossom_url, cached_at FROM image_cache WHERE pubkey = ?",
    [pubkey],
  )
  if (rows.length === 0) return null

  const [pk, sourceUrl, blossomHash, blossomUrl, cachedAt] = rows[0] as [
    string, string, string, string, number,
  ]

  // Invalidate if source URL changed
  if (sourceUrl !== currentSourceUrl) return null

  return { pubkey: pk, sourceUrl, blossomHash, blossomUrl, cachedAt }
}

/** Upsert a cached image record. */
export function setCachedImage(
  pubkey: string,
  sourceUrl: string,
  blossomHash: string,
  blossomUrl: string,
): void {
  const d = getDb()
  d.query(
    "INSERT OR REPLACE INTO image_cache (pubkey, source_url, blossom_hash, blossom_url, cached_at) VALUES (?, ?, ?, ?, ?)",
    [pubkey, sourceUrl, blossomHash, blossomUrl, Date.now()],
  )
}

/**
 * Swap in cached Blossom URLs where available.
 * Returns the resolved mapping and list of pubkeys that were NOT cached.
 */
export function applyCachedUrls(
  mapping: Record<string, string>,
): { resolvedMapping: Record<string, string>; uncachedPubkeys: string[] } {
  const resolvedMapping: Record<string, string> = {}
  const uncachedPubkeys: string[] = []

  for (const [pubkey, sourceUrl] of Object.entries(mapping)) {
    const cached = getCachedImage(pubkey, sourceUrl)
    if (cached) {
      resolvedMapping[pubkey] = cached.blossomUrl
    } else {
      resolvedMapping[pubkey] = sourceUrl
      uncachedPubkeys.push(pubkey)
    }
  }

  if (uncachedPubkeys.length < Object.keys(mapping).length) {
    const cachedCount = Object.keys(mapping).length - uncachedPubkeys.length
    console.log(`[image-cache] ${cachedCount} images served from Blossom cache, ${uncachedPubkeys.length} uncached`)
  }

  return { resolvedMapping, uncachedPubkeys }
}

/** Close the image cache database. */
export function closeImageCacheDb(): void {
  if (db) {
    db.close()
    db = null
  }
  console.log("[image-cache] Database closed")
}
