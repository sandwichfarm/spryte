import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  NostrServerTransport,
  LnBolt11NwcPaymentProcessor,
  withServerPayments,
  type PricedCapability,
} from "@contextvm/sdk"
import { z } from "zod"
import { createCvmSigner } from "./signer.ts"
import { enqueueJob, recoverStuckJobs, startWorker, stopWorker, closeJobsDb } from "./job-queue.ts"
import { loadPlans, getPlansConfig, getPlan } from "./plans.ts"
import { loadCvmConfig, getRelays } from "./config.ts"
import { checkLimits, resolveGeneratePrice } from "./limits.ts"
import { createSubscription, closeSubscriptionsDb } from "./subscriptions.ts"
import { closeImageCacheDb } from "./image-cache.ts"
import { closeGenerationsDb } from "./spryte-tool.ts"
import { startBackgroundRegen, stopBackgroundRegen } from "./background-regen.ts"

// ---------------------------------------------------------------------------
// Client pubkey threading
// ---------------------------------------------------------------------------
// The resolvePrice callback receives clientPubkey but tool handlers don't.
// We use a request-scoped map keyed by a stringified request identifier.
const requestClientPubkeys = new Map<string, string>()

function getRequestKey(params: Record<string, unknown>): string {
  // Use the tool name + stringified arguments as a unique-enough key
  const args = params?.arguments ?? {}
  return `${params?.name}:${JSON.stringify(args)}`
}


// Create MCP server with tools
const server = new McpServer({
  name: "spryte",
  version: "0.2.0",
})

// ---------------------------------------------------------------------------
// Tool: generate-spryte
// ---------------------------------------------------------------------------
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
      requestInvoice: z
        .boolean()
        .optional()
        .describe("If true, pay per-generation to bypass plan limits"),
    },
  },
  async ({ pubkey, cellSize, uploadServer, requestInvoice }, extra) => {
    const resolvedCellSize = cellSize ?? 128
    const resolvedUploadServer = uploadServer ?? Deno.env.get("BLOSSOM_SERVER_URL") ?? "http://localhost:3000"

    // Retrieve clientPubkey from request context
    const reqKey = `generate-spryte:${JSON.stringify({ pubkey, cellSize, uploadServer, requestInvoice })}`
    const clientPubkey = requestClientPubkeys.get(reqKey) ?? ""
    requestClientPubkeys.delete(reqKey)

    // Build sendProgress from MCP's built-in notification mechanism
    const progressToken = (extra as any)?._meta?.progressToken
    const sendProgress = progressToken != null
      ? async (progress: number, total: number, message: string) => {
          try {
            await (extra as any).sendNotification({
              method: "notifications/progress",
              params: { progressToken, progress, total, message },
            })
          } catch {
            // Best-effort — don't fail the job if notification delivery fails
          }
        }
      : undefined

    // Check limits
    const limits = checkLimits(clientPubkey, pubkey)
    const paid = requestInvoice && limits.limitReasons.length > 0

    // If time-limited and not paid, return cached previous result
    if (limits.limitReasons.includes("time_limit") && !paid) {
      const prev = limits.previousResult
      if (prev?.spriteUrl && prev?.mappingUrl) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                spriteUrl: prev.spriteUrl,
                mappingUrl: prev.mappingUrl,
                pubkeyCount: prev.pubkeyCount ?? 0,
                cellSize: prev.cellSize,
                cached: true,
                limitReasons: limits.limitReasons,
              }, null, 2),
            },
          ],
        }
      }
    }

    // Enqueue the generation job
    const result = await enqueueJob(pubkey, resolvedCellSize, resolvedUploadServer, {
      clientPubkey,
      requestInvoice: requestInvoice ?? false,
      maxImages: limits.maxImages,
      paid: paid ?? false,
      sendProgress,
    })

    // Add limit reasons if image was truncated
    if (limits.limitReasons.includes("image_limit") || result.limitReasons?.length) {
      const allReasons = new Set([...limits.limitReasons, ...(result.limitReasons ?? [])])
      result.limitReasons = [...allReasons]
    }

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

