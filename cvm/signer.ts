import { PrivateKeySigner } from "@contextvm/sdk"

export function createCvmSigner(): PrivateKeySigner {
  const hexKey = Deno.env.get("CVM_PRIVATE_KEY")
  if (!hexKey) {
    throw new Error("CVM_PRIVATE_KEY environment variable is not set")
  }
  return new PrivateKeySigner(hexKey)
}
