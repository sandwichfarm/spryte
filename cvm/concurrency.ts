/**
 * Bounded-concurrency parallel map.
 *
 * Spawns `min(concurrency, items.length)` async workers that pull from a
 * shared index counter. Results maintain input order.
 */
export async function pMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  const workers: Promise<void>[] = []
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  return results
}
