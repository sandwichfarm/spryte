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

<div class="max-w-5xl mx-auto py-8 px-4">
  <h1 class="text-2xl font-bold mb-2">Plans</h1>
  <p class="text-gray-400 mb-8">Choose a plan that fits your needs.</p>

  {#if $error}
    <div class="bg-red-900/50 border border-red-700 text-red-200 rounded-lg p-4 text-sm mb-6">
      {$error}
    </div>
  {/if}

  {#if $paymentInvoice}
    <div class="bg-yellow-900/50 border border-yellow-700 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-semibold text-yellow-200 mb-2">Payment Required</h3>
      <p class="text-xs text-yellow-300 mb-3">
        Scan or copy this Lightning invoice to complete your subscription:
      </p>
      <div class="bg-gray-800 rounded p-3 text-xs font-mono text-gray-300 break-all">
        {$paymentInvoice}
      </div>
    </div>
  {/if}

  {#if subscribeResult?.subscribed}
    <div class="bg-green-900/50 border border-green-700 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-semibold text-green-200 mb-1">Subscribed!</h3>
      <p class="text-xs text-green-300">
        You're now on the <strong>{subscribeResult.planId}</strong> plan ({subscribeResult.period}).
        Expires: {subscribeResult.expiresAtISO}
      </p>
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#each planEntries as [planId, plan]}
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 flex flex-col">
        <h2 class="text-xl font-bold mb-1">{plan.name}</h2>
        <p class="text-sm text-gray-400 mb-4">{plan.description}</p>

        <div class="text-sm text-gray-300 space-y-2 mb-6 flex-1">
          <div class="flex justify-between">
            <span class="text-gray-500">Max images</span>
            <span>{plan.maxImages != null ? plan.maxImages.toLocaleString() : "Unlimited"}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Generations/month</span>
            <span>{plan.generationsPerMonth != null ? plan.generationsPerMonth : "Unlimited"}</span>
          </div>
        </div>

        {#if plan.pricing}
          <div class="space-y-2">
            {#if plan.pricing.monthly}
              <button
                on:click={() => handleSubscribe(planId, "monthly")}
                disabled={!$session || subscribing}
                class="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                {subscribing ? "Processing..." : `${formatSats(plan.pricing.monthly.costSats)} sats/month`}
              </button>
            {/if}
            {#if plan.pricing.yearly}
              <button
                on:click={() => handleSubscribe(planId, "yearly")}
                disabled={!$session || subscribing}
                class="w-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-700 disabled:text-gray-400 text-gray-200 border border-gray-700 rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                {subscribing ? "Processing..." : `${formatSats(plan.pricing.yearly.costSats)} sats/year`}
              </button>
            {/if}
          </div>
        {:else}
          <div class="text-center text-sm text-gray-500 py-2">
            Free
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if !$session}
    <div class="mt-8">
      <p class="text-gray-400 mb-4 text-sm">Log in to subscribe to a plan.</p>
      <LoginDialog />
    </div>
  {/if}
</div>
