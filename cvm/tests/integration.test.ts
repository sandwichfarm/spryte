import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { z } from "npm:zod"
const { McpServer } = await import("npm:@modelcontextprotocol/sdk@^1.0.0/server/mcp.js")
const { Client } = await import("npm:@modelcontextprotocol/sdk@^1.0.0/client/index.js")
import { NostrServerTransport, NostrClientTransport, PrivateKeySigner } from "@contextvm/sdk"
import { isolatedTestDir, randomHexKey, writePlansFixture, startNakRelay } from "./helpers.ts"
import { loadPlans, getPlansConfig } from "../plans.ts"
import { createSubscription, closeSubscriptionsDb } from "../subscriptions.ts"

function randomPort(): number {
  return 10600 + Math.floor(Math.random() * 1000)
}

Deno.test({
  name: "get-plans round-trip over nak relay",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const iso = await isolatedTestDir()
    const port = randomPort()
    let relay: Deno.ChildProcess | undefined

    try {
      // Load plans
      const plansPath = await writePlansFixture(iso.tempDir)
      await loadPlans(plansPath)
      const expectedConfig = getPlansConfig()

      // Start ephemeral relay
      relay = await startNakRelay(port)
      const relayUrl = `ws://127.0.0.1:${port}`

      // Create server with get-plans tool
      const serverKey = randomHexKey()
      const serverSigner = new PrivateKeySigner(serverKey)
      const serverPubkey = await serverSigner.getPublicKey()

      const server = new McpServer({ name: "test-spryte", version: "0.0.1" })
      server.registerTool(
        "get-plans",
        { title: "Get Plans", description: "Get plans", inputSchema: {} },
        async () => ({
          content: [{ type: "text" as const, text: JSON.stringify(expectedConfig, null, 2) }],
        }),
      )

      const serverTransport = new NostrServerTransport({
        signer: serverSigner,
        relayHandler: [relayUrl],
        serverInfo: { name: "Test CVM", about: "test" },
        isPublicServer: true,
        logLevel: "error",
      })

      await server.connect(serverTransport)

      // Give server a moment to connect to relay
      await new Promise((r) => setTimeout(r, 500))

      // Create client
      const clientKey = randomHexKey()
      const clientSigner = new PrivateKeySigner(clientKey)

      const clientTransport = new NostrClientTransport({
        signer: clientSigner,
        relayHandler: [relayUrl],
        serverPubkey,
      })

      const client = new Client({ name: "test-client", version: "0.0.1" })
      await client.connect(clientTransport)

      // Call get-plans
      const result = await client.callTool({ name: "get-plans", arguments: {} })
      const content = result.content as Array<{ type: string; text: string }>
      const textContent = content.find((c: { type: string }) => c.type === "text")
      assertEquals(textContent !== undefined, true)

      const parsed = JSON.parse(textContent!.text)
      assertEquals(parsed.oneTimeUpgrade.costSats, expectedConfig.oneTimeUpgrade.costSats)
      assertEquals(Object.keys(parsed.plans).sort(), Object.keys(expectedConfig.plans).sort())

      // Cleanup
      await client.close()
      await server.close()
    } finally {
      if (relay) {
        try { relay.kill("SIGTERM") } catch { /* ignore */ }
      }
      closeSubscriptionsDb()
      await iso.cleanup()
    }
  },
})

Deno.test({
  name: "subscribe round-trip over nak relay",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const iso = await isolatedTestDir()
    const port = randomPort()
    let relay: Deno.ChildProcess | undefined

    try {
      // Load plans
      const plansPath = await writePlansFixture(iso.tempDir)
      await loadPlans(plansPath)

      // Start ephemeral relay
      relay = await startNakRelay(port)
      const relayUrl = `ws://127.0.0.1:${port}`

      // Create server with subscribe tool
      const serverKey = randomHexKey()
      const serverSigner = new PrivateKeySigner(serverKey)
      const serverPubkey = await serverSigner.getPublicKey()

      const server = new McpServer({ name: "test-spryte", version: "0.0.1" })
      server.registerTool(
        "subscribe",
        {
          title: "Subscribe",
          description: "Subscribe to a plan",
          inputSchema: {
            planId: z.string().describe("Plan ID"),
            period: z.enum(["monthly", "yearly"]).describe("Billing period"),
          },
        },
        async ({ planId, period }: { planId: string; period: string }) => {
          // Use a deterministic pubkey for the test since we don't have clientPubkey threading
          const testPubkey = "a".repeat(64)
          const sub = createSubscription(testPubkey, planId, period)
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                subscribed: true,
                planId: sub.planId,
                period: sub.period,
                expiresAt: sub.expiresAt,
              }, null, 2),
            }],
          }
        },
      )

      const serverTransport = new NostrServerTransport({
        signer: serverSigner,
        relayHandler: [relayUrl],
        serverInfo: { name: "Test CVM", about: "test" },
        isPublicServer: true,
        logLevel: "error",
      })

      await server.connect(serverTransport)

      // Give server a moment to connect to relay
      await new Promise((r) => setTimeout(r, 500))

      // Create client
      const clientKey = randomHexKey()
      const clientSigner = new PrivateKeySigner(clientKey)

      const clientTransport = new NostrClientTransport({
        signer: clientSigner,
        relayHandler: [relayUrl],
        serverPubkey,
      })

      const client = new Client({ name: "test-client", version: "0.0.1" })
      await client.connect(clientTransport)

      // Call subscribe
      const result = await client.callTool({ name: "subscribe", arguments: { planId: "pro", period: "monthly" } })
      const content = result.content as Array<{ type: string; text: string }>
      const textContent = content.find((c: { type: string }) => c.type === "text")
      assertEquals(textContent !== undefined, true)

      const parsed = JSON.parse(textContent!.text)
      assertEquals(parsed.subscribed, true)
      assertEquals(parsed.planId, "pro")
      assertEquals(parsed.period, "monthly")
      assertEquals(typeof parsed.expiresAt, "number")

      // Cleanup
      await client.close()
      await server.close()
    } finally {
      if (relay) {
        try { relay.kill("SIGTERM") } catch { /* ignore */ }
      }
      closeSubscriptionsDb()
      await iso.cleanup()
    }
  },
})
