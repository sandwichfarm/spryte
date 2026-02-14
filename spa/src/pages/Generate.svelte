<script lang="ts">
  import { session } from "../lib/stores";
  import { push } from "svelte-spa-router";
  import SpriteGenerator from "../components/SpriteGenerator.svelte";
  import LoginDialog from "../components/LoginDialog.svelte";

  $: if (!$session) {
    // Redirect to home if not logged in
  }
</script>

<div class="max-w-3xl mx-auto py-8 px-4">
  <h1 class="text-2xl font-bold mb-6">Generate Sprite Sheet</h1>

  {#if !$session}
    <p class="text-gray-400 mb-6">Please log in to generate a sprite sheet.</p>
    <LoginDialog />
  {:else}
    <SpriteGenerator />
  {/if}
</div>
