import { DB } from "https://deno.land/x/sqlite/mod.ts";

export interface NostrEvent {
  kind: number;
  created_at: number;
  pubkey: string;
  tags?: string[][];
  content?: string;
  [key: string]: any;
}

export interface RelayFilter {
  kinds: number[];
  authors?: string[];
  since?: number;
}

export async function queryRelay(
  relayUrl: string,
  filters: RelayFilter[],
  timeout = 5000
): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const events: NostrEvent[] = [];
    const subscriptionId = crypto.randomUUID();
    const ws = new WebSocket(relayUrl);
    let resolved = false;

    ws.onopen = () => {
      const reqMessage = JSON.stringify(["REQ", subscriptionId, ...filters]);
      ws.send(reqMessage);
    };

    ws.onmessage = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (data[0] === "EVENT" && data[1] === subscriptionId) {
          events.push(data[2]);
        } else if (data[0] === "EOSE" && data[1] === subscriptionId) {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve(events);
          }
        }
      } catch (e) {
        console.error("Error parsing relay message:", e);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error on relay", relayUrl, ":", err);
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(events);
      }
    };

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(events);
      }
    }, timeout);
  });
}

function batch<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

// Batch select cached events for multiple pubkeys.
async function getCachedEventsBatch(
  db: DB,
  kind: number,
  pubkeys: string[],
  since: number = 0
): Promise<Record<string, NostrEvent[]>> {
  const result: Record<string, NostrEvent[]> = {};
  if (pubkeys.length === 0) return result;
  const placeholders = pubkeys.map(() => "?").join(", ");
  const query = `SELECT pubkey, event FROM events WHERE kind = ? AND pubkey IN (${placeholders}) AND created_at > ? ORDER BY created_at ASC`;
  const params = [kind, ...pubkeys, since];
  for (const [pubkey, eventJson] of db.query(query, params)) {
    try {
      const event = JSON.parse(eventJson as string) as NostrEvent;
      if (!result[pubkey as string]) result[pubkey as string] = [];
      result[pubkey as string].push(event);
    } catch {
      // ignore parsing errors
    }
  }
  return result;
}

async function cacheEvent(db: DB, event: NostrEvent): Promise<void> {
  const insertQuery =
    "INSERT OR IGNORE INTO events (kind, pubkey, created_at, event) VALUES (?, ?, ?, ?)";
  db.query(insertQuery, [
    event.kind,
    event.pubkey,
    event.created_at,
    JSON.stringify(event),
  ]);
}

async function cacheEventAsync(db: DB, event: NostrEvent): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await cacheEvent(db, event);
      } catch (e) {
        console.error("Error caching event:", e);
      }
      resolve();
    }, 0);
  });
}

function updateState(db: DB, inputPubkey: string, newLast: number): void {
  const query = "INSERT OR REPLACE INTO state (pubkey, last_follow) VALUES (?, ?)";
  db.query(query, [inputPubkey, newLast]);
}

