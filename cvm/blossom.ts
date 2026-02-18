import { BlossomClient } from "blossom-client-sdk"
import { finalizeEvent, getPublicKey } from "nostr-tools/pure"
import type { EventTemplate } from "nostr-tools/pure"

export interface NostrSigner {
  getPublicKey(): string
  signEvent(template: EventTemplate): Promise<{
    id: string
    sig: string
    pubkey: string
    kind: number
    created_at: number
    content: string
    tags: string[][]
  }>
}

/** Adapt our NostrSigner to the blossom-client-sdk Signer type */
function toBlossomSigner(signer: NostrSigner) {
  return async (draft: { created_at: number; kind: number; content: string; tags: string[][] }) => {
    const signed = await signer.signEvent(draft)
    return signed
  }
}

export interface BlossomUploadResult {
  spriteUrl: string
  mappingUrl: string
}

/**
 * Upload sprite PNG and mapping JSON to a Blossom server.
 * Returns the URLs for both uploaded blobs.
 */
export async function uploadToBlossomServer(
  spriteData: Uint8Array,
  mappingJson: string,
  serverUrl: string,
  signer: NostrSigner
): Promise<BlossomUploadResult> {
  const blossomSigner = toBlossomSigner(signer)

  // onAuth callback — creates a fresh auth event when the server requires it
  const onAuth = async (_server: string, sha256: string) => {
    return BlossomClient.createUploadAuth(blossomSigner, sha256, {
      servers: [serverUrl],
      message: "Upload spryte blob",
    })
  }

  // Upload sprite PNG
  const spriteFile = new File([spriteData], "spryte.png", { type: "image/png" })
  const spriteBlob = await BlossomClient.uploadBlob(serverUrl, spriteFile, {
    auth: true,
    onAuth,
  })

  // Upload mapping JSON
  const mappingFile = new File([new TextEncoder().encode(mappingJson)], "mapping.json", {
    type: "application/json",
  })
  const mappingBlob = await BlossomClient.uploadBlob(serverUrl, mappingFile, {
    auth: true,
    onAuth,
  })

  return {
    spriteUrl: spriteBlob.url,
    mappingUrl: mappingBlob.url,
  }
}

/** Create a NostrSigner from a hex private key */
export function createSigner(hexPrivateKey: string): NostrSigner {
  const secretKey = hexToBytes(hexPrivateKey)
  const pubkey = getPublicKey(secretKey)

  return {
    getPublicKey() {
      return pubkey
    },
    async signEvent(template: EventTemplate) {
      return finalizeEvent(template, secretKey) as any
    },
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}
