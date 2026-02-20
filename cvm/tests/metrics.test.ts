import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import {
  recordHit,
  recordMiss,
  recordWrite,
  recordEviction,
  getSummary,
  resetMetrics,
} from "../metrics.ts"

function beforeEach() {
  resetMetrics()
}

Deno.test("getSummary returns empty array initially", () => {
  beforeEach()
  assertEquals(getSummary(), [])
})

Deno.test("records hits and misses with correct hit rate", () => {
  beforeEach()
  recordHit("subscription_cache")
  recordHit("subscription_cache")
  recordMiss("subscription_cache")

  const summary = getSummary()
  assertEquals(summary.length, 1)

  const s = summary[0]
  assertEquals(s.label, "subscription_cache")
  assertEquals(s.hits, 2)
  assertEquals(s.misses, 1)
  assertEquals(s.hitRate, 2 / 3)
})

Deno.test("records writes and evictions", () => {
  beforeEach()
  recordWrite("image_cache")
  recordWrite("image_cache")
  recordEviction("image_cache")

  const s = getSummary().find((x) => x.label === "image_cache")!
  assertEquals(s.writes, 2)
  assertEquals(s.evictions, 1)
})

Deno.test("hitRate is 0 when no hits or misses", () => {
  beforeEach()
  recordWrite("generation_count_cache")

  const s = getSummary().find((x) => x.label === "generation_count_cache")!
  assertEquals(s.hitRate, 0)
})

Deno.test("tracks multiple labels independently", () => {
  beforeEach()
  recordHit("subscription_cache")
  recordMiss("image_cache")
  recordWrite("generation_count_cache")

  const summary = getSummary()
  assertEquals(summary.length, 3)

  const sub = summary.find((x) => x.label === "subscription_cache")!
  assertEquals(sub.hits, 1)
  assertEquals(sub.misses, 0)

  const img = summary.find((x) => x.label === "image_cache")!
  assertEquals(img.hits, 0)
  assertEquals(img.misses, 1)
})

Deno.test("resetMetrics clears all counters", () => {
  beforeEach()
  recordHit("subscription_cache")
  recordMiss("image_cache")
  resetMetrics()
  assertEquals(getSummary(), [])
})
