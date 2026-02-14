<script lang="ts">
  import { session } from "../lib/stores";
  import { logout } from "../lib/nostr-auth";
  import { link } from "svelte-spa-router";

  function truncatePubkey(pk: string): string {
    return pk.slice(0, 8) + "..." + pk.slice(-8);
  }
</script>

<header class="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
  <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href="/" use:link class="text-xl font-bold text-purple-400 hover:text-purple-300">
      Spryte
    </a>

    <nav class="flex items-center gap-6 text-sm">
      <a href="/" use:link class="text-gray-400 hover:text-gray-200">Home</a>
      <a href="/generate" use:link class="text-gray-400 hover:text-gray-200">Generate</a>
      <a href="/docs/" class="text-gray-400 hover:text-gray-200">Docs</a>

      {#if $session}
        <span class="text-gray-500 font-mono text-xs">
          {truncatePubkey($session.pubkey)}
        </span>
        <button
          on:click={logout}
          class="text-gray-400 hover:text-red-400 text-xs"
        >
          Logout
        </button>
      {/if}
    </nav>
  </div>
</header>
