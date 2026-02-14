<script lang="ts">
  import { link } from "svelte-spa-router";

  export let onToggleMobileNav: () => void = () => {};
</script>

<header class="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
  <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <button
        on:click={onToggleMobileNav}
        class="lg:hidden text-gray-400 hover:text-gray-200"
        aria-label="Toggle navigation"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <a href="/" use:link class="text-xl font-bold text-purple-400 hover:text-purple-300">
        Spryte Docs
      </a>
    </div>

    <nav class="flex items-center gap-6 text-sm">
      <a href="/" class="text-gray-400 hover:text-gray-200">Back to App</a>
    </nav>
  </div>
</header>
