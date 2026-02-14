import { DB } from "https://deno.land/x/sqlite/mod.ts"

/** Create a temp dir, chdir into it, and return cleanup function. */
export async function isolatedTestDir(): Promise<{ tempDir: string; cleanup: () => Promise<void> }> {
  const originalCwd = Deno.cwd()
  const tempDir = await Deno.makeTempDir({ prefix: "cvm-test-" })
  Deno.chdir(tempDir)
  return {
    tempDir,
    cleanup: async () => {
      Deno.chdir(originalCwd)
      await Deno.remove(tempDir, { recursive: true })
    },
  }
}

/** Returns a deterministic 64-char hex pubkey from a seed number. */
export function fakePubkey(seed: number): string {
  const hex = seed.toString(16).padStart(2, "0")
  return hex.repeat(32).slice(0, 64)
}

/** Generate a random 32-byte hex private key. */
export function randomHexKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Write a minimal plans.yaml fixture inside the given directory.
 * Creates config/ subdir. Returns the full path to the YAML file.
 */
export async function writePlansFixture(dir: string): Promise<string> {
  const configDir = `${dir}/config`
  await Deno.mkdir(configDir, { recursive: true })
  const path = `${configDir}/plans.yaml`
  await Deno.writeTextFile(
    path,
    `oneTimeUpgrade:
  costSats: 21
  description: "One-time generation upgrade"

plans:
  free:
    name: "Free"
    description: "Basic sprite generation"
    maxImages: 500
    generationsPerMonth: 1

  pro:
    name: "Pro"
    description: "Higher limits for power users"
    maxImages: 2000
    generationsPerMonth: 30
    pricing:
      monthly:
        costSats: 1000
      yearly:
        costSats: 10000

  unlimited:
    name: "Unlimited"
    description: "No limits on generation"
    maxImages: null
    generationsPerMonth: null
    pricing:
      monthly:
        costSats: 5000
      yearly:
        costSats: 50000
`,
  )
  return path
}

/**
 * Create a collector_cache.db in CWD with correct schema and insert test events.
 * Each event: { kind, pubkey, created_at (unix seconds), event (JSON string) }
 * Pass empty array to create DB with schema but no events.
 */
export function createCollectorCacheDb(
  events: Array<{ kind: number; pubkey: string; created_at: number; event: string }>,
): void {
  const db = new DB("collector_cache.db")
  db.execute(`
    CREATE TABLE IF NOT EXISTS events (
      kind INTEGER,
      pubkey TEXT,
      created_at INTEGER,
      event TEXT
    )
  `)
  for (const e of events) {
    db.query("INSERT INTO events (kind, pubkey, created_at, event) VALUES (?, ?, ?, ?)", [
      e.kind,
      e.pubkey,
      e.created_at,
      e.event,
    ])
  }
  db.close()
}

/** Open jobs.db read-only and return all job rows. Returns [] if DB doesn't exist. */
export function readJobRows(): Array<Record<string, unknown>> {
  let db: DB
  try {
    db = new DB("jobs.db", { mode: "read" })
  } catch {
    return []
  }
  const rows = db.query(
    "SELECT id, pubkey, cell_size, upload_server, client_pubkey, request_invoice, max_images, paid, priority, status, attempts, max_attempts, result, error, created_at, started_at, completed_at, timeout_ms FROM jobs ORDER BY created_at ASC",
  )
  db.close()
  return rows.map(
    ([id, pubkey, cellSize, uploadServer, clientPubkey, requestInvoice, maxImages, paid, priority, status, attempts, maxAttempts, result, error, createdAt, startedAt, completedAt, timeoutMs]) => ({
      id,
      pubkey,
      cellSize,
      uploadServer,
      clientPubkey,
      requestInvoice,
      maxImages,
      paid,
      priority,
      status,
      attempts,
      maxAttempts,
      result,
      error,
      createdAt,
      startedAt,
      completedAt,
      timeoutMs,
    }),
  )
}

/** Spawn nak serve on a given port, wait for it to be ready, return the child process. */
export async function startNakRelay(port: number): Promise<Deno.ChildProcess> {
  const cmd = new Deno.Command("nak", {
    args: ["serve", "--port", String(port), "-q"],
    stdout: "null",
    stderr: "null",
  })
  const child = cmd.spawn()
  await waitForPort(port, 5000)
  return child
}

/** Poll TCP connect until the port is open or timeout. */
export async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const conn = await Deno.connect({ hostname: "127.0.0.1", port })
      conn.close()
      return
    } catch {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  throw new Error(`Port ${port} did not become available within ${timeoutMs}ms`)
}
