<script lang="ts">
  import {
    loginWithExtension,
    loginWithBunker,
    createNostrConnectLogin,
  } from "../lib/nostr-auth";
  import { error } from "../lib/stores";

  let bunkerUri = "";
  let nostrConnectUri = "";
  let loginError = "";
  let connecting = false;

  async function handleExtension() {
    loginError = "";
    connecting = true;
    try {
      await loginWithExtension();
    } catch (e) {
      loginError = e instanceof Error ? e.message : "Extension login failed";
    } finally {
      connecting = false;
    }
  }

  async function handleBunker() {
    if (!bunkerUri.startsWith("bunker://")) {
      loginError = "Invalid bunker URI";
      return;
    }
    loginError = "";
    connecting = true;
    try {
      await loginWithBunker(bunkerUri);
    } catch (e) {
      loginError = e instanceof Error ? e.message : "Bunker login failed";
    } finally {
      connecting = false;
    }
  }

  async function handleNostrConnect() {
    loginError = "";
    connecting = true;
    try {
      const { uri, waitForConnection } = await createNostrConnectLogin();
      nostrConnectUri = uri;
      await waitForConnection();
    } catch (e) {
      loginError =
        e instanceof Error ? e.message : "NostrConnect login failed";
    } finally {
      connecting = false;
    }
  }
</script>

<div class="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md mx-auto">
  <h2 class="text-lg font-semibold mb-4">Login with Nostr</h2>

  {#if loginError}
    <div class="bg-red-900/50 border border-red-700 text-red-200 rounded p-3 mb-4 text-sm">
      {loginError}
    </div>
  {/if}

  <div class="space-y-4">
    <!-- NIP-07 Extension -->
    <div>
      <button
        on:click={handleExtension}
        disabled={connecting}
        class="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
      >
        {connecting ? "Connecting..." : "Login with Extension (NIP-07)"}
      </button>
    </div>

    <div class="text-center text-gray-500 text-xs">or</div>

    <!-- Bunker URI -->
    <div>
      <label for="bunker-uri" class="block text-sm text-gray-400 mb-1">
        Bunker URI
      </label>
      <div class="flex gap-2">
        <input
          id="bunker-uri"
          type="text"
          bind:value={bunkerUri}
          placeholder="bunker://..."
          class="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          on:click={handleBunker}
          disabled={connecting || !bunkerUri}
          class="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded px-4 py-2 text-sm transition-colors"
        >
          Connect
        </button>
      </div>
    </div>

    <div class="text-center text-gray-500 text-xs">or</div>

    <!-- NostrConnect QR -->
    <div>
      <button
        on:click={handleNostrConnect}
        disabled={connecting}
        class="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded px-4 py-2 text-sm transition-colors"
      >
        Generate NostrConnect QR
      </button>
      {#if nostrConnectUri}
        <div class="mt-3 p-3 bg-gray-800 rounded text-xs break-all text-gray-400 font-mono">
          {nostrConnectUri}
        </div>
        <p class="text-xs text-gray-500 mt-1">
          Scan or paste this URI in your Nostr signer app.
        </p>
      {/if}
    </div>
  </div>
</div>
