import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { MemCache } from "../mem-cache.ts"

Deno.test("get returns undefined on miss", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 10 })
  assertEquals(cache.get("nope"), undefined)
})

Deno.test("set + get round-trip", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 10 })
  cache.set("a", 42)
  assertEquals(cache.get("a"), 42)
})

Deno.test("caches null values (confirmed absence)", () => {
  const cache = new MemCache<string, null>({ ttlMs: 10_000, maxSize: 10 })
  cache.set("free-user", null)
  assertEquals(cache.has("free-user"), true)
  assertEquals(cache.get("free-user"), null)
})

Deno.test("has returns false for missing keys", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 10 })
  assertEquals(cache.has("missing"), false)
})

Deno.test("delete removes entry", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 10 })
  cache.set("a", 1)
  cache.delete("a")
  assertEquals(cache.get("a"), undefined)
  assertEquals(cache.size, 0)
})

Deno.test("clear removes all entries", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 10 })
  cache.set("a", 1)
  cache.set("b", 2)
  cache.clear()
  assertEquals(cache.size, 0)
  assertEquals(cache.get("a"), undefined)
})

Deno.test("TTL expiry on get", async () => {
  const cache = new MemCache<string, number>({ ttlMs: 50, maxSize: 10 })
  cache.set("a", 1)
  assertEquals(cache.get("a"), 1)

  await new Promise((r) => setTimeout(r, 60))

  assertEquals(cache.get("a"), undefined)
  assertEquals(cache.has("a"), false)
})

Deno.test("LRU eviction at maxSize", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 3 })
  cache.set("a", 1)
  cache.set("b", 2)
  cache.set("c", 3)
  // a is the LRU entry
  cache.set("d", 4) // should evict "a"

  assertEquals(cache.get("a"), undefined)
  assertEquals(cache.get("b"), 2)
  assertEquals(cache.get("c"), 3)
  assertEquals(cache.get("d"), 4)
  assertEquals(cache.size, 3)
})

Deno.test("get refreshes LRU position", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 3 })
  cache.set("a", 1)
  cache.set("b", 2)
  cache.set("c", 3)

  // Access "a" to refresh it
  cache.get("a")

  // Now "b" is the LRU entry
  cache.set("d", 4) // should evict "b"

  assertEquals(cache.get("a"), 1)
  assertEquals(cache.get("b"), undefined)
  assertEquals(cache.get("c"), 3)
  assertEquals(cache.get("d"), 4)
})

Deno.test("set overwrites existing key", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 10 })
  cache.set("a", 1)
  cache.set("a", 2)
  assertEquals(cache.get("a"), 2)
  assertEquals(cache.size, 1)
})

Deno.test("purgeExpired removes only expired entries", async () => {
  const cache = new MemCache<string, number>({ ttlMs: 50, maxSize: 10 })
  cache.set("old", 1)

  await new Promise((r) => setTimeout(r, 60))

  // Add a fresh entry
  cache.set("fresh", 2)

  const purged = cache.purgeExpired()
  assertEquals(purged, 1)
  assertEquals(cache.get("old"), undefined)
  assertEquals(cache.get("fresh"), 2)
  assertEquals(cache.size, 1)
})

Deno.test("size reflects current entry count", () => {
  const cache = new MemCache<string, number>({ ttlMs: 10_000, maxSize: 10 })
  assertEquals(cache.size, 0)
  cache.set("a", 1)
  assertEquals(cache.size, 1)
  cache.set("b", 2)
  assertEquals(cache.size, 2)
  cache.delete("a")
  assertEquals(cache.size, 1)
})
