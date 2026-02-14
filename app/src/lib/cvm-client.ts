import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  NostrClientTransport,
  PrivateKeySigner,
  withClientPayments,
  LnBolt11NwcPaymentHandler,
} from "@contextvm/sdk";
import { CVM_PUBKEY, CVM_RELAYS } from "./constants";
import {
  loading,
  error,
  spryteResult,
  paymentInvoice,
  type SpryteResult,
} from "./stores";

let client: Client | null = null;
let transport: NostrClientTransport | null = null;

/**
 * Connect to the Spryte CVM over Nostr.
 * If nwcString is provided, auto-pay invoices via NWC.
 * Otherwise, payment_required notifications will surface the bolt11 for manual QR payment.
 */
export async function connectToCvm(
  signerPrivateKey: string,
  nwcString?: string,
): Promise<void> {
  const signer = new PrivateKeySigner(signerPrivateKey);

  let baseTransport = new NostrClientTransport({
    signer,
    relayHandler: CVM_RELAYS,
    serverPubkey: CVM_PUBKEY,
  });

  if (nwcString) {
    const handler = new LnBolt11NwcPaymentHandler({
      nwcConnectionString: nwcString,
    });
    baseTransport = withClientPayments(baseTransport, {
      handlers: [handler],
    }) as NostrClientTransport;
  } else {
    // Manual payment mode: intercept payment_required notifications
    const originalOnMessage = baseTransport.onmessage;
    baseTransport.onmessage = (message: any) => {
      if (
        message?.method === "notifications/payment_required" &&
        message?.params?.pay_req
      ) {
        paymentInvoice.set(message.params.pay_req);
        return;
      }
      if (message?.method === "notifications/payment_accepted") {
        paymentInvoice.set(null);
      }
      originalOnMessage?.call(baseTransport, message);
    };
  }

  client = new Client({ name: "spryte-spa", version: "0.1.0" });
  transport = baseTransport;
  await client.connect(transport);
}

/** Call the generate-spryte tool on the CVM */
export async function generateSpryte(
  pubkey: string,
  cellSize?: number,
  uploadServer?: string,
  requestInvoice?: boolean,
): Promise<void> {
  if (!client) {
    error.set("Not connected to CVM");
    return;
  }

  loading.set(true);
  error.set(null);
  spryteResult.set(null);

  try {
    const args: Record<string, unknown> = { pubkey };
    if (cellSize) args.cellSize = cellSize;
    if (uploadServer) args.uploadServer = uploadServer;
    if (requestInvoice) args.requestInvoice = requestInvoice;

    const result = await client.callTool({
      name: "generate-spryte",
      arguments: args,
    });

    // Parse the text content from the MCP response
    const content = result.content as Array<{ type: string; text: string }>;
    const textContent = content.find((c) => c.type === "text");
    if (!textContent) throw new Error("No text content in response");

    const parsed: SpryteResult = JSON.parse(textContent.text);
    spryteResult.set(parsed);
  } catch (err) {
    error.set(err instanceof Error ? err.message : String(err));
  } finally {
    loading.set(false);
  }
}

/** Fetch available plans from the CVM */
export async function getPlans(): Promise<Record<string, unknown> | null> {
  if (!client) {
    error.set("Not connected to CVM");
    return null;
  }

  try {
    const result = await client.callTool({
      name: "get-plans",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const textContent = content.find((c) => c.type === "text");
    if (!textContent) throw new Error("No text content in response");

    return JSON.parse(textContent.text);
  } catch (err) {
    error.set(err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Subscribe to a plan */
export async function subscribe(
  planId: string,
  period: "monthly" | "yearly",
): Promise<Record<string, unknown> | null> {
  if (!client) {
    error.set("Not connected to CVM");
    return null;
  }

  try {
    const result = await client.callTool({
      name: "subscribe",
      arguments: { planId, period },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const textContent = content.find((c) => c.type === "text");
    if (!textContent) throw new Error("No text content in response");

    return JSON.parse(textContent.text);
  } catch (err) {
    error.set(err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function disconnectFromCvm(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    transport = null;
  }
}
