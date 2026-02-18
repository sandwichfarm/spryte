<script lang="ts">
  import { link } from "svelte-spa-router";
  import { session } from "../lib/stores";
  import LoginDialog from "../components/LoginDialog.svelte";
  import SpriteGenerator from "../components/SpriteGenerator.svelte";
  import CodeBlock from "../components/CodeBlock.svelte";

  const steps = [
    {
      num: "01",
      title: "Collect",
      desc: "Fetches profile images for all followers of a given pubkey from Nostr relays.",
    },
    {
      num: "02",
      title: "Process",
      desc: "Resizes, crops, and composites images into a single optimized sprite sheet PNG.",
    },
    {
      num: "03",
      title: "Serve",
      desc: "Uploads to Blossom for content-addressed hosting. One HTTP request loads all avatars.",
    },
  ];

  const previewCode = `import { Spryte } from "@spryte/client";

const spryte = new Spryte({ cvmPubkey, relays, signer });
await spryte.connect();

const result = await spryte.generate({ pubkey, cellSize: 128 });
const style = spryte.getAvatarStyle(result, followerPubkey);`;
</script>

<div class="max-w-3xl mx-auto pt-20 pb-28 px-6">
  <!-- Hero + Action -->
  <section class="text-center mb-24">
    <h1 class="text-hero font-extrabold tracking-tight text-white mb-6">
      Sprite sheets<br />for <span class="text-brand-400">Nostr</span>
    </h1>
    <p class="text-lg text-surface-400 max-w-md mx-auto mb-12 leading-relaxed">
      Generate a single optimized image containing every avatar in your social graph.
    </p>

    {#if !$session}
      <LoginDialog />
    {:else}
      <SpriteGenerator />
    {/if}
  </section>

  <!-- How It Works -->
  <section class="mb-20">
    <h2 class="text-section font-bold text-white text-center mb-16">How it works</h2>
    <div class="grid md:grid-cols-3 gap-12">
      {#each steps as step}
        <div>
          <span class="font-mono text-sm text-brand-400">{step.num}</span>
          <h3 class="font-semibold text-white mt-1 mb-2">{step.title}</h3>
          <p class="text-sm text-surface-400 leading-relaxed">{step.desc}</p>
        </div>
      {/each}
    </div>
  </section>

  <!-- Integration Preview -->
  <section class="mb-12">
    <h2 class="text-section font-bold text-white text-center mb-2">Use it in your app</h2>
    <p class="text-sm text-surface-400 text-center mb-6">Integrate sprite sheets with a few lines of code.</p>
    <div class="max-w-2xl mx-auto">
      <CodeBlock title="@spryte/client" code={previewCode} />
    </div>
    <div class="text-center mt-4">
      <a href="/docs/" class="text-sm text-brand-400 hover:text-brand-300 transition-colors">
        Read the full documentation &rarr;
      </a>
    </div>
  </section>
</div>
