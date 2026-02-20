/**
 * Simple TTL + LRU in-memory cache.
 * Uses a Map (V8 preserves insertion order) for LRU eviction.
 * Supports caching `null` to represent confirmed absence.
 */

interface Entry<V> {
  value: V
  expiresAt: number
}

export class MemCache<K, V> {
  private map = new Map<K, Entry<V>>()
  private readonly ttlMs: number
  private readonly maxSize: number

  constructor(opts: { ttlMs: number; maxSize: number }) {
    this.ttlMs = opts.ttlMs
    this.maxSize = opts.maxSize
  }

  /** Get a value. Returns `undefined` on miss (including TTL expiry). */
  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return undefined
    }

    // Move to end for LRU freshness
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  /** Check if a key exists and is not expired. */
  has(key: K): boolean {
    const entry = this.map.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return false
    }
    return true
  }

  /** Set a value. Evicts LRU entry if at maxSize. */
  set(key: K, value: V): void {
    // Delete first so re-insertion moves to end
    this.map.delete(key)

    // Evict LRU (first entry) if at capacity
    if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value
      if (firstKey !== undefined) {
        this.map.delete(firstKey)
      }
    }

    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  /** Remove all expired entries. Returns count of purged entries. */
  purgeExpired(): number {
    const now = Date.now()
    let count = 0
    for (const [key, entry] of this.map) {
      if (now > entry.expiresAt) {
        this.map.delete(key)
        count++
      }
    }
    return count
  }

  get size(): number {
    return this.map.size
  }
}
