<script lang="ts">
  import { session, loading, error, spryteResult, paymentInvoice, generationProgress } from "../lib/stores";
  import { generateSpryte } from "../lib/cvm-client";
  import SpriteDisplay from "./SpriteDisplay.svelte";
  import RepublishPanel from "./RepublishPanel.svelte";
  import IntegratePanel from "./IntegratePanel.svelte";

  let targetPubkey = "";
  let cellSize = 128;
  let requestInvoice = false;
  let activeResultTab: "preview" | "republish" | "integrate" = "preview";

  const STAGE_ORDER = ["queued", "collecting", "processing", "uploading", "complete"] as const;

  const DISPLAY_STAGES = [
    { key: "queued", label: "Queued" },
    { key: "collecting", label: "Collecting" },
    { key: "processing", label: "Processing" },
    { key: "uploading", label: "Uploading" },
    { key: "complete", label: "Complete" },
  ] as const;

  function mapToDisplayStage(stage: string): string {
    if (stage === "queued") return "queued";
    if (stage === "collecting" || stage === "collected" || stage === "cache_check") return "collecting";
    if (stage === "processing") return "processing";
    if (stage === "uploading" || stage === "upload_complete") return "uploading";
    if (stage === "complete") return "complete";
    return "queued";
  }

  function isStageReached(displayStage: string, currentStage: string): boolean {
    const mapped = mapToDisplayStage(currentStage);
    const displayIdx = STAGE_ORDER.indexOf(displayStage as any);
    const currentIdx = STAGE_ORDER.indexOf(mapped as any);
    return currentIdx >= displayIdx;
  }

  function isStageActive(displayStage: string, currentStage: string): boolean {
    return mapToDisplayStage(currentStage) === displayStage;
  }

  function handleGenerate() {
    const pubkey = targetPubkey || $session?.pubkey;
    if (!pubkey) return;
    activeResultTab = "preview";
    generateSpryte(pubkey, cellSize, undefined, requestInvoice || undefined);
  }

  $: if ($session && !targetPubkey) {
    targetPubkey = $session.pubkey;
  }

  $: currentStage = $generationProgress?.stage ?? "queued";
</script>

