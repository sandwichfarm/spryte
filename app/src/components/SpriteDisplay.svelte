<script lang="ts">
  export let spriteUrl: string;
  export let mappingUrl: string;

  interface MappingData {
    cellDimensions: { width: number; height: number };
    mapping: Record<string, { x: number; y: number; source: string }>;
  }

  let mappingData: MappingData | null = null;
  let spriteLoaded = false;
  let spriteImage: HTMLImageElement;
  let loadError = "";

  async function loadMapping() {
    try {
      const res = await fetch(mappingUrl);
      mappingData = await res.json();
    } catch (e) {
      loadError = "Failed to load mapping data";
    }
  }

  function onSpriteLoad() {
    spriteLoaded = true;
  }

  function getSpriteStyle(entry: { x: number; y: number }): string {
    if (!mappingData || !spriteImage) return "";
    const { width, height } = mappingData.cellDimensions;
    const avatarSize = 48;
    const scale = avatarSize / width;
    return `
      background-image: url('${spriteUrl}');
      background-position: ${-entry.x * scale}px ${-entry.y * scale}px;
      background-size: ${spriteImage.naturalWidth * scale}px ${spriteImage.naturalHeight * scale}px;
      background-repeat: no-repeat;
      width: ${avatarSize}px;
      height: ${avatarSize}px;
    `;
  }

  function getDelay(index: number): string {
    return `animation: fadeIn 0.3s ease-out ${Math.min(index * 10, 800)}ms both;`;
  }

  $: if (mappingUrl) loadMapping();
</script>

<!-- Hidden image to preload sprite and get dimensions -->
<img
  bind:this={spriteImage}
  src={spriteUrl}
  alt=""
  class="hidden"
  onload={onSpriteLoad}
/>

{#if loadError}
  <p class="text-red-400 text-sm">{loadError}</p>
{:else if !mappingData}
  <p class="text-surface-500 text-sm">Loading sprite data...</p>
{:else if !spriteLoaded}
  <p class="text-surface-500 text-sm">Loading sprite image...</p>
{:else}
  <div class="grid gap-1" style="grid-template-columns: repeat(auto-fill, 48px)">
    {#each Object.entries(mappingData.mapping) as [pubkey, entry], i}
      <div
        class="rounded-full overflow-hidden ring-1 ring-white/5 hover:ring-brand-400/40 hover:scale-110 transition-all duration-200 cursor-default"
        style="{getSpriteStyle(entry)} {getDelay(i)}"
        title={pubkey.slice(0, 16) + "..."}
      ></div>
    {/each}
  </div>
{/if}
