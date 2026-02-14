import { parse } from "https://deno.land/std/yaml/mod.ts"

export interface Plan {
  name: string
  description: string
  maxImages: number | null
  generationsPerMonth: number | null
  pricing?: {
    monthly?: { costSats: number }
    yearly?: { costSats: number }
  }
}

export interface PlansConfig {
  oneTimeUpgrade: { costSats: number; description: string }
  plans: Record<string, Plan>
}

let plansConfig: PlansConfig | null = null

/** Load and validate plans from YAML config. Stores as singleton. */
export async function loadPlans(configPath?: string): Promise<PlansConfig> {
  const resolved = configPath ?? new URL("../config/plans.yaml", import.meta.url).pathname
  const yaml = await Deno.readTextFile(resolved)
  const raw = parse(yaml) as Record<string, unknown>

  // Validate required fields
  const oneTimeUpgrade = raw.oneTimeUpgrade as { costSats?: number; description?: string } | undefined
  if (!oneTimeUpgrade?.costSats) {
    throw new Error("plans.yaml: oneTimeUpgrade.costSats is required")
  }

  const plans = raw.plans as Record<string, unknown> | undefined
  if (!plans || !plans.free) {
    throw new Error("plans.yaml: a 'free' plan is required")
  }

  plansConfig = {
    oneTimeUpgrade: {
      costSats: oneTimeUpgrade.costSats,
      description: oneTimeUpgrade.description ?? "One-time upgrade",
    },
    plans: plans as unknown as Record<string, Plan>,
  }

  const planNames = Object.keys(plansConfig.plans)
  console.log(`[plans] Loaded ${planNames.length} plans: ${planNames.join(", ")}`)
  return plansConfig
}

/** Get the loaded plans config. Throws if not loaded yet. */
export function getPlansConfig(): PlansConfig {
  if (!plansConfig) {
    throw new Error("Plans not loaded. Call loadPlans() first.")
  }
  return plansConfig
}

/** Get a specific plan by ID. Throws if not found. */
export function getPlan(planId: string): Plan {
  const config = getPlansConfig()
  const plan = config.plans[planId]
  if (!plan) {
    throw new Error(`Unknown plan: ${planId}`)
  }
  return plan
}
