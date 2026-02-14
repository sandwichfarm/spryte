<script lang="ts">
  import { link } from "svelte-spa-router";
  import { sections } from "../lib/navigation";

  export let activePage: string = "overview";
</script>

<nav class="w-64 shrink-0 border-r border-gray-800 bg-gray-900/30 overflow-y-auto sticky top-0 h-screen pt-4 pb-8 hidden lg:block">
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
</nav>
