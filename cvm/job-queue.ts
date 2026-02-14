import { DB } from "https://deno.land/x/sqlite/mod.ts"
import { generateSpryte, type SpryteToolResult } from "./spryte-tool.ts"

// ---------------------------------------------------------------------------
// Configuration (all from env, with defaults)
// ---------------------------------------------------------------------------
const JOB_MAX_CONCURRENCY = parseInt(Deno.env.get("JOB_MAX_CONCURRENCY") ?? "1", 10)
const JOB_TIMEOUT_MS = parseInt(Deno.env.get("JOB_TIMEOUT_MS") ?? "300000", 10)
const JOB_MAX_ATTEMPTS = parseInt(Deno.env.get("JOB_MAX_ATTEMPTS") ?? "3", 10)
const JOB_POLL_INTERVAL_MS = parseInt(Deno.env.get("JOB_POLL_INTERVAL_MS") ?? "500", 10)

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
let db: DB | null = null

function getDb(): DB {
  if (!db) {
    db = new DB("jobs.db")
    db.execute(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        pubkey TEXT NOT NULL,
        cell_size INTEGER NOT NULL,
        upload_server TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        result TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        timeout_ms INTEGER NOT NULL DEFAULT 300000
      )
    `)
    db.execute(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status, created_at)`)
  }
  return db
}

// ---------------------------------------------------------------------------
// In-memory promise tracking (maps job id → resolve/reject)
// ---------------------------------------------------------------------------
interface JobWaiter {
  resolve: (result: SpryteToolResult) => void
  reject: (error: Error) => void
}

