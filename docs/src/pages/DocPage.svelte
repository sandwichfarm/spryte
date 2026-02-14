<script lang="ts">
  import { contentMap } from "../lib/navigation";
  import DocRenderer from "../components/DocRenderer.svelte";

  export let params: { slug?: string } = {};

  $: slug = params.slug || "overview";
  $: content = contentMap[slug] || "";
</script>

{#if content}
  <DocRenderer {content} />
{:else}
  <div class="text-center py-16">
    <h1 class="text-2xl font-bold text-gray-300 mb-2">Page Not Found</h1>
    <p class="text-gray-500">The documentation page "{slug}" doesn't exist.</p>
  </div>
{/if}
