/**
 * Lightweight cache metrics counters.
 */

export type CacheLabel =
  | "image_cache"
  | "subscription_cache"
  | "generation_count_cache"

interface Counters {
  hits: number
  misses: number
  writes: number
  evictions: number
}

const counters = new Map<CacheLabel, Counters>()

function getCounters(label: CacheLabel): Counters {
  let c = counters.get(label)
  if (!c) {
    c = { hits: 0, misses: 0, writes: 0, evictions: 0 }
    counters.set(label, c)
  }
  return c
}

export function recordHit(label: CacheLabel): void {
  getCounters(label).hits++
}

export function recordMiss(label: CacheLabel): void {
  getCounters(label).misses++
}

export function recordWrite(label: CacheLabel): void {
  getCounters(label).writes++
}

export function recordEviction(label: CacheLabel): void {
  getCounters(label).evictions++
}

export interface CacheSummary {
  label: CacheLabel
  hits: number
  misses: number
  hitRate: number
  writes: number
  evictions: number
}

export function getSummary(): CacheSummary[] {
  const result: CacheSummary[] = []
  for (const [label, c] of counters) {
    const total = c.hits + c.misses
    result.push({
      label,
      hits: c.hits,
      misses: c.misses,
      hitRate: total > 0 ? c.hits / total : 0,
      writes: c.writes,
      evictions: c.evictions,
    })
  }
  return result
}

export function logSummary(): void {
  for (const s of getSummary()) {
    console.log(
      `[metrics] ${s.label}: hits=${s.hits} misses=${s.misses} hitRate=${(s.hitRate * 100).toFixed(1)}% writes=${s.writes} evictions=${s.evictions}`,
    )
  }
}

/** Reset all counters (useful for tests). */
export function resetMetrics(): void {
  counters.clear()
}
