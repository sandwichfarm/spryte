/**
 * Signer adapter system for the Spryte client.
 *
 * The client accepts any object implementing the {@link Signer} interface.
 * Adapters are provided for popular signer libraries — starting with
 * applesauce-signers — so callers don't need to wrap them manually.
 *
 * @example
 * ```ts
 * import { Spryte } from "@spryte/client";
 * import { fromApplesauce } from "@spryte/client/signers";
 * import { ExtensionSigner } from "applesauce-signers";
 *
 * const signer = fromApplesauce(new ExtensionSigner());
 * const spryte = new Spryte({ signer, serverPubkey: "..." });
 * ```
 */

export type { Signer } from "./types.js";
export { fromApplesauce, type ApplesauceSigner } from "./applesauce.js";
