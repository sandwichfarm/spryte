import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { getAllActiveSubscriptions } from "./subscriptions.ts"
import { getLatestGeneration } from "./spryte-tool.ts"
import { enqueueBackgroundJob, hasPendingJobForPubkey } from "./job-queue.ts"
import { getPlan } from "./plans.ts"
import { getEffectivePlanId } from "./subscriptions.ts"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const REGEN_INTERVAL_MS = parseInt(
  Deno.env.get("REGEN_INTERVAL_MS") ?? String(6 * 60 * 60 * 1000),
  10,
)
const REGEN_INITIAL_DELAY_MS = 30_000
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
// Scheduler
// ---------------------------------------------------------------------------
let intervalId: number | undefined

export function startBackgroundRegen(): void {
  console.log(`[background-regen] Scheduler started (interval=${REGEN_INTERVAL_MS}ms)`)

  // First sweep after a short delay to let the system initialize
  setTimeout(() => {
    runRegenSweep()
  }, REGEN_INITIAL_DELAY_MS)

  intervalId = setInterval(() => {
    runRegenSweep()
  }, REGEN_INTERVAL_MS) as unknown as number
}

export function stopBackgroundRegen(): void {
  if (intervalId !== undefined) {
    clearInterval(intervalId)
    intervalId = undefined
  }
  console.log("[background-regen] Scheduler stopped")
}
