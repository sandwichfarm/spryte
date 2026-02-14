<script lang="ts">
  import { link } from "svelte-spa-router";
  import { session } from "../lib/stores";
  import LoginDialog from "../components/LoginDialog.svelte";
</script>

<div class="max-w-3xl mx-auto py-12 px-4">
  <div class="text-center mb-12">
    <h1 class="text-4xl font-bold text-purple-400 mb-4">Spryte</h1>
    <p class="text-lg text-gray-400 max-w-xl mx-auto">
      Generate sprite sheets of Nostr follower profile images.
      One image, hundreds of avatars — faster load times for your Nostr client.
    </p>
  </div>

  <div class="grid md:grid-cols-3 gap-6 mb-12">
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <h3 class="font-semibold text-purple-300 mb-2">Collect</h3>
      <p class="text-sm text-gray-400">
        Fetches profile images for all followers of a given pubkey from Nostr relays.
      </p>
    </div>
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <h3 class="font-semibold text-purple-300 mb-2">Process</h3>
      <p class="text-sm text-gray-400">
        Resizes, crops, and composites images into a single optimized sprite sheet PNG.
      </p>
    </div>
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <h3 class="font-semibold text-purple-300 mb-2">Serve</h3>
      <p class="text-sm text-gray-400">
        Uploads to Blossom for content-addressed hosting. One HTTP request loads all avatars.
      </p>
    </div>
  </div>

  {#if !$session}
    <LoginDialog />
  {:else}
    <div class="text-center">
      <a
        href="/generate"
        use:link
        class="inline-block bg-purple-600 hover:bg-purple-500 text-white rounded px-8 py-3 font-medium transition-colors"
      >
        Generate Your Sprite Sheet
      </a>
    </div>
  {/if}
</div>
