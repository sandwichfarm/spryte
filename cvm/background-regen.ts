import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { getAllActiveSubscriptions, evictExpiredSubscriptions } from "./subscriptions.ts"
import { getLatestGeneration, evictOldGenerations } from "./spryte-tool.ts"
import { enqueueBackgroundJob, hasPendingJobForPubkey, evictOldJobs } from "./job-queue.ts"
import { getPlan } from "./plans.ts"
import { getEffectivePlanId } from "./subscriptions.ts"
import { evictExpiredImageCache } from "./image-cache.ts"
import { evictOldEvents } from "../collector/index.ts"
import { logSummary } from "./metrics.ts"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const REGEN_INTERVAL_MS = parseInt(
  Deno.env.get("REGEN_INTERVAL_MS") ?? String(6 * 60 * 60 * 1000),
  10,
)
const REGEN_INITIAL_DELAY_MS = 30_000
const CLEANUP_INTERVAL_MS = parseInt(
  Deno.env.get("CLEANUP_INTERVAL_MS") ?? String(24 * 60 * 60 * 1000),
  10,
)
const METRICS_INTERVAL_MS = parseInt(
  Deno.env.get("METRICS_INTERVAL_MS") ?? String(60 * 60 * 1000),
  10,
)
const DEFAULT_UPLOAD_SERVER = Deno.env.get("BLOSSOM_SERVER_URL") ?? "http://localhost:3000"

// ---------------------------------------------------------------------------
// Kind 3 change detection
// ---------------------------------------------------------------------------

/** Check if a pubkey's kind 3 event has changed since the given timestamp. */
function hasKind3ChangedSince(pubkey: string, sinceTimestampMs: number): boolean {
  let cacheDb: DB
  try {
    cacheDb = new DB("collector_cache.db", { readonly: true })
  } catch {
    // collector_cache.db doesn't exist yet
    return false
  }

  try {
    const sinceSeconds = Math.floor(sinceTimestampMs / 1000)
    const rows = cacheDb.query(
      "SELECT 1 FROM events WHERE kind = 3 AND pubkey = ? AND created_at > ? LIMIT 1",
      [pubkey, sinceSeconds],
    )
    return rows.length > 0
  } finally {
    cacheDb.close()
  }
}

// ---------------------------------------------------------------------------
// Sweep logic
// ---------------------------------------------------------------------------

export function runRegenSweep(): void {
  const subs = getAllActiveSubscriptions()
  let enqueued = 0
  let unchanged = 0
  let alreadyQueued = 0
  let neverGenerated = 0

  for (const sub of subs) {
    const latest = getLatestGeneration(sub.pubkey, sub.pubkey)

    if (!latest) {
      neverGenerated++
      continue
    }

    if (!hasKind3ChangedSince(sub.pubkey, latest.generatedAt)) {
      unchanged++
      continue
    }

    if (hasPendingJobForPubkey(sub.pubkey)) {
      alreadyQueued++
      continue
    }

    const planId = getEffectivePlanId(sub.pubkey)
    const plan = getPlan(planId)

    enqueueBackgroundJob(sub.pubkey, latest.cellSize, DEFAULT_UPLOAD_SERVER, {
      clientPubkey: sub.pubkey,
      maxImages: plan.maxImages,
      paid: false,
    })
    enqueued++
  }

  console.log(
    `[background-regen] Sweep complete: ${enqueued} enqueued, ${unchanged} unchanged, ${alreadyQueued} already queued, ${neverGenerated} never generated`,
  )
}

// ---------------------------------------------------------------------------
// Cleanup orchestrator
// ---------------------------------------------------------------------------

/** Run all eviction functions, each wrapped in try/catch. */
export function runCleanup(): void {
  console.log("[background-regen] Starting cleanup sweep...")
  const evictors = [
    { name: "image_cache", fn: evictExpiredImageCache },
    { name: "events", fn: evictOldEvents },
    { name: "generations", fn: evictOldGenerations },
    { name: "subscriptions", fn: evictExpiredSubscriptions },
    { name: "jobs", fn: evictOldJobs },
  ]

  for (const { name, fn } of evictors) {
    try {
      fn()
    } catch (err) {
      console.error(`[background-regen] Cleanup failed for ${name}:`, err)
    }
  }
  console.log("[background-regen] Cleanup sweep complete")
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
let regenIntervalId: number | undefined
let cleanupIntervalId: number | undefined
let metricsIntervalId: number | undefined

export function startBackgroundRegen(): void {
  console.log(`[background-regen] Scheduler started (regen=${REGEN_INTERVAL_MS}ms, cleanup=${CLEANUP_INTERVAL_MS}ms, metrics=${METRICS_INTERVAL_MS}ms)`)

  // First regen sweep after a short delay to let the system initialize
  setTimeout(() => {
    runRegenSweep()
  }, REGEN_INITIAL_DELAY_MS)

  regenIntervalId = setInterval(() => {
    runRegenSweep()
  }, REGEN_INTERVAL_MS) as unknown as number

  // First cleanup staggered after regen initial delay
  setTimeout(() => {
    runCleanup()
  }, REGEN_INITIAL_DELAY_MS + 5000)

  cleanupIntervalId = setInterval(() => {
    runCleanup()
  }, CLEANUP_INTERVAL_MS) as unknown as number

  // Periodic metrics logging
  metricsIntervalId = setInterval(() => {
    logSummary()
  }, METRICS_INTERVAL_MS) as unknown as number
}

export function stopBackgroundRegen(): void {
  if (regenIntervalId !== undefined) {
    clearInterval(regenIntervalId)
    regenIntervalId = undefined
  }
  if (cleanupIntervalId !== undefined) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = undefined
  }
  if (metricsIntervalId !== undefined) {
    clearInterval(metricsIntervalId)
    metricsIntervalId = undefined
  }
  console.log("[background-regen] Scheduler stopped")
}
