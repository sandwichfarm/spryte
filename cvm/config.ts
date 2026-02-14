import { parse } from "https://deno.land/std/yaml/mod.ts"

export interface CvmConfig {
  relays: string[]
}

let cvmConfig: CvmConfig | null = null

/** Load CVM config from YAML file. Stores as singleton. */
export async function loadCvmConfig(configPath?: string): Promise<CvmConfig> {
  const resolved = configPath ?? new URL("../config/cvm.yaml", import.meta.url).pathname
  const yaml = await Deno.readTextFile(resolved)
  const raw = parse(yaml) as Record<string, unknown>

  const relays = raw.relays as string[] | undefined
  if (!relays || !Array.isArray(relays) || relays.length === 0) {
    throw new Error("cvm.yaml: relays array is required and must not be empty")
  }

  cvmConfig = { relays }

  console.log(`[cvm-config] Loaded ${relays.length} relay(s): ${relays.join(", ")}`)
  return cvmConfig
}

/** Get the loaded CVM config. Throws if not loaded yet. */
export function getCvmConfig(): CvmConfig {
  if (!cvmConfig) {
    throw new Error("CVM config not loaded. Call loadCvmConfig() first.")
  }
  return cvmConfig
}

/**
 * Get relay URLs for the CVM.
 * Priority: CVM_RELAYS env var > loaded config file.
 */
export function getRelays(): string[] {
  const relayEnv = Deno.env.get("CVM_RELAYS")
  if (relayEnv) {
    return relayEnv.split(",").map((r) => r.trim()).filter(Boolean)
  }
  return getCvmConfig().relays
}
