/**
 * Minimal signer interface for Nostr event signing.
 *
 * Structurally compatible with:
 * - applesauce-signers (ExtensionSigner, NostrConnectSigner, PrivateKeySigner, …)
 * - @contextvm/sdk PrivateKeySigner
 * - nostr-tools/nip07 window.nostr
 * - Any custom implementation providing getPublicKey + signEvent
 */
export interface Signer {
  /** Returns the signer's public key as a hex string. */
  getPublicKey(): string | Promise<string>;

  /** Signs a Nostr event template and returns the full signed event. */
  signEvent(template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }): Promise<{
    id: string;
    sig: string;
    pubkey: string;
    kind: number;
    created_at: number;
    content: string;
    tags: string[][];
  }>;

  /** Optional NIP-04 encryption/decryption. */
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };

  /** Optional NIP-44 encryption/decryption. */
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}
