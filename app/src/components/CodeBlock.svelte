<script lang="ts">
  export let title: string = "";
  export let code: string = "";

  let copied = false;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {}
  }
</script>

<div class="bg-surface-950 rounded-lg overflow-hidden">
  {#if title}
    <div class="flex items-center justify-between px-5 py-2.5 border-b border-surface-800/60">
      <span class="font-mono text-xs text-surface-500">{title}</span>
      <button
        onclick={copyCode}
        class="font-mono text-xs text-surface-500 hover:text-surface-300 transition-colors"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  {/if}
  <pre class="p-5 text-sm text-surface-300 font-mono overflow-x-auto leading-relaxed">{code}</pre>
</div>
