import { session, type Session } from "./stores";
import { connectToCvm, disconnectFromCvm } from "./cvm-client";
import { SimplePool } from "nostr-tools/pool";
import { Observable } from "rxjs";
import type { NostrEvent, Filter } from "nostr-tools";

const NIP46_RELAYS = ["wss://relay.nsec.app", "wss://bucket.coracle.social"];

let pool: SimplePool | null = null;

function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

/**
 * Build applesauce-signers NostrPool from nostr-tools SimplePool.
 */
function makePool() {
  const sp = getPool();
  return {
    subscription(relays: string[], filters: Filter[]) {
      return new Observable<NostrEvent>((subscriber) => {
        const sub = sp.subscribeMany(relays, filters, {
          onevent: (event: NostrEvent) => subscriber.next(event),
          oneose: () => {},
        });
        return () => sub.close();
      });
    },
    async publish(relays: string[], event: NostrEvent) {
      await Promise.allSettled(sp.publish(relays, event));
    },
  };
}

/**
 * Login via NIP-07 browser extension (e.g., nos2x, Alby).
 */
export async function loginWithExtension(): Promise<void> {
  const { ExtensionSigner } = await import("applesauce-signers");
  const signer = new ExtensionSigner();
  const pubkey = await signer.getPublicKey();
  session.set({ pubkey, method: "extension", signer });
  await connectToCvm(signer);
}

/**
 * Login via bunker URI (NIP-46 remote signer).
 */
export async function loginWithBunker(bunkerUri: string): Promise<void> {
  const { NostrConnectSigner } = await import(
    "applesauce-signers/signers/nostr-connect-signer"
  );
  const p = makePool();
  const signer = await NostrConnectSigner.fromBunkerURI(bunkerUri, {
    pool: p,
  });
  await signer.open();
  const pubkey = await signer.getPublicKey();
  session.set({ pubkey, method: "bunker", signer });
  await connectToCvm(signer);
}

/**
 * Create a NostrConnect signer and return its URI + wait handle.
 */
export async function createNostrConnectLogin(relays?: string[]): Promise<{
  uri: string;
  waitForConnection: () => Promise<void>;
}> {
  const { NostrConnectSigner } = await import(
    "applesauce-signers/signers/nostr-connect-signer"
  );
  const p = makePool();
  const signerRelays = relays && relays.length > 0 ? relays : NIP46_RELAYS;

  const signer = new NostrConnectSigner({
    relays: signerRelays,
    pool: p,
  });

  const uri = signer.getNostrConnectURI({ name: "Spryte" });

  return {
    uri,
    async waitForConnection() {
      await signer.open();
      await signer.waitForSigner();
      const pubkey = await signer.getPublicKey();
      session.set({ pubkey, method: "nostrconnect", signer });
      await connectToCvm(signer);
    },
  };
}

export async function logout(): Promise<void> {
  await disconnectFromCvm();
  session.set(null);
}
