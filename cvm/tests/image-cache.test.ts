import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { isolatedTestDir, fakePubkey } from "./helpers.ts"
import {
  setCachedImage,
  getCachedImage,
  applyCachedUrls,
  closeImageCacheDb,
} from "../image-cache.ts"

let cleanup: () => Promise<void>

async function beforeEach() {
  const iso = await isolatedTestDir()
  cleanup = iso.cleanup
}

async function afterEach() {
  closeImageCacheDb()
  await cleanup()
}

Deno.test("setCachedImage + getCachedImage round-trip", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(1)
    const sourceUrl = "https://example.com/avatar.png"
    setCachedImage(pk, sourceUrl, "abc123hash", "https://blossom.example.com/abc123hash")

    const cached = getCachedImage(pk, sourceUrl)
    assertEquals(cached !== null, true)
    assertEquals(cached!.pubkey, pk)
    assertEquals(cached!.sourceUrl, sourceUrl)
    assertEquals(cached!.blossomHash, "abc123hash")
    assertEquals(cached!.blossomUrl, "https://blossom.example.com/abc123hash")
    assertEquals(typeof cached!.cachedAt, "number")
  } finally {
    await afterEach()
  }
})

Deno.test("getCachedImage returns null for unknown", async () => {
  await beforeEach()
  try {
    const cached = getCachedImage(fakePubkey(99), "https://example.com/nope.png")
    assertEquals(cached, null)
  } finally {
    await afterEach()
  }
})

Deno.test("getCachedImage returns null when source URL changed", async () => {
  await beforeEach()
  try {
    const pk = fakePubkey(2)
    setCachedImage(pk, "https://example.com/old.png", "hash1", "https://blossom.example.com/hash1")

    const cached = getCachedImage(pk, "https://example.com/new.png")
    assertEquals(cached, null)
  } finally {
    await afterEach()
  }
})

Deno.test("applyCachedUrls swaps cached + reports uncached", async () => {
  await beforeEach()
  try {
    const cachedPk = fakePubkey(3)
    const uncachedPk = fakePubkey(4)

    const sourceUrl = "https://example.com/cached.png"
    const blossomUrl = "https://blossom.example.com/cached-hash"
    setCachedImage(cachedPk, sourceUrl, "cached-hash", blossomUrl)

    const mapping: Record<string, string> = {
      [cachedPk]: sourceUrl,
      [uncachedPk]: "https://example.com/uncached.png",
    }

    const { resolvedMapping, uncachedPubkeys } = applyCachedUrls(mapping)

    // Cached pubkey should use blossom URL
    assertEquals(resolvedMapping[cachedPk], blossomUrl)
    // Uncached pubkey should keep original URL
    assertEquals(resolvedMapping[uncachedPk], "https://example.com/uncached.png")
    // Only uncached pubkey in the list
    assertEquals(uncachedPubkeys, [uncachedPk])
  } finally {
    await afterEach()
  }
})

Deno.test("applyCachedUrls with nothing cached", async () => {
  await beforeEach()
  try {
    const pk1 = fakePubkey(5)
    const pk2 = fakePubkey(6)

    const mapping: Record<string, string> = {
      [pk1]: "https://example.com/a.png",
      [pk2]: "https://example.com/b.png",
    }

    const { resolvedMapping, uncachedPubkeys } = applyCachedUrls(mapping)

    assertEquals(resolvedMapping[pk1], "https://example.com/a.png")
    assertEquals(resolvedMapping[pk2], "https://example.com/b.png")
    assertEquals(uncachedPubkeys.length, 2)
  } finally {
    await afterEach()
  }
})
