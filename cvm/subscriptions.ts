import { DB } from "https://deno.land/x/sqlite/mod.ts"

export interface Subscription {
  pubkey: string
  planId: string
  period: string
  startedAt: number
  expiresAt: number
}

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

/** Get active subscription for a pubkey (not expired). */
export function getActiveSubscription(pubkey: string): Subscription | null {
  const d = getDb()
  const now = Date.now()
  const rows = d.query(
    "SELECT pubkey, plan_id, period, started_at, expires_at FROM subscriptions WHERE pubkey = ? AND expires_at > ?",
    [pubkey, now],
  )
  if (rows.length === 0) return null
  const [pk, planId, period, startedAt, expiresAt] = rows[0] as [string, string, string, number, number]
  return { pubkey: pk, planId, period, startedAt, expiresAt }
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

  console.log(`[subscriptions] Created ${period} subscription to '${planId}' for ${pubkey.slice(0, 8)}… (expires ${new Date(expiresAt).toISOString()})`)

  return { pubkey, planId, period, startedAt: now, expiresAt }
}

/** Close the subscriptions database. */
export function closeSubscriptionsDb(): void {
  if (db) {
    db.close()
    db = null
  }
  console.log("[subscriptions] Database closed")
}
