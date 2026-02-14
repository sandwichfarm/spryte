import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { isolatedTestDir, fakePubkey, writePlansFixture } from "./helpers.ts"
import { loadPlans } from "../plans.ts"
import { createSubscription, closeSubscriptionsDb } from "../subscriptions.ts"
import { recordGeneration, closeGenerationsDb } from "../spryte-tool.ts"
import { checkLimits, resolveGeneratePrice } from "../limits.ts"

let cleanup: () => Promise<void>

async function beforeEach() {
  const iso = await isolatedTestDir()
  cleanup = iso.cleanup
  const path = await writePlansFixture(iso.tempDir)
  await loadPlans(path)
}

async function afterEach() {
  closeSubscriptionsDb()
  closeGenerationsDb()
  await cleanup()
}

Deno.test("checkLimits free plan within limits", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(1)
    const target = fakePubkey(2)

    const result = checkLimits(client, target)
    assertEquals(result.effectivePlanId, "free")
    assertEquals(result.limitReasons.length, 0)
    assertEquals(result.maxImages, 500)
    assertEquals(result.previousResult, null)
  } finally {
    await afterEach()
  }
})

Deno.test("checkLimits free plan exceeds generation limit", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(3)
    const target = fakePubkey(4)

    // Record 1 generation (free plan allows 1/month)
    recordGeneration(client, target, 128, "https://blossom/sprite.png", "https://blossom/mapping.json", 10)

    const result = checkLimits(client, target)
    assertEquals(result.limitReasons.includes("time_limit"), true)
    assertEquals(result.previousResult !== null, true)
    assertEquals(result.previousResult!.spriteUrl, "https://blossom/sprite.png")
  } finally {
    await afterEach()
  }
})

Deno.test("checkLimits unlimited plan no limits", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(5)
    const target = fakePubkey(6)

    createSubscription(client, "unlimited", "monthly")

    // Even with many generations, unlimited has no limit
    recordGeneration(client, target, 128, null, null, null)
    recordGeneration(client, target, 128, null, null, null)

    const result = checkLimits(client, target)
    assertEquals(result.effectivePlanId, "unlimited")
    assertEquals(result.limitReasons.length, 0)
    assertEquals(result.maxImages, null)
  } finally {
    await afterEach()
  }
})

Deno.test("checkLimits returns previousResult when limited", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(7)
    const target = fakePubkey(8)

    recordGeneration(client, target, 128, "https://blossom/s.png", "https://blossom/m.json", 50)

    const result = checkLimits(client, target)
    assertEquals(result.limitReasons.includes("time_limit"), true)
    assertEquals(result.previousResult!.clientPubkey, client)
    assertEquals(result.previousResult!.targetPubkey, target)
  } finally {
    await afterEach()
  }
})

Deno.test("resolveGeneratePrice 0 within limits", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(10)
    const target = fakePubkey(11)

    const price = resolveGeneratePrice(client, target, false)
    assertEquals(price.amount, 0)
  } finally {
    await afterEach()
  }
})

Deno.test("resolveGeneratePrice charges with requestInvoice", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(12)
    const target = fakePubkey(13)

    // Exceed limit
    recordGeneration(client, target, 128, null, null, null)

    const price = resolveGeneratePrice(client, target, true)
    assertEquals(price.amount, 21) // oneTimeUpgrade.costSats
  } finally {
    await afterEach()
  }
})

Deno.test("resolveGeneratePrice 0 without requestInvoice", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(14)
    const target = fakePubkey(15)

    // Exceed limit
    recordGeneration(client, target, 128, null, null, null)

    const price = resolveGeneratePrice(client, target, false)
    assertEquals(price.amount, 0)
  } finally {
    await afterEach()
  }
})
