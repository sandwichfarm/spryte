import { getPlansConfig, getPlan, type Plan } from "./plans.ts"
import { getEffectivePlanId } from "./subscriptions.ts"
import { getRecentGenerationCount, getLatestGeneration, type GenerationRecord } from "./spryte-tool.ts"

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000

export interface LimitCheckResult {
  effectivePlanId: string
  effectivePlan: Plan
  maxImages: number | null
  limitReasons: string[]
  previousResult: GenerationRecord | null
}

/** Check limits for a client generating a sprite for a target pubkey. */
export function checkLimits(clientPubkey: string, targetPubkey: string): LimitCheckResult {
  const effectivePlanId = getEffectivePlanId(clientPubkey)
  const effectivePlan = getPlan(effectivePlanId)
  const limitReasons: string[] = []
  let previousResult: GenerationRecord | null = null

  // Check generation frequency limit
  if (effectivePlan.generationsPerMonth != null) {
    const cutoff = Date.now() - ONE_MONTH_MS
    const recentCount = getRecentGenerationCount(clientPubkey, cutoff)
    if (recentCount >= effectivePlan.generationsPerMonth) {
      limitReasons.push("time_limit")
      previousResult = getLatestGeneration(clientPubkey, targetPubkey)
    }
  }

  // Image limit is checked during generation (in spryte-tool.ts), but we report it here
  // for the tool handler to include in the response schema

  return {
    effectivePlanId,
    effectivePlan,
    maxImages: effectivePlan.maxImages,
    limitReasons,
    previousResult,
  }
}

/** Resolve the price for a generate-spryte request. */
export function resolveGeneratePrice(
  clientPubkey: string,
  targetPubkey: string,
  requestInvoice: boolean,
): { amount: number; description: string } {
  const config = getPlansConfig()
  const limits = checkLimits(clientPubkey, targetPubkey)

  // Within plan limits → free
  if (limits.limitReasons.length === 0) {
    return { amount: 0, description: `${limits.effectivePlan.name} plan: within limits` }
  }

  // Exceeds limits AND requestInvoice → charge one-time upgrade fee
  if (requestInvoice) {
    return {
      amount: config.oneTimeUpgrade.costSats,
      description: config.oneTimeUpgrade.description,
    }
  }

  // Exceeds limits AND NOT requestInvoice → free (tool handler returns cached/limited result)
  return { amount: 0, description: "Returning cached/limited result" }
}
