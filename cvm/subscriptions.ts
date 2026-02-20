import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { MemCache } from "./mem-cache.ts"
import { recordHit, recordMiss, recordWrite } from "./metrics.ts"

export interface Subscription {
  pubkey: string
  planId: string
  period: string
  startedAt: number
  expiresAt: number
}

// ---------------------------------------------------------------------------
// In-memory cache (caches null for free-tier users)
// ---------------------------------------------------------------------------
const subCache = new MemCache<string, Subscription | null>({
  ttlMs: 5 * 60_000,
  maxSize: 500,
})

let db: DB | null = null

function getDb(): DB {
  if (!db) {
    db = new DB("subscriptions.db")
    db.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        pubkey TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        period TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `)
  }
  return db
}

/** Get active subscription for a pubkey (not expired). Uses mem cache. */
export function getActiveSubscription(pubkey: string): Subscription | null {
  // Check mem cache first
  if (subCache.has(pubkey)) {
    recordHit("subscription_cache")
    return subCache.get(pubkey) ?? null
  }

  recordMiss("subscription_cache")

  const d = getDb()
  const now = Date.now()
  const rows = d.query(
    "SELECT pubkey, plan_id, period, started_at, expires_at FROM subscriptions WHERE pubkey = ? AND expires_at > ?",
    [pubkey, now],
  )

  if (rows.length === 0) {
    // Cache null — avoids repeated DB reads for free-tier users
    subCache.set(pubkey, null)
    recordWrite("subscription_cache")
    return null
  }

  const [pk, planId, period, startedAt, expiresAt] = rows[0] as [string, string, string, number, number]
  const sub: Subscription = { pubkey: pk, planId, period, startedAt, expiresAt }
  subCache.set(pubkey, sub)
  recordWrite("subscription_cache")
  return sub
}

/** Get all active (non-expired) subscriptions. */
export function getAllActiveSubscriptions(): Subscription[] {
  const d = getDb()
  const now = Date.now()
  const rows = d.query(
    "SELECT pubkey, plan_id, period, started_at, expires_at FROM subscriptions WHERE expires_at > ?",
    [now],
  )
  return rows.map(([pk, planId, period, startedAt, expiresAt]) => ({
    pubkey: pk as string,
    planId: planId as string,
    period: period as string,
    startedAt: startedAt as number,
    expiresAt: expiresAt as number,
  }))
}

/** Get the effective plan ID for a pubkey (defaults to "free"). */
export function getEffectivePlanId(pubkey: string): string {
  const sub = getActiveSubscription(pubkey)
  return sub?.planId ?? "free"
}

/** Create or replace a subscription. Calculates expiry based on period. */
export function createSubscription(pubkey: string, planId: string, period: string): Subscription {
  const d = getDb()
  const now = Date.now()
  const durationMs = period === "yearly"
    ? 365 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000
  const expiresAt = now + durationMs

  d.query(
    "INSERT OR REPLACE INTO subscriptions (pubkey, plan_id, period, started_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [pubkey, planId, period, now, expiresAt],
  )

  // Invalidate mem cache so next read picks up the new subscription
  subCache.delete(pubkey)

  console.log(`[subscriptions] Created ${period} subscription to '${planId}' for ${pubkey.slice(0, 8)}… (expires ${new Date(expiresAt).toISOString()})`)

  return { pubkey, planId, period, startedAt: now, expiresAt }
}

// ---------------------------------------------------------------------------
// Eviction
// ---------------------------------------------------------------------------

/** Delete expired subscriptions. Returns count deleted. */
export function evictExpiredSubscriptions(): number {
  const d = getDb()
  d.query("DELETE FROM subscriptions WHERE expires_at < ?", [Date.now()])
  const deleted = d.changes
  if (deleted > 0) {
    console.log(`[subscriptions] Evicted ${deleted} expired subscriptions`)
  }
  return deleted
}

/** Close the subscriptions database. */
export function closeSubscriptionsDb(): void {
  subCache.clear()
  if (db) {
    db.close()
    db = null
  }
  console.log("[subscriptions] Database closed")
}
