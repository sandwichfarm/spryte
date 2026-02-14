/** Hex pubkey of the Spryte CVM server */
export const CVM_PUBKEY = import.meta.env.VITE_CVM_PUBKEY ?? "";

/** Nostr relays for CVM communication */
export const CVM_RELAYS: string[] = import.meta.env.VITE_CVM_RELAYS
  ? import.meta.env.VITE_CVM_RELAYS.split(",")
  : ["wss://relay.contextvm.org"];

/** Default cell size for sprite generation */
export const DEFAULT_CELL_SIZE = 128;
