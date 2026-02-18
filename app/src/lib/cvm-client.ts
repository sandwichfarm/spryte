import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  NostrClientTransport,
  withClientPayments,
  LnBolt11NwcPaymentHandler,
  type NostrSigner,
} from "@contextvm/sdk";
import { CVM_PUBKEY, CVM_RELAYS } from "./constants";
import {
  loading,
  error,
  spryteResult,
  paymentInvoice,
  generationProgress,
  appVisualState,
  type SpryteResult,
} from "./stores";

let client: Client | null = null;
let transport: NostrClientTransport | null = null;

/**
 * Wrap any signer to conform to @contextvm/sdk NostrSigner.
 * Ensures getPublicKey always returns a Promise.
 */
function wrapSigner(signer: any): NostrSigner {
  return {
    async getPublicKey() {
      return await signer.getPublicKey();
    },
    async signEvent(event: any) {
      return await signer.signEvent(event);
    },
    nip04: signer.nip04,
    nip44: signer.nip44,
  };
}

/**
 * Connect to the Spryte CVM using the session signer.
 */
export async function connectToCvm(
  signer: any,
  nwcString?: string,
): Promise<void> {
  // Disconnect existing connection
  await disconnectFromCvm();

  const wrappedSigner = wrapSigner(signer);

  let baseTransport = new NostrClientTransport({
    signer: wrappedSigner,
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
        appVisualState.set("paying");
        return;
      }
      if (message?.method === "notifications/payment_accepted") {
        paymentInvoice.set(null);
      }
      originalOnMessage?.call(baseTransport, message);
    };
  }

  client = new Client({ name: "spryte-app", version: "0.1.0" });
  transport = baseTransport;
  await client.connect(transport);
}

export function isConnected(): boolean {
  return client !== null;
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
  generationProgress.set(null);
  appVisualState.set("generating");

  try {
    const args: Record<string, unknown> = { pubkey };
    if (cellSize) args.cellSize = cellSize;
    if (uploadServer) args.uploadServer = uploadServer;
    if (requestInvoice) args.requestInvoice = requestInvoice;

    const result = await client.callTool(
      {
        name: "generate-spryte",
        arguments: args,
      },
      undefined,
      {
        onprogress: (params: any) => {
          generationProgress.set({
            progress: params.progress ?? 0,
            total: params.total ?? 100,
            message: params.message ?? "",
            stage: parseStage(params.message ?? ""),
          });
        },
        timeout: 5 * 60 * 1000,
        resetTimeoutOnProgress: true,
      },
    );

    if (result.isError) {
      const content = result.content as Array<{ type: string; text?: string }>;
      const textContent = content.find((c) => c.type === "text");
      throw new Error(textContent?.text ?? "Generation failed");
    }

    const content = result.content as Array<{ type: string; text: string }>;
    const textContent = content.find((c) => c.type === "text");
    if (!textContent) throw new Error("No text content in response");

    let parsed: SpryteResult;
    try {
      parsed = JSON.parse(textContent.text);
    } catch {
      throw new Error(textContent.text || "Unexpected response from server");
    }
    spryteResult.set(parsed);
    appVisualState.set("success");
  } catch (err) {
    error.set(err instanceof Error ? err.message : String(err));
    appVisualState.set("error");
  } finally {
    loading.set(false);
    generationProgress.set(null);
    setTimeout(() => appVisualState.set("idle"), 3000);
  }
}

function parseStage(message: string): string {
  if (message.startsWith("Queued")) return "queued";
  if (message.startsWith("Fetching followers")) return "collecting";
  if (message.startsWith("Found")) return "collected";
  if (message.startsWith("Checking image cache")) return "cache_check";
  if (message.startsWith("Processing")) return "processing";
  if (message.startsWith("Uploading")) return "uploading";
  if (message.startsWith("Upload complete")) return "upload_complete";
  if (message.startsWith("Done")) return "complete";
  if (message.startsWith("Retrying")) return "retry";
  return "unknown";
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
