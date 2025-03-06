import { DVM, DVMEvent } from "npm:@welshman/dvm@latest";
import { createEvent } from "npm:@welshman/util@latest";
import { processor } from "./processor_core.ts";
import { collector } from "./collector.ts";
import { uploadFile, calculateFileHash, OptionalFormDataFields } from "nostr-tools/nip96";
import { BlossomClient } from "blossom-client-sdk/client";

// Constants for payment feedback and pricing.
const COST_PER_PUBKEY = 1;
const STATUS_PAYMENT_REQUIRED = "PAYMENT_REQUIRED";

// Output types.
enum OutputType {
  BASE64 = "BASE64",
  NIP96 = "NIP96",
  BLOSSOM = "BLOSSOM",
}

// Simulated invoice processor.
class InvoiceProcessor {
  async processInvoice(amount: number, timeoutMs: number): Promise<void> {
    console.log(`Simulating invoice processing for amount ${amount} (waiting ${timeoutMs}ms)...`);
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    console.log("Invoice simulated: Payment received.");
  }
}

// Simple serial queue for one-at-a-time processing.
class SerialQueue {
  private current: Promise<void> = Promise.resolve();
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.current.then(() => task());
    this.current = result.then(() => {});
    return result;
  }
}

const invoiceProcessor = new InvoiceProcessor();
const queue = new SerialQueue();

// Helper: Parse job payload from event.
async function parseJobPayload(event: DVMEvent): Promise<{
  output: string;
  uploadServer?: string;
  cellSize?: number;
  target?: string;
}> {
  const payload = JSON.parse(event.content);
  if (!payload.output) {
    throw new Error("Missing required parameter 'output'");
  }
  return payload;
}

// Helper: Process images and store the sprite.
// Calls the processor, computes the SHA-256 hash of the sprite, and stores it in an "output" folder.
async function processImagesAndStore(
  mapping: Record<string, string>,
  cellSize: number
): Promise<{ spriteData: Uint8Array; spriteHash: string; jsonPath: string }> {
  const tempSpritePath = "./spryte-temp.png";
  const jsonPath = "./spryte-mapping.json";
  await processor(mapping, cellSize, tempSpritePath, jsonPath, "./default.png");
  const spriteData = await Deno.readFile(tempSpritePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", spriteData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  const outputFolder = "./output";
  await Deno.mkdir(outputFolder, { recursive: true });
  const newSpritePath = `${outputFolder}/${hashHex}.png`;
  await Deno.writeFile(newSpritePath, spriteData);
  console.log("Sprite stored at:", newSpritePath);
  return { spriteData, spriteHash: hashHex, jsonPath };
}

// NIP-96 upload implementation.
async function nip96UploadFile(
  spriteData: Uint8Array,
  serverApiUrl: string
): Promise<string> {
  const file = new File([spriteData], "spryte.png", { type: "image/png" });
  const fileHash = await calculateFileHash(file);
  console.log(`Simulating NIP-96 upload. Calculated file hash: ${fileHash}`);
  // In a real implementation, sign an upload auth event and generate an Authorization header.
  const dummyAuthHeader = "DUMMY_AUTH_HEADER";
  const optionalFields: OptionalFormDataFields = {};
  const response = await uploadFile(file, serverApiUrl, dummyAuthHeader, optionalFields);
  if (response.status === "success") {
    const tags = response.nip94_event?.tags;
    let uploadedUrl: string | undefined;
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        if (tag[0] === "url" && tag[1]) {
          uploadedUrl = tag[1];
          break;
        }
      }
    }
    if (!uploadedUrl) {
      throw new Error("Upload succeeded but URL not found in response");
    }
    return uploadedUrl;
  } else {
    throw new Error("Upload failed: " + response.message);
  }
}

// Blossom upload implementation using blossom-client-sdk.
async function blossomUploadFile(
  spriteData: Uint8Array,
  serverApiUrl: string
): Promise<string> {
  const file = new File([spriteData], "spryte.png", { type: "image/png" });
  const fileHash = await calculateFileHash(file);
  console.log(`Simulating Blossom upload. Calculated file hash: ${fileHash}`);

  // Dummy signer function; in production, integrate with a proper signer.
  async function signer(event: any): Promise<any> {
    return { id: "dummy", sig: "dummy", pubkey: "dummy" };
  }
  
  // Create an upload auth event using BlossomClient.
  const uploadAuth = await BlossomClient.createUploadAuth(file, serverApiUrl, "Upload spryte.png", signer);
  // Use BlossomClient to upload the blob.
  const res = await BlossomClient.uploadBlob(serverApiUrl, file, uploadAuth);
  if (res.ok) {
    const json = await res.json();
    const tags = json.nip94_event?.tags;
    let uploadedUrl: string | undefined;
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        if (tag[0] === "url" && tag[1]) {
          uploadedUrl = tag[1];
          break;
        }
      }
    }
    if (!uploadedUrl) {
      throw new Error("Upload succeeded but URL not found in response");
    }
    return uploadedUrl;
  } else {
    throw new Error(`Blossom upload failed with status ${res.status}`);
  }
}

