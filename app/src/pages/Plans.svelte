<script lang="ts">
  import { session, error, paymentInvoice } from "../lib/stores";
  import { getPlans, subscribe } from "../lib/cvm-client";
  import LoginDialog from "../components/LoginDialog.svelte";
  import plansYaml from "../../../config/plans.yaml";

  interface Plan {
    name: string;
    description: string;
    maxImages: number | null;
    generationsPerMonth: number | null;
    pricing?: {
      monthly?: { costSats: number };
      yearly?: { costSats: number };
    };
  }

  const plans = plansYaml.plans as Record<string, Plan>;
  const planEntries = Object.entries(plans);

  // Identify the "pro" plan for special styling
  const proPlanId = planEntries.find(([id]) => id === "pro")?.[0] ?? "";

  let subscribing = false;
  let subscribeResult: Record<string, unknown> | null = null;

  async function handleSubscribe(planId: string, period: "monthly" | "yearly") {
    subscribing = true;
    subscribeResult = null;
    try {
      const result = await subscribe(planId, period);
      subscribeResult = result;
    } finally {
      subscribing = false;
    }
  }

  function formatSats(sats: number): string {
    return sats.toLocaleString();
  }
</script>

<div class="max-w-5xl mx-auto py-8 px-6">
  <h1 class="text-section font-bold mb-2">Plans</h1>
  <p class="text-surface-400 mb-8">Choose a plan that fits your needs.</p>

  {#if $error}
    <div class="bg-red-950/40 border border-red-800/40 text-red-300 rounded-lg p-4 text-sm mb-6">
      {$error}
    </div>
  {/if}

  {#if $paymentInvoice}
    <div class="bg-amber-950/40 border border-amber-800/40 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-semibold text-amber-300 mb-2">Payment Required</h3>
      <p class="text-xs text-amber-300/80 mb-3">
        Scan or copy this Lightning invoice to complete your subscription:
      </p>
      <div class="bg-surface-950 rounded-lg p-3 text-xs font-mono text-surface-300 break-all">
        {$paymentInvoice}
      </div>
    </div>
  {/if}

  {#if subscribeResult?.subscribed}
    <div class="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-semibold text-emerald-300 mb-1">Subscribed!</h3>
      <p class="text-xs text-emerald-300/80">
        You're now on the <strong>{subscribeResult.planId}</strong> plan ({subscribeResult.period}).
        Expires: {subscribeResult.expiresAtISO}
      </p>
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#each planEntries as [planId, plan]}
      <div
        class="bg-surface-900 border border-surface-800/60 rounded-lg p-6 flex flex-col
          {planId === proPlanId ? 'border-l-2 border-l-brand-500' : ''}"
      >
        <h2 class="text-xl font-bold mb-1">{plan.name}</h2>
        <p class="text-sm text-surface-400 mb-4">{plan.description}</p>

        <div class="text-sm text-surface-300 space-y-2 mb-6 flex-1">
          <div class="flex justify-between">
            <span class="text-surface-500">Max images</span>
            <span>{plan.maxImages != null ? plan.maxImages.toLocaleString() : "Unlimited"}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Generations/month</span>
            <span>{plan.generationsPerMonth != null ? plan.generationsPerMonth : "Unlimited"}</span>
          </div>
        </div>

        {#if plan.pricing}
          <div class="space-y-2">
            {#if plan.pricing.monthly}
              <button
                onclick={() => handleSubscribe(planId, "monthly")}
                disabled={!$session || subscribing}
                class="w-full bg-brand-500 hover:bg-brand-400 active:bg-brand-600 disabled:bg-surface-800 disabled:text-surface-500 text-white rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
              >
                {subscribing ? "Processing..." : `${formatSats(plan.pricing.monthly.costSats)} sats/month`}
              </button>
            {/if}
            {#if plan.pricing.yearly}
              <button
                onclick={() => handleSubscribe(planId, "yearly")}
                disabled={!$session || subscribing}
                class="w-full bg-surface-800 hover:bg-surface-700 border border-surface-700/50 disabled:bg-surface-800 disabled:text-surface-500 text-surface-200 rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
              >
                {subscribing ? "Processing..." : `${formatSats(plan.pricing.yearly.costSats)} sats/year`}
              </button>
            {/if}
          </div>
        {:else}
          <div class="text-center text-sm text-surface-500 py-2">
            Free
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if !$session}
    <div class="mt-8">
      <p class="text-surface-400 mb-4 text-sm">Log in to subscribe to a plan.</p>
      <LoginDialog />
    </div>
  {/if}
</div>
