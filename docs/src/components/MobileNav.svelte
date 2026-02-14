<script lang="ts">
  import { link } from "svelte-spa-router";
  import { sections } from "../lib/navigation";

  export let activePage: string = "overview";
  export let open: boolean = false;
  export let onClose: () => void = () => {};
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 z-40 lg:hidden" on:click={onClose}>
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/60"></div>

    <!-- Panel -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="absolute left-0 top-0 bottom-0 w-64 bg-gray-900 border-r border-gray-800 overflow-y-auto pt-4 pb-8"
      on:click|stopPropagation
    >
      <div class="px-4 mb-4 flex items-center justify-between">
        <span class="text-sm font-semibold text-purple-400">Navigation</span>
        <button on:click={onClose} class="text-gray-400 hover:text-gray-200" aria-label="Close navigation">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {#each sections as section}
        <div class="px-4 mb-4">
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {section.title}
          </h3>
          <ul class="space-y-1">
            {#each section.pages as page}
              <li>
                <a
                  href="/{page.slug}"
                  use:link
                  on:click={onClose}
                  class="block px-3 py-1.5 rounded text-sm transition-colors {activePage === page.slug
                    ? 'text-purple-400 bg-purple-400/10 font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'}"
                >
                  {page.title}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>
{/if}
