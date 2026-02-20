import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { isolatedTestDir, fakePubkey } from "./helpers.ts"
import {
  setCachedImage,
  getCachedImage,
  evictExpiredImageCache,
  closeImageCacheDb,
} from "../image-cache.ts"
import {
  evictExpiredSubscriptions,
  getActiveSubscription,
  closeSubscriptionsDb,
} from "../subscriptions.ts"
import {
  evictOldJobs,
  closeJobsDb,
} from "../job-queue.ts"
import {
  recordGeneration,
  evictOldGenerations,
  getRecentGenerationCount,
  closeGenerationsDb,
} from "../spryte-tool.ts"
import { evictOldEvents } from "../../collector/index.ts"

let cleanup: () => Promise<void>

async function beforeEach() {
  const iso = await isolatedTestDir()
  cleanup = iso.cleanup
}

// ---------------------------------------------------------------------------
// Image cache eviction
// ---------------------------------------------------------------------------

Deno.test("evictExpiredImageCache deletes old entries, keeps recent", async () => {
  await beforeEach()
  try {
    const oldPk = fakePubkey(1)
    const newPk = fakePubkey(2)

    // Insert directly with old timestamp (8 days ago)
    const db = new DB("image_cache.db")
    db.execute(`
      CREATE TABLE IF NOT EXISTS image_cache (
        pubkey TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        blossom_hash TEXT NOT NULL,
        blossom_url TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      )
    `)
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    db.query(
      "INSERT INTO image_cache (pubkey, source_url, blossom_hash, blossom_url, cached_at) VALUES (?, ?, ?, ?, ?)",
      [oldPk, "https://old.png", "hash1", "https://blossom/hash1", eightDaysAgo],
    )
    db.close()

    // Insert a recent one through the module
    closeImageCacheDb()
    setCachedImage(newPk, "https://new.png", "hash2", "https://blossom/hash2")

    const deleted = evictExpiredImageCache()
    assertEquals(deleted, 1)

    // Old one is gone
    assertEquals(getCachedImage(oldPk, "https://old.png"), null)
    // New one remains
    const cached = getCachedImage(newPk, "https://new.png")
    assertEquals(cached !== null, true)
    assertEquals(cached!.blossomHash, "hash2")
  } finally {
    closeImageCacheDb()
    await cleanup()
  }
})

// ---------------------------------------------------------------------------
// Subscription eviction
// ---------------------------------------------------------------------------

