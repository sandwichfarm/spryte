import { writable } from "svelte/store";

export interface Session {
  pubkey: string;
  method: "extension" | "bunker" | "nostrconnect";
  signer: any;
}

export interface SpryteResult {
  spriteUrl: string;
  mappingUrl: string;
  pubkeyCount: number;
  cellSize: number;
  cached?: boolean;
  limitReasons?: string[];
  totalFollowers?: number;
}

export const session = writable<Session | null>(null);
export const spryteResult = writable<SpryteResult | null>(null);
export const loading = writable(false);
export const error = writable<string | null>(null);
export const paymentInvoice = writable<string | null>(null);
