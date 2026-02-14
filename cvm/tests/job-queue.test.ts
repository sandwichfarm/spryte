import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { isolatedTestDir, fakePubkey, readJobRows } from "./helpers.ts"
import {
  enqueueJob,
  enqueueBackgroundJob,
  hasPendingJobForPubkey,
  recoverStuckJobs,
  closeJobsDb,
} from "../job-queue.ts"

let cleanup: () => Promise<void>

async function beforeEach() {
  const iso = await isolatedTestDir()
  cleanup = iso.cleanup
}

async function afterEach() {
  closeJobsDb()
  await cleanup()
}

Deno.test("enqueueJob inserts pending row with priority 0", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(1)
    // enqueueJob returns a promise (for the waiter) — we don't await it
    enqueueJob(pk, 128, "http://localhost:3000")

    const rows = readJobRows()
    assertEquals(rows.length, 1)
    assertEquals(rows[0].pubkey, pk)
    assertEquals(rows[0].cellSize, 128)
    assertEquals(rows[0].uploadServer, "http://localhost:3000")
    assertEquals(rows[0].priority, 0)
    assertEquals(rows[0].status, "pending")
    assertEquals(rows[0].attempts, 0)
  } finally {
    await afterEach()
  }
})

Deno.test("enqueueBackgroundJob inserts with priority 10", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(2)
    enqueueBackgroundJob(pk, 128, "http://localhost:3000")

    const rows = readJobRows()
    assertEquals(rows.length, 1)
    assertEquals(rows[0].priority, 10)
    assertEquals(rows[0].status, "pending")
    assertEquals(rows[0].requestInvoice, 0)
  } finally {
    await afterEach()
  }
})

Deno.test("hasPendingJobForPubkey true when pending", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(3)
    enqueueJob(pk, 128, "http://localhost:3000")
    assertEquals(hasPendingJobForPubkey(pk), true)
  } finally {
    await afterEach()
  }
})

Deno.test("hasPendingJobForPubkey true when processing", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(4)
    enqueueJob(pk, 128, "http://localhost:3000")

    // Manually update to processing
    const db = new DB("jobs.db")
    db.query("UPDATE jobs SET status = 'processing' WHERE pubkey = ?", [pk])
    db.close()

    closeJobsDb()
    assertEquals(hasPendingJobForPubkey(pk), true)
  } finally {
    await afterEach()
  }
})

Deno.test("hasPendingJobForPubkey false when completed", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(5)
    enqueueJob(pk, 128, "http://localhost:3000")

    const db = new DB("jobs.db")
    db.query("UPDATE jobs SET status = 'completed' WHERE pubkey = ?", [pk])
    db.close()

    closeJobsDb()
    assertEquals(hasPendingJobForPubkey(pk), false)
  } finally {
    await afterEach()
  }
})

Deno.test("hasPendingJobForPubkey false when no jobs", async () => {
  await beforeEach()
  try {
    assertEquals(hasPendingJobForPubkey(fakePubkey(99)), false)
  } finally {
    await afterEach()
  }
})

Deno.test("priority ordering: interactive before background", async () => {
  await beforeEach()
  try {
    const bgPk = fakePubkey(10)
    const interactivePk = fakePubkey(11)

    // Insert background first (priority 10)
    enqueueBackgroundJob(bgPk, 128, "http://localhost:3000")
    // Small delay so created_at differs
    await new Promise((r) => setTimeout(r, 10))
    // Then interactive (priority 0)
    enqueueJob(interactivePk, 128, "http://localhost:3000")

    // Query what the worker would pick: ORDER BY priority ASC, created_at ASC
    const db = new DB("jobs.db", { mode: "read" })
    const rows = db.query(
      "SELECT pubkey, priority FROM jobs WHERE status = 'pending' ORDER BY priority ASC, created_at ASC LIMIT 1",
    )
    db.close()

    assertEquals(rows.length, 1)
    assertEquals(rows[0][0], interactivePk)
    assertEquals(rows[0][1], 0)
  } finally {
    await afterEach()
  }
})

Deno.test("FIFO within same priority", async () => {
  await beforeEach()
  try {
    const pk1 = fakePubkey(20)
    const pk2 = fakePubkey(21)

    enqueueJob(pk1, 128, "http://localhost:3000")
    await new Promise((r) => setTimeout(r, 10))
    enqueueJob(pk2, 128, "http://localhost:3000")

    const db = new DB("jobs.db", { mode: "read" })
    const rows = db.query(
      "SELECT pubkey FROM jobs WHERE status = 'pending' ORDER BY priority ASC, created_at ASC",
    )
    db.close()

    assertEquals(rows[0][0], pk1)
    assertEquals(rows[1][0], pk2)
  } finally {
    await afterEach()
  }
})

Deno.test("recoverStuckJobs resets processing to pending", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(30)
    enqueueJob(pk, 128, "http://localhost:3000")

    // Manually set to processing with low attempts
    const db = new DB("jobs.db")
    db.query("UPDATE jobs SET status = 'processing', attempts = 1 WHERE pubkey = ?", [pk])
    db.close()

    closeJobsDb()
    recoverStuckJobs()

    const rows = readJobRows()
    assertEquals(rows[0].status, "pending")
    // attempts was 1, recoverStuckJobs increments by 1 → 2, still < max_attempts(3)
    assertEquals(rows[0].attempts, 2)
  } finally {
    await afterEach()
  }
})

Deno.test("recoverStuckJobs fails exceeded max_attempts", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(31)
    enqueueJob(pk, 128, "http://localhost:3000")

    // Set to processing at max attempts
    const db = new DB("jobs.db")
    db.query("UPDATE jobs SET status = 'processing', attempts = 2, max_attempts = 3 WHERE pubkey = ?", [pk])
    db.close()

    closeJobsDb()
    recoverStuckJobs()

    const rows = readJobRows()
    assertEquals(rows[0].status, "failed")
    assertEquals(rows[0].attempts, 3)
  } finally {
    await afterEach()
  }
})

Deno.test("options stored correctly", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(40)
    const clientPk = fakePubkey(41)
    enqueueJob(pk, 256, "http://blossom.test", {
      clientPubkey: clientPk,
      requestInvoice: true,
      maxImages: 500,
      paid: true,
    })

    const rows = readJobRows()
    assertEquals(rows.length, 1)
    assertEquals(rows[0].clientPubkey, clientPk)
    assertEquals(rows[0].requestInvoice, 1)
    assertEquals(rows[0].maxImages, 500)
    assertEquals(rows[0].paid, 1)
    assertEquals(rows[0].cellSize, 256)
  } finally {
    await afterEach()
  }
})
