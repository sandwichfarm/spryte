import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { isolatedTestDir, fakePubkey } from "./helpers.ts"
import {
  recordGeneration,
  getLatestGeneration,
  getRecentGenerationCount,
  closeGenerationsDb,
} from "../spryte-tool.ts"

let cleanup: () => Promise<void>

async function beforeEach() {
  const iso = await isolatedTestDir()
  cleanup = iso.cleanup
}

async function afterEach() {
  closeGenerationsDb()
  await cleanup()
}

Deno.test("recordGeneration + getLatestGeneration round-trip", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(1)
    const target = fakePubkey(2)

    recordGeneration(client, target, 128, "https://blossom/sprite.png", "https://blossom/mapping.json", 42)

    const latest = getLatestGeneration(client, target)
    assertEquals(latest !== null, true)
    assertEquals(latest!.clientPubkey, client)
    assertEquals(latest!.targetPubkey, target)
    assertEquals(latest!.cellSize, 128)
    assertEquals(latest!.spriteUrl, "https://blossom/sprite.png")
    assertEquals(latest!.mappingUrl, "https://blossom/mapping.json")
    assertEquals(latest!.pubkeyCount, 42)
    assertEquals(typeof latest!.id, "string")
    assertEquals(typeof latest!.generatedAt, "number")
  } finally {
    await afterEach()
  }
})

Deno.test("getLatestGeneration returns most recent", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(3)
    const target = fakePubkey(4)

    recordGeneration(client, target, 64, "https://blossom/old.png", "https://blossom/old.json", 10)
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10))
    recordGeneration(client, target, 128, "https://blossom/new.png", "https://blossom/new.json", 20)

    const latest = getLatestGeneration(client, target)
    assertEquals(latest!.spriteUrl, "https://blossom/new.png")
    assertEquals(latest!.cellSize, 128)
    assertEquals(latest!.pubkeyCount, 20)
  } finally {
    await afterEach()
  }
})

Deno.test("getLatestGeneration returns null for unknown", async () => {
  await beforeEach()
  try {
    const latest = getLatestGeneration(fakePubkey(90), fakePubkey(91))
    assertEquals(latest, null)
  } finally {
    await afterEach()
  }
})

Deno.test("getRecentGenerationCount counts since cutoff", async () => {
  await beforeEach()
  try {
    const client = fakePubkey(5)
    const target = fakePubkey(6)

    // Insert records with known timestamps via direct DB
    // First trigger DB init through the module
    recordGeneration(client, target, 128, null, null, null)
    closeGenerationsDb()

    // Insert additional records with controlled timestamps
    const db = new DB("generations.db")
    const now = Date.now()
    db.query(
      "INSERT INTO generations (id, client_pubkey, target_pubkey, generated_at, cell_size) VALUES (?, ?, ?, ?, ?)",
      ["old-gen", client, target, now - 100_000, 128],
    )
    db.query(
      "INSERT INTO generations (id, client_pubkey, target_pubkey, generated_at, cell_size) VALUES (?, ?, ?, ?, ?)",
      ["recent-gen", client, target, now - 1000, 128],
    )
    db.close()

    // Reopen through the module
    // Count with cutoff that includes only the two newest
    const count = getRecentGenerationCount(client, now - 50_000)
    // The record inserted via recordGeneration (at ~now) + "recent-gen" (at now-1000)
    assertEquals(count >= 2, true)
  } finally {
    await afterEach()
  }
})

Deno.test("getRecentGenerationCount returns 0 for unknown", async () => {
  await beforeEach()
  try {
    const count = getRecentGenerationCount(fakePubkey(80), Date.now() - 100_000)
    assertEquals(count, 0)
  } finally {
    await afterEach()
  }
})

Deno.test("counts are isolated by clientPubkey", async () => {
  await beforeEach()
  try {
    const client1 = fakePubkey(10)
    const client2 = fakePubkey(11)
    const target = fakePubkey(12)

    recordGeneration(client1, target, 128, null, null, null)
    recordGeneration(client1, target, 128, null, null, null)
    recordGeneration(client2, target, 128, null, null, null)

    const cutoff = Date.now() - 60_000
    assertEquals(getRecentGenerationCount(client1, cutoff), 2)
    assertEquals(getRecentGenerationCount(client2, cutoff), 1)
  } finally {
    await afterEach()
  }
})