// ---------------------------------------------------------------------------
// Tool: get-plans
// ---------------------------------------------------------------------------
server.registerTool(
  "get-plans",
  {
    title: "Get Plans",
    description: "Get available subscription plans and pricing information.",
    inputSchema: {},
  },
  async () => {
    const config = getPlansConfig()
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(config, null, 2),
        },
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// Tool: subscribe
// ---------------------------------------------------------------------------
server.registerTool(
  "subscribe",
  {
    title: "Subscribe to Plan",
    description: "Subscribe to a paid plan for higher limits and more features.",
    inputSchema: {
      planId: z.string().describe("Plan ID to subscribe to (e.g. 'pro', 'unlimited')"),
      period: z.enum(["monthly", "yearly"]).describe("Billing period"),
    },
  },
  async ({ planId, period }) => {
    // Retrieve clientPubkey from request context
    const reqKey = `subscribe:${JSON.stringify({ planId, period })}`
    const clientPubkey = requestClientPubkeys.get(reqKey) ?? ""
    requestClientPubkeys.delete(reqKey)

    if (!clientPubkey) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Could not identify client" }) }],
      }
    }

    const subscription = createSubscription(clientPubkey, planId, period)
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            subscribed: true,
            planId: subscription.planId,
            period: subscription.period,
            expiresAt: subscription.expiresAt,
            expiresAtISO: new Date(subscription.expiresAt).toISOString(),
          }, null, 2),
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
      amount: 21,
      currencyUnit: "sats",
      description: "Generate a sprite sheet (free within plan limits)",
    },
    {
      method: "tools/call",
      name: "subscribe",
      amount: 1000,
      currencyUnit: "sats",
      description: "Subscribe to a plan",
    },
  ]

  const paymentProcessor = new LnBolt11NwcPaymentProcessor({
    nwcConnectionString: nwcConnection,
  })

  transport = withServerPayments(transport, {
    processors: [paymentProcessor],
    pricedCapabilities,
    resolvePrice: async ({ request, clientPubkey }) => {
      const params = request.params as { name?: string; arguments?: Record<string, unknown> }
      const toolName = params?.name
      const args = params?.arguments ?? {}

      // Store clientPubkey for the tool handler to retrieve
      const reqKey = getRequestKey(params)
      requestClientPubkeys.set(reqKey, clientPubkey)

      if (toolName === "get-plans") {
        return { amount: 0, description: "Plan information is free" }
      }

      if (toolName === "subscribe") {
        const planId = args.planId as string
        const period = args.period as string
        const plan = getPlan(planId)
        const pricing = plan.pricing?.[period as "monthly" | "yearly"]
        if (!pricing) {
          return { amount: 0, description: "Free plan" }
        }
        return {
          amount: pricing.costSats,
          description: `${plan.name} plan — ${period} subscription`,
        }
      }

      if (toolName === "generate-spryte") {
        const targetPubkey = args.pubkey as string
        const requestInvoice = (args.requestInvoice as boolean) ?? false
        return resolveGeneratePrice(clientPubkey, targetPubkey, requestInvoice)
      }

      return { amount: 0, description: "Unknown tool" }
    },
  }) as NostrServerTransport
} else {
  console.log("[cvm] No NWC configured, running without payments (all requests free)")
}

// Load config, recover jobs, start worker
await loadCvmConfig()
await loadPlans()
recoverStuckJobs()
startWorker()
startBackgroundRegen()

// Capture clientPubkey from Nostr events for tool handlers.
// onmessageWithContext is called alongside onmessage by the transport,
// so it doesn't interfere with the MCP server's message processing.
;(transport as any).onmessageWithContext = (message: any, ctx: { clientPubkey: string }) => {
  if (message?.method === "tools/call" && message?.params) {
    const reqKey = getRequestKey(message.params)
    requestClientPubkeys.set(reqKey, ctx.clientPubkey)
  }
}

// Connect and start
await server.connect(transport)
console.log("[cvm] Spryte CVM is running")

// Graceful shutdown
Deno.addSignalListener("SIGINT", async () => {
  console.log("[cvm] Shutting down...")
  stopBackgroundRegen()
  stopWorker()
  closeJobsDb()
  closeSubscriptionsDb()
  closeImageCacheDb()
  closeGenerationsDb()
  await server.close()
  Deno.exit()
})
