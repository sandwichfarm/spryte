import {
  SpryteCvmClient,
  type GenerateSpryteOutput,
  type PlansOutput,
  type SubscribeOutput,
} from "./ctxcn/SpryteCvmClient.js";
import { loadSpriteSheet, getAvatarStyle, avatarStyleToString } from "./sprites.js";
import type { SpriteSheet, SpriteAvatarStyle } from "./types.js";
import type { Signer } from "./signers/types.js";
import {
  withClientPayments,
  LnBolt11NwcPaymentHandler,
  type NostrTransportOptions,
} from "@contextvm/sdk";

export interface SpryteOptions {
  /** Signer for Nostr event signing (use an adapter from @spryte/client/signers) */
  signer: Signer;
  /** CVM server pubkey (required until a default is set) */
  serverPubkey: string;
  /** Nostr relay URLs */
  relays: string[];
  /**
   * NWC connection string for automatic Lightning payments.
   * If omitted, paid requests will throw with the invoice in the error.
   */
  nwcConnectionString?: string;
  /** Additional transport options */
  transportOptions?: Partial<NostrTransportOptions>;
}

/**
 * High-level client for the Spryte CVM.
 * Handles connection, generation, payment, and sprite consumption in one API.
 *
 * @example
 * ```ts
 * import { fromApplesauce } from "@spryte/client/signers";
 * import { ExtensionSigner } from "applesauce-signers";
 *
 * const spryte = new Spryte({
 *   signer: fromApplesauce(new ExtensionSigner()),
 *   serverPubkey: "ef01...",
 *   relays: ["wss://relay.contextvm.org"],
 * });
 *
 * await spryte.connect();
 *
 * // Generate and load in one call
 * const sheet = await spryte.generate("deadbeef...");
 *
 * // Get CSS for a specific avatar
 * const style = spryte.getAvatarStyle(sheet, "somepubkey", 64);
 * element.setAttribute("style", spryte.avatarStyleToString(style));
 *
 * await spryte.disconnect();
 * ```
 */
export class Spryte {
  private cvmClient: SpryteCvmClient;
  private connected = false;

  constructor(private options: SpryteOptions) {
    this.cvmClient = new SpryteCvmClient({
      signer: options.signer,
      serverPubkey: options.serverPubkey,
      relays: options.relays,
      ...options.transportOptions,
    });
  }

  /** Connect to the CVM over Nostr relays */
  async connect(): Promise<void> {
    await this.cvmClient.connect();
    this.connected = true;
  }

  /** Disconnect from the CVM */
  async disconnect(): Promise<void> {
    await this.cvmClient.disconnect();
    this.connected = false;
  }

  /**
   * Generate a sprite sheet and return the raw CVM result.
   * Use this if you only need the URLs and don't want to load the sprite yet.
   */
  async generateRaw(
    pubkey: string,
    cellSize?: number,
    uploadServer?: string,
    requestInvoice?: boolean,
  ): Promise<GenerateSpryteOutput> {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
    return this.cvmClient.generateSpryte(pubkey, cellSize, uploadServer, requestInvoice);
  }

  /**
   * Generate a sprite sheet and load it for immediate rendering.
   * This is the primary method — it calls the CVM, then fetches and parses
   * both the sprite image and mapping JSON.
   */
  async generate(
    pubkey: string,
    cellSize?: number,
    uploadServer?: string,
    requestInvoice?: boolean,
  ): Promise<SpriteSheet> {
    const result = await this.generateRaw(pubkey, cellSize, uploadServer, requestInvoice);
    return loadSpriteSheet(result.spriteUrl, result.mappingUrl);
  }

  /** Get available subscription plans and pricing information. */
  async getPlans(): Promise<PlansOutput> {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
    return this.cvmClient.getPlans();
  }

  /** Subscribe to a paid plan. */
  async subscribe(
    planId: string,
    period: "monthly" | "yearly",
  ): Promise<SubscribeOutput> {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
    return this.cvmClient.subscribe(planId, period);
  }

  /**
   * Load an existing sprite sheet from known URLs (no CVM call).
   * Use this when you already have the URLs from a previous generation.
   */
  async load(spriteUrl: string, mappingUrl: string): Promise<SpriteSheet> {
    return loadSpriteSheet(spriteUrl, mappingUrl);
  }

  /**
   * Get CSS properties for rendering a single avatar from a loaded sprite.
   * Returns null if the pubkey isn't in the mapping.
   */
  getAvatarStyle(
    sheet: SpriteSheet,
    pubkey: string,
    displaySize?: number,
  ): SpriteAvatarStyle | null {
    return getAvatarStyle(sheet, pubkey, displaySize);
  }

  /** Convert a SpriteAvatarStyle to a CSS string */
  avatarStyleToString(style: SpriteAvatarStyle): string {
    return avatarStyleToString(style);
  }
}
