import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { isolatedTestDir, fakePubkey, writePlansFixture, createCollectorCacheDb, readJobRows } from "./helpers.ts"
import { loadPlans } from "../plans.ts"
import { createSubscription, closeSubscriptionsDb } from "../subscriptions.ts"
import { recordGeneration, closeGenerationsDb } from "../spryte-tool.ts"
import { closeJobsDb } from "../job-queue.ts"
import { runRegenSweep } from "../background-regen.ts"

let cleanup: () => Promise<void>

async function beforeEach() {
  const iso = await isolatedTestDir()
  cleanup = iso.cleanup
  const path = await writePlansFixture(iso.tempDir)
  await loadPlans(path)
}

async function afterEach() {
  closeJobsDb()
  closeSubscriptionsDb()
  closeGenerationsDb()
  await cleanup()
}

Deno.test("sweep skips never-generated subscriber", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(1)
    createSubscription(pk, "pro", "monthly")
    // No generation recorded — create empty collector_cache.db so hasKind3ChangedSince can query
    createCollectorCacheDb([])

    runRegenSweep()

    const jobs = readJobRows()
    assertEquals(jobs.length, 0)
  } finally {
    await afterEach()
  }
})

Deno.test("sweep skips unchanged kind3", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(2)
    createSubscription(pk, "pro", "monthly")
    recordGeneration(pk, pk, 128, "https://blossom/s.png", "https://blossom/m.json", 10)
    // Empty collector_cache.db with schema but no kind3 events for this pubkey
    createCollectorCacheDb([])

    runRegenSweep()

    const jobs = readJobRows()
    assertEquals(jobs.length, 0)
  } finally {
    await afterEach()
  }
})

Deno.test("sweep skips already-queued pubkey", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(3)
    createSubscription(pk, "pro", "monthly")

    // Record generation, then create kind3 event clearly newer
    recordGeneration(pk, pk, 128, "https://blossom/s.png", "https://blossom/m.json", 10)

    // Kind3 event 10 seconds in the future (relative to generation) ensures it's detected as changed
    const kind3Ts = Math.floor(Date.now() / 1000) + 10
    createCollectorCacheDb([
      { kind: 3, pubkey: pk, created_at: kind3Ts, event: JSON.stringify({ kind: 3, pubkey: pk }) },
    ])

    // Pre-enqueue a pending job for this pubkey (via the module)
    const { enqueueBackgroundJob } = await import("../job-queue.ts")
    enqueueBackgroundJob(pk, 128, "http://localhost:3000", { clientPubkey: pk, maxImages: 2000, paid: false })

    const jobsBefore = readJobRows()
    assertEquals(jobsBefore.length, 1)

    runRegenSweep()

    // Should still be just 1 job (no additional enqueue)
    const jobsAfter = readJobRows()
    assertEquals(jobsAfter.length, 1)
  } finally {
    await afterEach()
  }
})

Deno.test("sweep enqueues when kind3 changed", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(4)
    createSubscription(pk, "pro", "monthly")
    recordGeneration(pk, pk, 128, "https://blossom/s.png", "https://blossom/m.json", 10)

    // Create kind3 event newer than the generation (which was just recorded at ~Date.now())
    // We need the kind3 created_at (in seconds) to be after generatedAt (in ms) / 1000
    const kind3Ts = Math.floor(Date.now() / 1000) + 10
    createCollectorCacheDb([
      { kind: 3, pubkey: pk, created_at: kind3Ts, event: JSON.stringify({ kind: 3, pubkey: pk }) },
    ])

    runRegenSweep()

    const jobs = readJobRows()
    assertEquals(jobs.length, 1)
    assertEquals(jobs[0].pubkey, pk)
    assertEquals(jobs[0].priority, 10) // background priority
  } finally {
    await afterEach()
  }
})

Deno.test("sweep summary counts are correct", async () => {
  await beforeEach()
  try {
    // pk1: never generated (skipped)
    const pk1 = fakePubkey(10)
    createSubscription(pk1, "pro", "monthly")

    // pk2: unchanged kind3 (skipped)
    const pk2 = fakePubkey(11)
    createSubscription(pk2, "pro", "monthly")
    recordGeneration(pk2, pk2, 128, "https://blossom/s.png", "https://blossom/m.json", 10)

    // pk3: kind3 changed → should enqueue
    const pk3 = fakePubkey(12)
    createSubscription(pk3, "pro", "monthly")
    recordGeneration(pk3, pk3, 128, "https://blossom/s.png", "https://blossom/m.json", 10)

    const kind3Ts = Math.floor(Date.now() / 1000) + 10
    createCollectorCacheDb([
      { kind: 3, pubkey: pk3, created_at: kind3Ts, event: JSON.stringify({ kind: 3, pubkey: pk3 }) },
    ])

    runRegenSweep()

    // Only pk3 should have a job
    const jobs = readJobRows()
    assertEquals(jobs.length, 1)
    assertEquals(jobs[0].pubkey, pk3)
  } finally {
    await afterEach()
  }
})