<div class="space-y-6 text-left">
  <!-- Form -->
  <div class="bg-surface-900 border border-surface-800/60 rounded-lg p-6">
    <h2 class="text-lg font-semibold mb-4">Generate Sprite Sheet</h2>

    <div class="space-y-4">
      <div>
        <label for="target-pubkey" class="block text-sm text-surface-400 mb-1">
          Target Pubkey (hex)
        </label>
        <input
          id="target-pubkey"
          type="text"
          bind:value={targetPubkey}
          placeholder="Defaults to your pubkey"
          class="w-full bg-surface-950 border border-surface-700/50 rounded-md px-4 py-2.5 text-sm text-surface-200 placeholder-surface-600 font-mono focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
        />
      </div>

      <div>
        <label for="cell-size" class="block text-sm text-surface-400 mb-1">
          Cell Size (px)
        </label>
        <select
          id="cell-size"
          bind:value={cellSize}
          class="bg-surface-950 border border-surface-700/50 rounded-md px-4 py-2.5 text-sm text-surface-200 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
        >
          <option value={64}>64px</option>
          <option value={128}>128px (default, free tier)</option>
          <option value={256}>256px</option>
          <option value={512}>512px</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <input
          id="request-invoice"
          type="checkbox"
          bind:checked={requestInvoice}
          class="rounded border-surface-700 bg-surface-800 text-brand-500 focus:ring-brand-500"
        />
        <label for="request-invoice" class="text-sm text-surface-400">
          Pay to bypass limits (one-time upgrade)
        </label>
      </div>

      <button
        onclick={handleGenerate}
        disabled={$loading}
        class="bg-brand-500 hover:bg-brand-400 active:bg-brand-600 disabled:bg-surface-800 disabled:text-surface-500 text-white rounded-md px-6 py-2.5 text-sm font-medium transition-colors"
      >
        {$loading ? "Generating..." : "Generate Sprite Sheet"}
      </button>

      <!-- Progress -->
      {#if $loading && $generationProgress}
        <div class="mt-4 space-y-4">
          <!-- Stage indicators -->
          <div class="flex items-center justify-between">
            {#each DISPLAY_STAGES as stage, i}
              <div class="flex items-center">
                <div class="flex flex-col items-center">
                  <div
                    class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500
                      {isStageReached(stage.key, currentStage)
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-800 text-surface-500 border border-surface-700'}
                      {isStageActive(stage.key, currentStage) ? 'ring-2 ring-brand-400/50 animate-pulse' : ''}"
                  >
                    {i + 1}
                  </div>
                  <span class="text-[10px] mt-1 {isStageReached(stage.key, currentStage) ? 'text-surface-300' : 'text-surface-600'}">
                    {stage.label}
                  </span>
                </div>
                {#if i < DISPLAY_STAGES.length - 1}
                  <div
                    class="w-8 sm:w-12 h-0.5 mx-1 transition-all duration-500 {isStageReached(DISPLAY_STAGES[i + 1].key, currentStage) ? 'bg-brand-500' : 'bg-surface-800'}"
                  ></div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Progress bar -->
          <div class="w-full bg-surface-800 rounded-full h-1.5 overflow-hidden">
            <div
              class="bg-brand-500 h-1.5 rounded-full transition-all duration-500 ease-out"
              style="width: {$generationProgress.progress}%"
            ></div>
          </div>
          <p class="text-xs text-surface-400 text-center">{$generationProgress.message}</p>
        </div>
      {:else if $loading}
        <p class="mt-3 text-xs text-surface-500">Waiting for server...</p>
      {/if}
    </div>
  </div>

  <!-- Error -->
  {#if $error}
    <div class="bg-red-950/40 border border-red-800/40 text-red-300 rounded-lg p-4 text-sm">
      {$error}
    </div>
  {/if}

  <!-- Payment -->
  {#if $paymentInvoice}
    <div class="bg-amber-950/40 border border-amber-800/40 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-amber-300 mb-2">Payment Required</h3>
      <p class="text-xs text-amber-300/80 mb-3">
        Scan or copy this Lightning invoice to proceed:
      </p>
      <div class="bg-surface-950 rounded-lg p-3 text-xs font-mono text-surface-300 break-all">
        {$paymentInvoice}
      </div>
    </div>
  {/if}

  <!-- Result -->
  {#if $spryteResult}
    {#if $spryteResult.cached}
      <div class="bg-blue-950/40 border border-blue-800/40 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-blue-300 mb-1">Cached Result</h3>
        <p class="text-xs text-blue-300/80">
          You've reached your generation limit. Showing your previous result.
          {#if $spryteResult.limitReasons?.length}
            <span class="text-blue-400">({$spryteResult.limitReasons.join(", ")})</span>
          {/if}
        </p>
      </div>
    {/if}

    {#if $spryteResult.limitReasons?.includes("image_limit") && !$spryteResult.cached}
      <div class="bg-amber-950/40 border border-amber-800/40 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-amber-300 mb-1">Image Limit Applied</h3>
        <p class="text-xs text-amber-300/80">
          Your sprite contains {$spryteResult.pubkeyCount} of {$spryteResult.totalFollowers ?? "?"} total followers.
          Upgrade your plan for higher limits.
        </p>
      </div>
    {/if}

    <div class="bg-surface-900 border border-surface-800/60 rounded-lg p-6">
      <!-- Result header -->
      <div class="mb-4">
        <h3 class="text-lg font-semibold">Your Sprite Sheet</h3>
        <p class="text-sm text-surface-400">
          {$spryteResult.pubkeyCount} avatars at {$spryteResult.cellSize}px
        </p>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-1 mb-4">
        <button
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {activeResultTab === 'preview'
            ? 'bg-white/[0.08] text-white'
            : 'text-surface-500 hover:text-surface-200'}"
          onclick={() => (activeResultTab = "preview")}
        >
          Preview
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {activeResultTab === 'republish'
            ? 'bg-white/[0.08] text-white'
            : 'text-surface-500 hover:text-surface-200'}"
          onclick={() => (activeResultTab = "republish")}
        >
          Republish
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {activeResultTab === 'integrate'
            ? 'bg-white/[0.08] text-white'
            : 'text-surface-500 hover:text-surface-200'}"
          onclick={() => (activeResultTab = "integrate")}
        >
          Integrate
        </button>
      </div>

      <!-- Tab content -->
      {#if activeResultTab === "preview"}
        <div class="space-y-3">
          <div class="text-sm text-surface-400 space-x-2">
            <a
              href={$spryteResult.spriteUrl}
              target="_blank"
              rel="noopener"
              class="text-brand-400 hover:text-brand-300 underline"
            >
              Sprite PNG
            </a>
            <span>&middot;</span>
            <a
              href={$spryteResult.mappingUrl}
              target="_blank"
              rel="noopener"
              class="text-brand-400 hover:text-brand-300 underline"
            >
              Mapping JSON
            </a>
          </div>
          <SpriteDisplay
            spriteUrl={$spryteResult.spriteUrl}
            mappingUrl={$spryteResult.mappingUrl}
          />
        </div>
      {:else if activeResultTab === "republish"}
        <RepublishPanel />
      {:else if activeResultTab === "integrate"}
        <IntegratePanel />
      {/if}
    </div>
  {/if}
</div>
