import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  NostrServerTransport,
  LnBolt11NwcPaymentProcessor,
  withServerPayments,
  type PricedCapability,
} from "@contextvm/sdk"
import { z } from "zod"
import { createCvmSigner } from "./signer.ts"
import { shouldCharge } from "./spryte-tool.ts"
import { enqueueJob, recoverStuckJobs, startWorker, stopWorker, closeJobsDb } from "./job-queue.ts"

const PRICE_SATS = 21

// Parse relay URLs from env
function getRelays(): string[] {
  const relayEnv = Deno.env.get("CVM_RELAYS")
  if (!relayEnv) return ["wss://relay.damus.io"]
  return relayEnv.split(",").map((r) => r.trim()).filter(Boolean)
}

// Create MCP server with generate-spryte tool
const server = new McpServer({
  name: "spryte",
  version: "0.1.0",
})

server.registerTool(
  "generate-spryte",
  {
    title: "Generate Spryte",
    description:
      "Generate a sprite sheet of Nostr follower profile images for a given pubkey. Returns URLs for the sprite PNG and mapping JSON on a Blossom server.",
    inputSchema: {
      pubkey: z
        .string()
        .length(64)
        .describe("Hex-encoded Nostr pubkey to generate sprite for"),
      cellSize: z
        .number()
        .int()
        .min(32)
        .max(512)
        .optional()
        .describe("Pixel dimension for each cell (default: 128)"),
      uploadServer: z
        .string()
        .url()
        .optional()
        .describe("Blossom server URL for uploads (uses default if omitted)"),
    },
  },
  async ({ pubkey, cellSize, uploadServer }) => {
    const resolvedCellSize = cellSize ?? 128
    const resolvedUploadServer = uploadServer ?? Deno.env.get("BLOSSOM_SERVER_URL") ?? "http://localhost:3000"
    const result = await enqueueJob(pubkey, resolvedCellSize, resolvedUploadServer)
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  },
)

// Create signer and transport
const signer = createCvmSigner()
const relays = getRelays()

console.log(`[cvm] Relays: ${relays.join(", ")}`)

let transport = new NostrServerTransport({
  signer,
  relayHandler: relays,
  serverInfo: {
    name: "Spryte CVM",
    about: "Generate sprite sheets of Nostr follower profile images",
  },
  isPublicServer: true,
  logLevel: "info",
})

// Attach payment middleware if NWC is configured
const nwcConnection = Deno.env.get("NWC_CONNECTION_STRING")
if (nwcConnection) {
  console.log("[cvm] NWC configured, enabling payments")

  const pricedCapabilities: PricedCapability[] = [
    {
      method: "tools/call",
      name: "generate-spryte",
      amount: PRICE_SATS,
      currencyUnit: "sats",
      description: "Generate a sprite sheet (free once/month at default resolution)",
    },
  ]

  const paymentProcessor = new LnBolt11NwcPaymentProcessor({
    nwcConnectionString: nwcConnection,
  })

  transport = withServerPayments(transport, {
    processors: [paymentProcessor],
    pricedCapabilities,
    resolvePrice: async ({ request, clientPubkey }) => {
      // Extract tool call arguments
      const params = request.params as { name?: string; arguments?: Record<string, unknown> }
      const args = params?.arguments ?? {}
      const cellSize = (args.cellSize as number) ?? 128

      // Free tier: default cellSize, once per pubkey per month
      if (!shouldCharge(clientPubkey, cellSize)) {
        return { amount: 0, description: "Free tier: first generation this month" }
      }

      return {
        amount: PRICE_SATS,
        description: `Sprite generation (${cellSize}px cells)`,
      }
    },
  }) as NostrServerTransport
} else {
  console.log("[cvm] No NWC configured, running without payments (all requests free)")
}

// Recover any jobs left in processing state from a previous crash, then start the worker
recoverStuckJobs()
startWorker()

// Connect and start
await server.connect(transport)
console.log("[cvm] Spryte CVM is running")

// Graceful shutdown
Deno.addSignalListener("SIGINT", async () => {
  console.log("[cvm] Shutting down...")
  stopWorker()
  closeJobsDb()
  await server.close()
  Deno.exit()
})