Deno.test("evictExpiredSubscriptions deletes expired, keeps active", async () => {
  await beforeEach()
  try {
    const expiredPk = fakePubkey(10)
    const activePk = fakePubkey(11)

    const db = new DB("subscriptions.db")
    db.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        pubkey TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        period TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `)
    // Expired subscription
    db.query(
      "INSERT INTO subscriptions (pubkey, plan_id, period, started_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      [expiredPk, "pro", "monthly", Date.now() - 60_000_000, Date.now() - 1000],
    )
    // Active subscription
    db.query(
      "INSERT INTO subscriptions (pubkey, plan_id, period, started_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      [activePk, "pro", "monthly", Date.now(), Date.now() + 60_000_000],
    )
    db.close()

    closeSubscriptionsDb()
    const deleted = evictExpiredSubscriptions()
    assertEquals(deleted, 1)

    assertEquals(getActiveSubscription(expiredPk), null)
    const active = getActiveSubscription(activePk)
    assertEquals(active !== null, true)
    assertEquals(active!.planId, "pro")
  } finally {
    closeSubscriptionsDb()
    await cleanup()
  }
})

// ---------------------------------------------------------------------------
// Job eviction
// ---------------------------------------------------------------------------

Deno.test("evictOldJobs deletes old completed/failed, keeps recent and pending", async () => {
  await beforeEach()
  try {
    const db = new DB("jobs.db")
    db.execute(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        pubkey TEXT NOT NULL,
        cell_size INTEGER NOT NULL,
        upload_server TEXT NOT NULL,
        client_pubkey TEXT NOT NULL DEFAULT '',
        request_invoice INTEGER NOT NULL DEFAULT 0,
        max_images INTEGER,
        paid INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        result TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        timeout_ms INTEGER NOT NULL DEFAULT 300000
      )
    `)
    db.execute(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status, priority, created_at)`)

    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
    const now = Date.now()

    // Old completed job (should be evicted)
    db.query(
      "INSERT INTO jobs (id, pubkey, cell_size, upload_server, status, created_at, completed_at, timeout_ms) VALUES (?, ?, ?, ?, 'completed', ?, ?, 300000)",
      ["old-completed", fakePubkey(1), 128, "http://localhost", tenDaysAgo, tenDaysAgo],
    )
    // Recent completed job (should survive)
    db.query(
      "INSERT INTO jobs (id, pubkey, cell_size, upload_server, status, created_at, completed_at, timeout_ms) VALUES (?, ?, ?, ?, 'completed', ?, ?, 300000)",
      ["new-completed", fakePubkey(2), 128, "http://localhost", now, now],
    )
    // Old pending job (should survive — not completed/failed)
    db.query(
      "INSERT INTO jobs (id, pubkey, cell_size, upload_server, status, created_at, timeout_ms) VALUES (?, ?, ?, ?, 'pending', ?, 300000)",
      ["old-pending", fakePubkey(3), 128, "http://localhost", tenDaysAgo],
    )
    db.close()

    closeJobsDb()
    const deleted = evictOldJobs()
    assertEquals(deleted, 1)

    // Verify
    const checkDb = new DB("jobs.db", { mode: "read" })
    const remaining = checkDb.query("SELECT id FROM jobs ORDER BY id")
    const ids = remaining.map((r) => r[0] as string)
    assertEquals(ids.includes("old-completed"), false)
    assertEquals(ids.includes("new-completed"), true)
    assertEquals(ids.includes("old-pending"), true)
    checkDb.close()
  } finally {
    closeJobsDb()
    await cleanup()
  }
})

// ---------------------------------------------------------------------------
// Generations eviction
// ---------------------------------------------------------------------------

Deno.test("evictOldGenerations deletes old records, keeps recent", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(20)

    // Insert an old record directly
    const db = new DB("generations.db")
    db.execute(`
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
    const oldTimestamp = Date.now() - 200 * 24 * 60 * 60 * 1000 // 200 days ago
    db.query(
      "INSERT INTO generations (id, client_pubkey, target_pubkey, generated_at, cell_size) VALUES (?, ?, ?, ?, ?)",
      ["old-gen", pk, pk, oldTimestamp, 128],
    )
    db.close()

    // Insert a recent one through the module
    closeGenerationsDb()
    recordGeneration(pk, pk, 128, null, null, null)

    const deleted = evictOldGenerations()
    assertEquals(deleted, 1)

    // Recent one should survive
    const count = getRecentGenerationCount(pk, Date.now() - 365 * 24 * 60 * 60 * 1000)
    assertEquals(count, 1)
  } finally {
    closeGenerationsDb()
    await cleanup()
  }
})

// ---------------------------------------------------------------------------
// Collector event eviction
// ---------------------------------------------------------------------------

Deno.test("evictOldEvents deletes old events and orphaned state", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(30)
    const recentPk = fakePubkey(31)

    const db = new DB("collector_cache.db")
    db.execute(`
      CREATE TABLE IF NOT EXISTS events (
        kind INTEGER,
        pubkey TEXT,
        created_at INTEGER,
        event TEXT,
        PRIMARY KEY (kind, pubkey, created_at)
      )
    `)
    db.execute(`
      CREATE TABLE IF NOT EXISTS state (
        pubkey TEXT PRIMARY KEY,
        last_follow INTEGER
      )
    `)

    const oldTimestamp = Math.floor((Date.now() - 100 * 24 * 60 * 60 * 1000) / 1000) // 100 days ago in seconds
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60 // 1 minute ago

    // Old event
    db.query("INSERT INTO events (kind, pubkey, created_at, event) VALUES (?, ?, ?, ?)", [
      0, pk, oldTimestamp, JSON.stringify({ kind: 0, pubkey: pk, created_at: oldTimestamp }),
    ])
    // Recent event
    db.query("INSERT INTO events (kind, pubkey, created_at, event) VALUES (?, ?, ?, ?)", [
      0, recentPk, recentTimestamp, JSON.stringify({ kind: 0, pubkey: recentPk, created_at: recentTimestamp }),
    ])
    // State for old pubkey (should become orphaned)
    db.query("INSERT INTO state (pubkey, last_follow) VALUES (?, ?)", [pk, oldTimestamp])
    // State for recent pubkey
    db.query("INSERT INTO state (pubkey, last_follow) VALUES (?, ?)", [recentPk, recentTimestamp])
    db.close()

    const deleted = evictOldEvents()
    assertEquals(deleted, 1)

    // Verify
    const checkDb = new DB("collector_cache.db", { mode: "read" })
    const events = checkDb.query("SELECT pubkey FROM events")
    assertEquals(events.length, 1)
    assertEquals(events[0][0], recentPk)

    const state = checkDb.query("SELECT pubkey FROM state")
    assertEquals(state.length, 1)
    assertEquals(state[0][0], recentPk)
    checkDb.close()
  } finally {
    await cleanup()
  }
})
