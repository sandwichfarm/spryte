# Payments

Spryte uses Lightning micropayments via the CEP-8 protocol. The CVM includes payment middleware when configured with a NWC connection string.

## Free Tier

- **Cell size**: Default (128px)
- **Limit**: One generation per pubkey per month
- **No payment required**

Free-tier requests are tracked in the CVM's generation history database. If a pubkey has been generated within the current month at 128px, subsequent requests at 128px are still free (the CVM returns the cached result).

## Paid Pricing

| Trigger | Cost |
|---------|------|
| Higher resolution (256px, 512px) | 21 sats |
| Repeat generation within the same month | 21 sats |

When the CVM has `NWC_CONNECTION_STRING` configured, paid requests go through the CEP-8 payment flow. Without NWC configured on the server, all requests are free.

## CEP-8 Payment Flow

1. Client sends `generate-spryte` tool call
2. CVM checks generation history — if payment is required, it responds with a `notifications/payment_required` notification containing a BOLT11 Lightning invoice
3. Client pays the invoice
4. Client confirms payment
5. CVM verifies payment and processes the request
6. CVM returns the sprite URLs

## NWC Auto-Pay Setup

For automatic payments, configure NWC (Nostr Wallet Connect, NIP-47) on the client side:

```typescript
import { Spryte } from "@spryte/client";

const spryte = new Spryte({
  privateKey: "your-hex-nostr-private-key",
  serverPubkey: "spryte-cvm-hex-pubkey",
  nwcConnectionString: "nostr+walletconnect://...",
});

await spryte.connect();

// Paid requests are handled automatically
const sheet = await spryte.generate("target-pubkey", 256);
```

The `@contextvm/sdk` includes `LnBolt11NwcPaymentHandler` which automatically:

1. Receives the payment notification
2. Decodes the BOLT11 invoice
3. Pays it via the NWC-connected wallet
4. Sends the payment confirmation to the CVM

### Getting an NWC Connection String

NWC is supported by wallets like Alby, Mutiny, and others. The connection string looks like:

```
nostr+walletconnect://<wallet-pubkey>?relay=wss://relay.example&secret=<hex-secret>
```

Consult your wallet's documentation for generating an NWC connection string.

## Manual Invoice Handling

Without NWC, paid requests will include a BOLT11 invoice in the error/notification. Your application needs to:

1. Extract the invoice from the payment notification
2. Present it to the user (QR code, copy button, etc.)
3. Wait for the user to pay externally
4. Confirm payment on the transport

When using the low-level `SpryteCvmClient` or `NostrClientTransport` directly, you can implement custom payment handling by intercepting the payment notifications on the transport layer.

## Server-Side Configuration

For CVM operators, payments are enabled by setting the `NWC_CONNECTION_STRING` environment variable:

```bash
# Enable payments on the CVM
export NWC_CONNECTION_STRING="nostr+walletconnect://..."
```

Without this variable, the CVM operates in free-only mode — all requests are processed without payment regardless of cell size or frequency.

Generation history is stored in `generations.db` (SQLite) and tracks pubkey, cell size, and timestamp for free-tier enforcement.
