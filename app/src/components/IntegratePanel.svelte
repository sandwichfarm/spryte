<script lang="ts">
  import { spryteResult } from "../lib/stores";
  import { CVM_PUBKEY, CVM_RELAYS } from "../lib/constants";
  import CodeBlock from "./CodeBlock.svelte";

  $: installCode = "npm install @spryte/client";

  $: generateCode = `import { Spryte } from "@spryte/client";

const spryte = new Spryte({
  cvmPubkey: "${CVM_PUBKEY}",
  relays: ${JSON.stringify(CVM_RELAYS)},
  signer: yourNostrSigner,
});

await spryte.connect();

const result = await spryte.generate({
  pubkey: "${$spryteResult?.mappingUrl ? "targetPubkey" : "targetPubkey"}",
  cellSize: ${$spryteResult?.cellSize ?? 128},
});

// Apply avatar as CSS background
const style = spryte.getAvatarStyle(result, pubkey);
element.style.cssText = style;`;

  $: loadCode = $spryteResult
    ? `import { loadSpriteSheet, getAvatarStyle, avatarStyleToString } from "@spryte/client";

const sheet = await loadSpriteSheet(
  "${$spryteResult.spriteUrl}",
  "${$spryteResult.mappingUrl}"
);

// Get CSS style for a specific pubkey
const style = getAvatarStyle(sheet, pubkey);
element.style.cssText = avatarStyleToString(style);`
    : "";
</script>

<div class="space-y-4">
  <CodeBlock title="Install" code={installCode} />
  <CodeBlock title="Generate and render" code={generateCode} />
  {#if $spryteResult}
    <CodeBlock title="Load existing sprite (no CVM)" code={loadCode} />
  {/if}
</div>
