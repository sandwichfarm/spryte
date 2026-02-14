import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { isolatedTestDir, fakePubkey } from "./helpers.ts"
import {
  createSubscription,
  getActiveSubscription,
  getAllActiveSubscriptions,
  getEffectivePlanId,
  closeSubscriptionsDb,
} from "../subscriptions.ts"

let cleanup: () => Promise<void>

function setup() {
  return {
    async beforeEach() {
      const iso = await isolatedTestDir()
      cleanup = iso.cleanup
    },
    async afterEach() {
      closeSubscriptionsDb()
      await cleanup()
    },
  }
}

const t = setup()

Deno.test("createSubscription returns correct object", async () => {
  await t.beforeEach()
  try {
    const pk = fakePubkey(1)
    const before = Date.now()
    const sub = createSubscription(pk, "pro", "monthly")
    const after = Date.now()

    assertEquals(sub.pubkey, pk)
    assertEquals(sub.planId, "pro")
    assertEquals(sub.period, "monthly")
    assertEquals(sub.startedAt >= before && sub.startedAt <= after, true)

    // Monthly ≈ 30 days
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    const expectedExpiry = sub.startedAt + thirtyDaysMs
    assertEquals(sub.expiresAt, expectedExpiry)
  } finally {
    await t.afterEach()
  }
})

Deno.test("createSubscription replaces existing", async () => {
  await t.beforeEach()
  try {
    const pk = fakePubkey(2)
    createSubscription(pk, "pro", "monthly")
    const sub2 = createSubscription(pk, "unlimited", "yearly")

    assertEquals(sub2.planId, "unlimited")
    assertEquals(sub2.period, "yearly")

    const active = getActiveSubscription(pk)
    assertEquals(active?.planId, "unlimited")
  } finally {
    await t.afterEach()
  }
})

Deno.test("getActiveSubscription returns active sub", async () => {
  await t.beforeEach()
  try {
    const pk = fakePubkey(3)
    createSubscription(pk, "pro", "monthly")
    const active = getActiveSubscription(pk)

    assertEquals(active !== null, true)
    assertEquals(active!.planId, "pro")
    assertEquals(active!.pubkey, pk)
  } finally {
    await t.afterEach()
  }
})

Deno.test("getActiveSubscription returns null for expired", async () => {
  await t.beforeEach()
  try {
    const pk = fakePubkey(4)
    // Insert directly with past expiry
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
    db.query(
      "INSERT INTO subscriptions (pubkey, plan_id, period, started_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      [pk, "pro", "monthly", Date.now() - 60_000_000, Date.now() - 1000],
    )
    db.close()

    // Now close and reopen through the module
    closeSubscriptionsDb()
    const active = getActiveSubscription(pk)
    assertEquals(active, null)
  } finally {
    await t.afterEach()
  }
})

Deno.test("getActiveSubscription returns null for unknown", async () => {
  await t.beforeEach()
  try {
    const active = getActiveSubscription(fakePubkey(99))
    assertEquals(active, null)
  } finally {
    await t.afterEach()
  }
})

Deno.test("getAllActiveSubscriptions filters expired", async () => {
  await t.beforeEach()
  try {
    const activePk = fakePubkey(5)
    const expiredPk = fakePubkey(6)

    // Create one active
    createSubscription(activePk, "pro", "monthly")

    // Insert one expired directly
    const db = new DB("subscriptions.db")
    db.query(
      "INSERT OR REPLACE INTO subscriptions (pubkey, plan_id, period, started_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      [expiredPk, "unlimited", "monthly", Date.now() - 60_000_000, Date.now() - 1000],
    )
    db.close()

    closeSubscriptionsDb()
    const all = getAllActiveSubscriptions()
    assertEquals(all.length, 1)
    assertEquals(all[0].pubkey, activePk)
  } finally {
    await t.afterEach()
  }
})

Deno.test("getEffectivePlanId defaults to free", async () => {
  await t.beforeEach()
  try {
    assertEquals(getEffectivePlanId(fakePubkey(88)), "free")
  } finally {
    await t.afterEach()
  }
})

Deno.test("getEffectivePlanId returns sub planId", async () => {
  await t.beforeEach()
  try {
    const pk = fakePubkey(7)
    createSubscription(pk, "unlimited", "yearly")
    assertEquals(getEffectivePlanId(pk), "unlimited")
  } finally {
    await t.afterEach()
  }
})