export async function collector(
  inputPubkey: string
): Promise<{ [pubkey: string]: string }> {
  const db = new DB("collector_cache.db");
  db.execute(`
    CREATE TABLE IF NOT EXISTS events (
      kind INTEGER,
      pubkey TEXT,
      created_at INTEGER,
      event TEXT,
      PRIMARY KEY (kind, pubkey, created_at)
    )
  `);
  db.execute(`
    CREATE TABLE IF NOT EXISTS state (
      pubkey TEXT PRIMARY KEY,
      last_follow INTEGER
    )
  `);

  const cachePromises: Promise<void>[] = [];

  // Get last follow timestamp for inputPubkey.
  let lastFollow = 0;
  for (const [, storedLast] of db.query(
    "SELECT last_follow FROM state WHERE pubkey = ?",
    [inputPubkey]
  )) {
    lastFollow = storedLast as number;
  }

  // Step 1: Fetch kind 3 (follow list) events.
  const followFilter: RelayFilter = { kinds: [3], authors: [inputPubkey] };
  if (lastFollow) {
    followFilter.since = lastFollow;
  }
  // Batch select cached follow events for inputPubkey.
  const cachedFollowsMap = await getCachedEventsBatch(db, 3, [inputPubkey], lastFollow);
  const cachedFollows: NostrEvent[] = cachedFollowsMap[inputPubkey] || [];
  if (cachedFollows.length > 0) {
    console.log(`Using ${cachedFollows.length} cached kind 3 event(s) for ${inputPubkey}.`);
  }
  // Always query the relay with the since filter.
  const newFollowEvents = await queryRelay("wss://purplepag.es", [followFilter], 5000);
  for (const event of newFollowEvents) {
    cachePromises.push(cacheEventAsync(db, event));
  }
  // Merge cached events with any new events.
  const followEvents = [...cachedFollows, ...newFollowEvents];
  if (newFollowEvents.length > 0) {
    const maxCreated = Math.max(...newFollowEvents.map((e) => e.created_at));
    updateState(db, inputPubkey, maxCreated);
  }

  // Step 2: Build set of pubkeys (input pubkey + those from follow event tags).
  const pubkeys = new Set<string>();
  pubkeys.add(inputPubkey);
  if (followEvents.length > 0) {
    const latestFollow = followEvents[followEvents.length - 1];
    if (Array.isArray(latestFollow.tags)) {
      for (const tag of latestFollow.tags) {
        if (Array.isArray(tag) && tag[0] === "p" && tag[1]) {
          pubkeys.add(tag[1]);
        }
      }
    }
  }
  console.log("Collected pubkeys:", Array.from(pubkeys));

  // Step 3: For each pubkey, fetch kind 10002 (relay list) events using batch select.
  const allPubkeys = Array.from(pubkeys);
  const relayCache = await getCachedEventsBatch(db, 10002, allPubkeys);
  const missingForRelay: string[] = [];
  const relayMapping: { [pubkey: string]: string[] } = {};
  for (const pk of allPubkeys) {
    if (relayCache[pk] && relayCache[pk].length > 0) {
      const sorted = relayCache[pk].sort((a, b) => a.created_at - b.created_at);
      const latest = sorted[sorted.length - 1];
      if (latest.tags) {
        const relays: string[] = [];
        for (const tag of latest.tags) {
          if (Array.isArray(tag) && tag[0] === "r" && tag[1]) {
            relays.push(tag[1]);
          }
        }
        relayMapping[pk] = relays;
        console.log(`Relays for ${pk}:`, relays);
      } else {
        relayMapping[pk] = [];
        console.warn("No tags in cached kind 10002 event for pubkey:", pk);
      }
    } else {
      missingForRelay.push(pk);
    }
  }
  if (missingForRelay.length > 0) {
    const events10002 = await queryRelay("wss://purplepag.es", [
      { kinds: [10002], authors: missingForRelay },
    ], 5000);
    for (const event of events10002) {
      cachePromises.push(cacheEventAsync(db, event));
      const pk = event.pubkey;
      if (!relayMapping[pk]) {
        relayMapping[pk] = [];
      }
      if (event.tags) {
        for (const tag of event.tags) {
          if (Array.isArray(tag) && tag[0] === "r" && tag[1]) {
            relayMapping[pk].push(tag[1]);
          }
        }
      }
    }
    for (const pk of missingForRelay) {
      if (!relayMapping[pk]) {
        relayMapping[pk] = [];
        console.warn("No kind 10002 event found for pubkey:", pk);
      }
    }
  }

  // Step 4: For metadata (kind 0) events, batch select cached events.
  const maxAuthorsPerBatch = 25;
  const pubkeysForMetadata = Array.from(pubkeys);
  const metadataBatches = batch(pubkeysForMetadata, maxAuthorsPerBatch);
  const metadataMapping: { [pubkey: string]: NostrEvent } = {};
  for (const authorsBatch of metadataBatches) {
    const cachedMeta = await getCachedEventsBatch(db, 0, authorsBatch);
    let events: NostrEvent[] = [];
    for (const author of authorsBatch) {
      if (cachedMeta[author]) {
        events.push(...cachedMeta[author]);
      }
    }
    if (events.length === 0) {
      events = await queryRelay("wss://purplepag.es", [{ kinds: [0], authors: authorsBatch }], 5000);
      for (const event of events) {
        cachePromises.push(cacheEventAsync(db, event));
      }
    }
    for (const event of events) {
      const pk = event.pubkey;
      if (!metadataMapping[pk] || metadataMapping[pk].created_at < event.created_at) {
        metadataMapping[pk] = event;
      }
    }
  }

  // Step 5: Build picture mapping from metadata events.
  const pictureMapping: { [pubkey: string]: string } = {};
  for (const pk in metadataMapping) {
    const event = metadataMapping[pk];
    if (event && event.content) {
      try {
        const metadata = JSON.parse(event.content);
        if (metadata.picture) {
          try {
            new URL(metadata.picture);
            pictureMapping[pk] = metadata.picture;
            console.log(`Picture URL for ${pk}: ${metadata.picture}`);
          } catch (urlErr) {
            console.error(`Invalid picture URL for pubkey ${pk}:`, metadata.picture);
          }
        } else {
          console.warn(`No ".picture" property in metadata for pubkey: ${pk}`);
        }
      } catch (parseErr) {
        console.error(`Error parsing metadata for pubkey ${pk}:`, parseErr);
      }
    } else {
      console.warn(`No metadata event content for pubkey: ${pk}`);
    }
  }

  // Wait for all asynchronous cache operations to finish.
  await Promise.all(cachePromises);
  db.close();
  return pictureMapping;
}

if (import.meta.main) {
  if (Deno.args.length < 1) {
    console.error("Usage: deno run --allow-net --allow-read collector.ts <pubkey>");
    Deno.exit(1);
  }
  const inputPubkey: string = Deno.args[0];
  collector(inputPubkey)
    .then((mapping) => {
      console.log("Final picture mapping:");
      console.log(JSON.stringify(mapping, null, 2));
    })
    .catch((err) => {
      console.error("Collector encountered an error:", err);
    });
}