const waiters = new Map<string, JobWaiter>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Insert a job row, create an in-memory promise, wake the worker, and return the promise. */
export function enqueueJob(
  pubkey: string,
  cellSize: number,
  uploadServer: string,
): Promise<SpryteToolResult> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const d = getDb()

  d.query(
    `INSERT INTO jobs (id, pubkey, cell_size, upload_server, status, attempts, max_attempts, created_at, timeout_ms)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    [id, pubkey, cellSize, uploadServer, JOB_MAX_ATTEMPTS, now, JOB_TIMEOUT_MS],
  )

  console.log(`[job-queue] Enqueued job ${id} for pubkey ${pubkey.slice(0, 8)}…`)

  const promise = new Promise<SpryteToolResult>((resolve, reject) => {
    waiters.set(id, { resolve, reject })
  })

  // Wake the worker immediately so it doesn't wait for the next poll cycle
  wake()

  return promise
}

/**
 * Called once at startup. Resets `processing` rows to `pending`
 * (or `failed` if max attempts reached).
 */
export function recoverStuckJobs(): void {
  const d = getDb()

  // Increment attempts for all processing jobs
  d.query(`UPDATE jobs SET attempts = attempts + 1 WHERE status = 'processing'`)

  // Jobs that exceeded max_attempts → failed
  const failed = d.query(
    `UPDATE jobs SET status = 'failed', error = 'Server crashed during processing', completed_at = ?
     WHERE status = 'processing' AND attempts >= max_attempts RETURNING id`,
    [Date.now()],
  )
  for (const [id] of failed) {
    console.log(`[job-queue] Job ${id} permanently failed after crash (max attempts reached)`)
  }

  // Remaining processing jobs → pending (retry)
  const reset = d.query(
    `UPDATE jobs SET status = 'pending', started_at = NULL
     WHERE status = 'processing' RETURNING id, attempts`,
  )
  for (const [id, attempts] of reset) {
    console.log(`[job-queue] Job ${id} reset to pending after crash (attempt ${attempts})`)
  }
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------
let running = false
let activeJobs = 0
let pollTimer: number | undefined
let wakeResolve: (() => void) | null = null

/** Signal the worker to check for new jobs immediately. */
function wake() {
  if (wakeResolve) {
    wakeResolve()
    wakeResolve = null
  }
}

/** Returns a promise that resolves on wake() or after the poll interval. */
function waitForWakeOrTimeout(): Promise<void> {
  return new Promise<void>((resolve) => {
    wakeResolve = resolve
    pollTimer = setTimeout(() => {
      wakeResolve = null
      resolve()
    }, JOB_POLL_INTERVAL_MS) as unknown as number
  })
}

export function startWorker(): void {
  if (running) return
  running = true
  console.log(`[job-queue] Worker started (concurrency=${JOB_MAX_CONCURRENCY}, poll=${JOB_POLL_INTERVAL_MS}ms)`)
  workerLoop()
}

export function stopWorker(): void {
  running = false
  if (pollTimer !== undefined) {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }
  wake() // unblock any pending wait
  console.log("[job-queue] Worker stopped")
}

async function workerLoop(): Promise<void> {
  while (running) {
    // Try to claim jobs up to the concurrency limit
    while (running && activeJobs < JOB_MAX_CONCURRENCY) {
      const claimed = claimNextJob()
      if (!claimed) break
      activeJobs++
      // Process in the background (don't await — allows concurrency)
      processJob(claimed.id, claimed.pubkey, claimed.cellSize, claimed.uploadServer, claimed.timeoutMs)
        .finally(() => {
          activeJobs--
          wake() // re-check for more pending jobs
        })
    }
    await waitForWakeOrTimeout()
  }
}

interface ClaimedJob {
  id: string
  pubkey: string
  cellSize: number
  uploadServer: string
  timeoutMs: number
}

/** Atomically claim the oldest pending job. Returns null if none available. */
function claimNextJob(): ClaimedJob | null {
  const d = getDb()
  const now = Date.now()

  // Atomic claim: update the oldest pending row
  const rows = d.query(
    `UPDATE jobs SET status = 'processing', started_at = ?, attempts = attempts + 1
     WHERE id = (SELECT id FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1)
     RETURNING id, pubkey, cell_size, upload_server, timeout_ms`,
    [now],
  )

  if (rows.length === 0) return null

  const [id, pubkey, cellSize, uploadServer, timeoutMs] = rows[0] as [string, string, number, string, number]
  return { id, pubkey, cellSize, uploadServer, timeoutMs }
}

/** Run generateSpryte with a timeout, then update the DB and resolve/reject the waiter. */
async function processJob(
  id: string,
  pubkey: string,
  cellSize: number,
  uploadServer: string,
  timeoutMs: number,
): Promise<void> {
  console.log(`[job-queue] Processing job ${id} (pubkey ${pubkey.slice(0, 8)}…, cellSize=${cellSize})`)

  try {
    // Race the actual work against a timeout
    const result = await Promise.race([
      generateSpryte(pubkey, cellSize, uploadServer),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Job timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ])

    // Success → update DB
    const d = getDb()
    d.query(
      `UPDATE jobs SET status = 'completed', result = ?, completed_at = ? WHERE id = ?`,
      [JSON.stringify(result), Date.now(), id],
    )

    console.log(`[job-queue] Job ${id} completed successfully`)

    // Resolve the in-memory waiter
    const waiter = waiters.get(id)
    if (waiter) {
      waiter.resolve(result)
      waiters.delete(id)
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[job-queue] Job ${id} failed: ${errorMsg}`)

    const d = getDb()

    // Check if we can retry
    const rows = d.query(`SELECT attempts, max_attempts FROM jobs WHERE id = ?`, [id])
    if (rows.length === 0) return

    const [attempts, maxAttempts] = rows[0] as [number, number]

    if (attempts >= maxAttempts) {
      // Permanent failure
      d.query(
        `UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
        [errorMsg, Date.now(), id],
      )
      console.error(`[job-queue] Job ${id} permanently failed after ${attempts} attempts`)

      const waiter = waiters.get(id)
      if (waiter) {
        waiter.reject(new Error(`Job failed after ${attempts} attempts: ${errorMsg}`))
        waiters.delete(id)
      }
    } else {
      // Retry — reset to pending
      d.query(
        `UPDATE jobs SET status = 'pending', started_at = NULL, error = ? WHERE id = ?`,
        [errorMsg, id],
      )
      console.log(`[job-queue] Job ${id} will retry (attempt ${attempts}/${maxAttempts})`)
      wake() // immediately re-check
    }
  }
}

/** Close the jobs database for graceful shutdown. */
export function closeJobsDb(): void {
  if (db) {
    db.close()
    db = null
  }
  console.log("[job-queue] Database closed")
}
