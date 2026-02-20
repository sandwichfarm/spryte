import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { MemCache } from "./mem-cache.ts"
import { recordHit, recordMiss, recordWrite } from "./metrics.ts"

export interface CachedImage {
  pubkey: string
  sourceUrl: string
  blossomHash: string
  blossomUrl: string
  cachedAt: number
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const IMAGE_CACHE_TTL_MS = parseInt(
  Deno.env.get("IMAGE_CACHE_TTL_MS") ?? String(7 * 24 * 60 * 60 * 1000),
  10,
)

// ---------------------------------------------------------------------------
// In-memory cache for hot-path repeat lookups
// ---------------------------------------------------------------------------
const imgMemCache = new MemCache<string, CachedImage | null>({
  ttlMs: 60 * 60_000,
  maxSize: 5000,
})

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
  const ttlCutoff = Date.now() - IMAGE_CACHE_TTL_MS
  const rows = d.query(
    "SELECT pubkey, source_url, blossom_hash, blossom_url, cached_at FROM image_cache WHERE pubkey = ? AND cached_at > ?",
    [pubkey, ttlCutoff],
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
  // Invalidate mem cache for this pubkey
  imgMemCache.delete(pubkey)
}

/**
 * Swap in cached Blossom URLs where available.
 * Uses a single batch SQL query instead of N individual queries.
 * Returns the resolved mapping and list of pubkeys that were NOT cached.
 */
export function applyCachedUrls(
  mapping: Record<string, string>,
): { resolvedMapping: Record<string, string>; uncachedPubkeys: string[] } {
  const resolvedMapping: Record<string, string> = {}
  const uncachedPubkeys: string[] = []
  const entries = Object.entries(mapping)

  if (entries.length === 0) {
    return { resolvedMapping, uncachedPubkeys }
  }

  // Check mem cache first, collect pubkeys that need DB lookup
  const needDbLookup: Array<[string, string]> = []
  for (const [pubkey, sourceUrl] of entries) {
    if (imgMemCache.has(pubkey)) {
      recordHit("image_cache")
      const cached = imgMemCache.get(pubkey)
      if (cached && cached.sourceUrl === sourceUrl) {
        resolvedMapping[pubkey] = cached.blossomUrl
      } else {
        resolvedMapping[pubkey] = sourceUrl
        uncachedPubkeys.push(pubkey)
      }
    } else {
      needDbLookup.push([pubkey, sourceUrl])
    }
  }

  if (needDbLookup.length > 0) {
    recordMiss("image_cache")
    // Batch query: single SELECT for all uncached pubkeys
    const d = getDb()
    const ttlCutoff = Date.now() - IMAGE_CACHE_TTL_MS
    const pubkeys = needDbLookup.map(([pk]) => pk)
    const placeholders = pubkeys.map(() => "?").join(", ")
    const rows = d.query(
      `SELECT pubkey, source_url, blossom_hash, blossom_url, cached_at FROM image_cache WHERE pubkey IN (${placeholders}) AND cached_at > ?`,
      [...pubkeys, ttlCutoff],
    )

    // Build lookup from DB results
    const dbResults = new Map<string, CachedImage>()
    for (const row of rows) {
      const [pk, sourceUrl, blossomHash, blossomUrl, cachedAt] = row as [string, string, string, string, number]
      dbResults.set(pk, { pubkey: pk, sourceUrl, blossomHash, blossomUrl, cachedAt })
    }

    // Post-filter by source URL match and populate mem cache
    for (const [pubkey, sourceUrl] of needDbLookup) {
      const cached = dbResults.get(pubkey)
      if (cached && cached.sourceUrl === sourceUrl) {
        resolvedMapping[pubkey] = cached.blossomUrl
        imgMemCache.set(pubkey, cached)
        recordWrite("image_cache")
      } else {
        resolvedMapping[pubkey] = sourceUrl
        uncachedPubkeys.push(pubkey)
        imgMemCache.set(pubkey, cached ?? null)
        recordWrite("image_cache")
      }
    }
  }

  if (uncachedPubkeys.length < entries.length) {
    const cachedCount = entries.length - uncachedPubkeys.length
    console.log(`[image-cache] ${cachedCount} images served from Blossom cache, ${uncachedPubkeys.length} uncached`)
  }

  return { resolvedMapping, uncachedPubkeys }
}

// ---------------------------------------------------------------------------
// Eviction
// ---------------------------------------------------------------------------

/** Delete image cache entries older than IMAGE_CACHE_TTL_MS. Returns count deleted. */
export function evictExpiredImageCache(): number {
  const d = getDb()
  const cutoff = Date.now() - IMAGE_CACHE_TTL_MS
  d.query("DELETE FROM image_cache WHERE cached_at < ?", [cutoff])
  const deleted = d.changes
  if (deleted > 0) {
    console.log(`[image-cache] Evicted ${deleted} expired entries`)
  }
  return deleted
}

/** Close the image cache database. */
export function closeImageCacheDb(): void {
  imgMemCache.clear()
  if (db) {
    db.close()
    db = null
  }
  console.log("[image-cache] Database closed")
}
