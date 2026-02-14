import { assertEquals, assertThrows } from "https://deno.land/std/testing/asserts.ts"
import { writePlansFixture } from "./helpers.ts"

// Fresh import per test file (Deno runs each file in its own worker)
import { loadPlans, getPlansConfig, getPlan } from "../plans.ts"

Deno.test("getPlansConfig throws before loadPlans", () => {
  assertThrows(() => getPlansConfig(), Error, "Plans not loaded")
})

Deno.test("loadPlans loads valid YAML", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "plans-test-" })
  try {
    const path = await writePlansFixture(tmpDir)
    const config = await loadPlans(path)
    assertEquals(config.oneTimeUpgrade.costSats, 21)
    assertEquals(Object.keys(config.plans).length, 3)
    assertEquals(Object.keys(config.plans).sort(), ["free", "pro", "unlimited"])
  } finally {
    await Deno.remove(tmpDir, { recursive: true })
  }
})

Deno.test("getPlan returns correct plan", async () => {
  // loadPlans was already called in previous test (singleton), but let's be explicit
  const tmpDir = await Deno.makeTempDir({ prefix: "plans-test-" })
  try {
    const path = await writePlansFixture(tmpDir)
    await loadPlans(path)
    const free = getPlan("free")
    assertEquals(free.name, "Free")
    assertEquals(free.maxImages, 500)
    assertEquals(free.generationsPerMonth, 1)
  } finally {
    await Deno.remove(tmpDir, { recursive: true })
  }
})

Deno.test("getPlan throws for unknown ID", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "plans-test-" })
  try {
    const path = await writePlansFixture(tmpDir)
    await loadPlans(path)
    assertThrows(() => getPlan("nonexistent"), Error, "Unknown plan")
  } finally {
    await Deno.remove(tmpDir, { recursive: true })
  }
})