// Helper: Generate result output based on desired output type.
// Uses NIP-96 or Blossom upload functionality; if upload fails, falls back to BASE64.
async function generateResultOutputWithHash(
  spriteData: Uint8Array,
  spriteHash: string,
  outputPref: OutputType,
  uploadServer?: string
): Promise<string> {
  if (outputPref === OutputType.BASE64) {
    return btoa(String.fromCharCode(...spriteData));
  } else if (outputPref === OutputType.NIP96) {
    if (!uploadServer) {
      throw new Error(`Missing required parameter: uploadServer for output type ${outputPref}`);
    }
    try {
      console.log(`Uploading sprite using NIP-96 to ${uploadServer}...`);
      const uploadedUrl = await nip96UploadFile(spriteData, uploadServer);
      console.log("NIP-96 upload complete:", uploadedUrl);
      return uploadedUrl;
    } catch (err) {
      console.error("NIP-96 upload failed, falling back to BASE64:", err);
      return btoa(String.fromCharCode(...spriteData));
    }
  } else if (outputPref === OutputType.BLOSSOM) {
    if (!uploadServer) {
      throw new Error(`Missing required parameter: uploadServer for output type ${outputPref}`);
    }
    try {
      console.log(`Uploading sprite using Blossom to ${uploadServer}...`);
      const uploadedUrl = await blossomUploadFile(spriteData, uploadServer);
      console.log("Blossom upload complete:", uploadedUrl);
      return uploadedUrl;
    } catch (err) {
      console.error("Blossom upload failed, falling back to BASE64:", err);
      return btoa(String.fromCharCode(...spriteData));
    }
  } else {
    return "";
  }
}

// Main job processing function.
// This async generator yields feedback events and finally the job result event.
async function* processJob(event: DVMEvent): AsyncGenerator<DVMEvent, void, unknown> {
  let payload;
  try {
    payload = await parseJobPayload(event);
  } catch (err) {
    const errorFeedback = createEvent(7000, {
      content: "Error: event content is not valid JSON or missing required parameters.",
      tags: [["status", "error"]],
    });
    yield errorFeedback;
    return;
  }

  // Determine target pubkey (optionally set by requester).
  const targetPubkey = payload.target || event.pubkey;
  console.log("Target pubkey for processing:", targetPubkey);
  // Generate image mapping using the collector.
  const mapping = await collector(targetPubkey);
  const outputPref = (payload.output as string).toUpperCase() as OutputType;
  if ((outputPref === OutputType.NIP96 || outputPref === OutputType.BLOSSOM) && !payload.uploadServer) {
    const errorFeedback = createEvent(7000, {
      content: `Error: upload server parameter missing for output type ${payload.output}.`,
      tags: [["status", "error"]],
    });
    yield errorFeedback;
    return;
  }
  const cellSize = payload.cellSize || 128;
  const uploadServer = payload.uploadServer;

  // Calculate cost.
  const numPubkeys = Object.keys(mapping).length;
  const cost = numPubkeys * COST_PER_PUBKEY;
  console.log(`Total cost calculated: ${cost} (for ${numPubkeys} pubkeys).`);

  // Simulate a bolt11 invoice.
  const simulatedInvoice = "SIMULATED_BOLT11_INVOICE";
  const feedbackEvent = createEvent(7000, {
    content: "Payment required before processing the job.",
    tags: [["status", "PAYMENT_REQUIRED"], ["amount", cost.toString(), simulatedInvoice]],
  });
  console.log("Publishing payment-required feedback event:", feedbackEvent.id);
  yield feedbackEvent;

  await invoiceProcessor.processInvoice(cost, 5000);

  // Process the image job.
  console.log("Processing image job with cellSize:", cellSize);
  const { spriteData, spriteHash, jsonPath } = await processImagesAndStore(mapping, cellSize);
  console.log("Image processing complete, sprite generated.");

  // Generate result output.
  let resultOutput: string;
  if (outputPref === OutputType.BASE64) {
    resultOutput = btoa(String.fromCharCode(...spriteData));
  } else {
    resultOutput = await generateResultOutputWithHash(spriteData, spriteHash, outputPref, uploadServer);
  }

  const resultPayload = {
    outputType: outputPref,
    result: resultOutput,
    mapping: jsonPath,
    message: "Image processing complete",
  };

  const jobResultEvent = createEvent(6300, {
    content: JSON.stringify(resultPayload),
    tags: [["request", JSON.stringify(event)]],
  });
  console.log("Publishing job result event:", jobResultEvent.id);
  yield jobResultEvent;
}

// Create the DVM instance.
const hexPrivateKey: string | undefined = process.env.DVM_PRIVATE_KEY || undefined;
if (!hexPrivateKey) {
  throw new Error("DVM_PRIVATE_KEY is not set in ENV");
}
const relays: string[] = ["wss://relay.damus.io", "wss://dvms.f7z.io"];

const dvm = new DVM({
  sk: hexPrivateKey,
  relays,
  requireMention: true,
  expireAfter: 60 * 60, // 1 hour
  handlers: {
    5300: (dvmInstance) => ({
      handleEvent: async function* (event: DVMEvent) {
        console.log("Received job request event:", event.id);
        for await (const e of processJob(event)) {
          yield e;
        }
      },
    }),
  },
});

dvm.logEvents = true;
console.log("Starting image processing DVM...");
dvm.start();

Deno.addSignalListener("SIGINT", () => {
  console.log("Stopping DVM...");
  dvm.stop();
  Deno.exit();
});
