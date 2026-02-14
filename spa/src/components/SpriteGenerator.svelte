<script lang="ts">
  import { session, loading, error, spryteResult, paymentInvoice } from "../lib/stores";
  import { generateSpryte } from "../lib/cvm-client";
  import SpriteDisplay from "./SpriteDisplay.svelte";

  let targetPubkey = "";
  let cellSize = 128;

  function handleGenerate() {
    const pubkey = targetPubkey || $session?.pubkey;
    if (!pubkey) return;
    generateSpryte(pubkey, cellSize);
  }

  $: if ($session && !targetPubkey) {
    targetPubkey = $session.pubkey;
  }
</script>

<div class="space-y-6">
  <div class="bg-gray-900 border border-gray-800 rounded-lg p-6">
    <h2 class="text-lg font-semibold mb-4">Generate Sprite Sheet</h2>

    <div class="space-y-4">
      <div>
        <label for="target-pubkey" class="block text-sm text-gray-400 mb-1">
          Target Pubkey (hex)
        </label>
        <input
          id="target-pubkey"
          type="text"
          bind:value={targetPubkey}
          placeholder="Defaults to your pubkey"
          class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 font-mono focus:outline-none focus:border-purple-500"
        />
      </div>

      <div>
        <label for="cell-size" class="block text-sm text-gray-400 mb-1">
          Cell Size (px)
        </label>
        <select
          id="cell-size"
          bind:value={cellSize}
          class="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
        >
          <option value={64}>64px</option>
          <option value={128}>128px (default, free tier)</option>
          <option value={256}>256px</option>
          <option value={512}>512px</option>
        </select>
      </div>

      <button
        on:click={handleGenerate}
        disabled={$loading}
        class="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded px-6 py-2 text-sm font-medium transition-colors"
      >
        {$loading ? "Generating..." : "Generate Sprite Sheet"}
      </button>
    </div>
  </div>

  {#if $error}
    <div class="bg-red-900/50 border border-red-700 text-red-200 rounded-lg p-4 text-sm">
      {$error}
    </div>
  {/if}

  {#if $paymentInvoice}
    <div class="bg-yellow-900/50 border border-yellow-700 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-yellow-200 mb-2">Payment Required</h3>
      <p class="text-xs text-yellow-300 mb-3">
        Scan or copy this Lightning invoice to proceed:
      </p>
      <div class="bg-gray-800 rounded p-3 text-xs font-mono text-gray-300 break-all">
        {$paymentInvoice}
      </div>
    </div>
  {/if}

  {#if $spryteResult}
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h3 class="text-lg font-semibold mb-2">Result</h3>
      <div class="text-sm text-gray-400 mb-4 space-y-1">
        <p>{$spryteResult.pubkeyCount} profile images at {$spryteResult.cellSize}px</p>
        <p>
          <a
            href={$spryteResult.spriteUrl}
            target="_blank"
            rel="noopener"
            class="text-purple-400 hover:text-purple-300 underline"
          >
            Sprite PNG
          </a>
          &middot;
          <a
            href={$spryteResult.mappingUrl}
            target="_blank"
            rel="noopener"
            class="text-purple-400 hover:text-purple-300 underline"
          >
            Mapping JSON
          </a>
        </p>
      </div>
      <SpriteDisplay
        spriteUrl={$spryteResult.spriteUrl}
        mappingUrl={$spryteResult.mappingUrl}
      />
    </div>
  {/if}
</div>
