import { session, type Session } from "./stores";

/**
 * Login via NIP-07 browser extension (e.g., nos2x, Alby).
 * Uses the applesauce-signers ExtensionSigner.
 */
export async function loginWithExtension(): Promise<void> {
  const { ExtensionSigner } = await import("applesauce-signers");
  const signer = new ExtensionSigner();
  const pubkey = await signer.getPublicKey();
  session.set({ pubkey, method: "extension", signer });
}

/**
 * Login via bunker URI (NIP-46 remote signer).
 * The URI format is: bunker://<remote-pubkey>?relay=<relay>&secret=<secret>
 */
export async function loginWithBunker(bunkerUri: string): Promise<void> {
  const { NostrConnectSigner } = await import("applesauce-signers");
  const signer = NostrConnectSigner.fromBunkerURI(bunkerUri);
  await signer.connect();
  const pubkey = await signer.getPublicKey();
  session.set({ pubkey, method: "bunker", signer });
}

/**
 * Generate a NostrConnect QR code URI for login.
 * Returns the nostrconnect:// URI to display as a QR code.
 */
export async function createNostrConnectLogin(): Promise<{
  uri: string;
  waitForConnection: () => Promise<void>;
}> {
  const { NostrConnectSigner } = await import("applesauce-signers");
  const signer = new NostrConnectSigner();
  const uri = signer.getNostrConnectURI();

  return {
    uri,
    async waitForConnection() {
      await signer.waitForSigner();
      const pubkey = await signer.getPublicKey();
      session.set({ pubkey, method: "nostrconnect", signer });
    },
  };
}

export function logout(): void {
  session.set(null);
}
