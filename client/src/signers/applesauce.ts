import type { Signer } from "./types.js";

/**
 * Structural type matching the applesauce-signers ISigner interface.
 * Defined here so the client doesn't need a direct dependency on
 * applesauce-signers — any object matching this shape will work.
 */
export interface ApplesauceSigner {
  getPublicKey(): string | Promise<string>;
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
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

/**
 * Adapt an applesauce-signers signer for use with the Spryte client.
 *
 * Works with any applesauce signer: ExtensionSigner, NostrConnectSigner,
 * PrivateKeySigner, SimpleSigner, PasswordSigner, SerialPortSigner,
 * AmberClipboardSigner, ReadonlySigner.
 *
 * Applesauce signers already implement the ISigner interface which is
 * structurally compatible with our Signer type, so this is a lightweight
 * pass-through that validates the shape and provides type safety.
 *
 * @example
 * ```ts
 * import { ExtensionSigner } from "applesauce-signers";
 * import { fromApplesauce } from "@spryte/client/signers";
 *
 * const signer = fromApplesauce(new ExtensionSigner());
 * ```
 *
 * @example
 * ```ts
 * import { NostrConnectSigner } from "applesauce-signers";
 * import { fromApplesauce } from "@spryte/client/signers";
 *
 * const ncs = NostrConnectSigner.fromBunkerURI("bunker://...");
 * await ncs.connect();
 * const signer = fromApplesauce(ncs);
 * ```
 */
export function fromApplesauce(signer: ApplesauceSigner): Signer {
  if (typeof signer.getPublicKey !== "function") {
    throw new Error("Invalid signer: missing getPublicKey()");
  }
  if (typeof signer.signEvent !== "function") {
    throw new Error("Invalid signer: missing signEvent()");
  }

  return {
    getPublicKey: () => signer.getPublicKey(),
    signEvent: (template) => signer.signEvent(template),
    ...(signer.nip04 && {
      nip04: {
        encrypt: (pubkey, plaintext) => signer.nip04!.encrypt(pubkey, plaintext),
        decrypt: (pubkey, ciphertext) => signer.nip04!.decrypt(pubkey, ciphertext),
      },
    }),
    ...(signer.nip44 && {
      nip44: {
        encrypt: (pubkey, plaintext) => signer.nip44!.encrypt(pubkey, plaintext),
        decrypt: (pubkey, ciphertext) => signer.nip44!.decrypt(pubkey, ciphertext),
      },
    }),
  };
}
