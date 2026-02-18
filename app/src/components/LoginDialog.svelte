<script lang="ts">
  import {
    loginWithExtension,
    loginWithBunker,
    createNostrConnectLogin,
  } from "../lib/nostr-auth";
  import QRCode from "qrcode";

  let activeTab: "extension" | "remote" = "extension";
  let bunkerUri = "";
  let loginError = "";
  let connecting = false;

  // NostrConnect QR state
  let nostrConnectUri = "";
  let qrDataUrl = "";
  let waitingForSigner = false;

  // Advanced relay config
  let showAdvanced = false;
  let customRelays = "";

  async function handleExtension() {
    loginError = "";
    connecting = true;
    try {
      await loginWithExtension();
    } catch (e: any) {
      loginError = e?.message ?? "Extension login failed";
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
    } catch (e: any) {
      loginError = e?.message ?? "Bunker login failed";
    } finally {
      connecting = false;
    }
  }

  function parseCustomRelays(): string[] {
    if (!customRelays.trim()) return [];
    return customRelays
      .split(/[,\n]/)
      .map((r) => r.trim())
      .filter((r) => r.startsWith("ws://") || r.startsWith("wss://"));
  }

  async function generateQR() {
    loginError = "";
    nostrConnectUri = "";
    qrDataUrl = "";
    waitingForSigner = true;
    try {
      const relays = parseCustomRelays();
      const { uri, waitForConnection } = await createNostrConnectLogin(
        relays.length > 0 ? relays : undefined,
      );
      nostrConnectUri = uri;
      qrDataUrl = await QRCode.toDataURL(uri, {
        width: 240,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      // Wait for remote signer in background
      waitForConnection().catch((e: any) => {
        loginError = e?.message ?? "Connection failed";
        waitingForSigner = false;
      });
    } catch (e: any) {
      loginError = e?.message ?? "Failed to generate QR";
      waitingForSigner = false;
    }
  }

  function switchTab(tab: "extension" | "remote") {
    activeTab = tab;
    loginError = "";
    if (tab === "remote" && !nostrConnectUri) {
      generateQR();
    }
  }
</script>

<div class="bg-surface-900 border border-surface-700/40 rounded-lg shadow-2xl shadow-black/40 p-8 max-w-md mx-auto">
  <h2 class="text-lg font-semibold mb-4">Login with Nostr</h2>

  {#if loginError}
    <div class="bg-red-950/40 border border-red-800/40 text-red-300 rounded-lg p-3 mb-4 text-sm">
      {loginError}
    </div>
  {/if}

  <!-- Tabs -->
  <div class="flex gap-1 mb-4">
    <button
      class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {activeTab === 'extension'
        ? 'bg-white/[0.08] text-white'
        : 'text-surface-500 hover:text-surface-200'}"
      onclick={() => switchTab("extension")}
    >
      Extension
    </button>
    <button
      class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {activeTab === 'remote'
        ? 'bg-white/[0.08] text-white'
        : 'text-surface-500 hover:text-surface-200'}"
      onclick={() => switchTab("remote")}
    >
      Remote Signer
    </button>
  </div>

  <!-- Extension Tab -->
  {#if activeTab === "extension"}
    <div class="space-y-3">
      <p class="text-sm text-surface-400">
        Connect using a NIP-07 browser extension like nos2x or Alby.
      </p>
      <button
        onclick={handleExtension}
        disabled={connecting}
        class="w-full bg-brand-500 hover:bg-brand-400 active:bg-brand-600 disabled:bg-surface-800 disabled:text-surface-500 text-white rounded-md px-5 py-2.5 text-sm font-medium transition-colors"
      >
        {connecting ? "Connecting..." : "Login with Extension"}
      </button>
    </div>
  {/if}

  <!-- Remote Signer Tab -->
  {#if activeTab === "remote"}
    <div class="space-y-4">
      <!-- QR Code -->
      {#if qrDataUrl}
        <div class="flex flex-col items-center">
          <p class="text-sm text-surface-400 mb-2">
            Scan with your signer app
          </p>
          <img
            src={qrDataUrl}
            alt="NostrConnect QR Code"
            class="rounded-lg"
            width="240"
            height="240"
          />
          {#if waitingForSigner}
            <p class="text-xs text-surface-500 mt-2 animate-pulse">
              Waiting for signer...
            </p>
          {/if}
        </div>
      {:else}
        <div class="flex justify-center py-8">
          <div
            class="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      {/if}

      <div class="border-t border-surface-700 pt-4">
        <label for="bunker-uri" class="block text-sm text-surface-400 mb-1">
          Or paste a bunker URI
        </label>
        <div class="flex gap-2">
          <input
            id="bunker-uri"
            type="text"
            bind:value={bunkerUri}
            placeholder="bunker://..."
            class="flex-1 bg-surface-950 border border-surface-700/50 rounded-md px-4 py-2.5 text-sm text-surface-200 placeholder-surface-600 font-mono focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
          />
          <button
            onclick={handleBunker}
            disabled={connecting || !bunkerUri}
            class="bg-surface-800 hover:bg-surface-700 border border-surface-700/50 disabled:bg-surface-800 disabled:text-surface-500 text-surface-200 rounded-md px-4 py-2.5 text-sm transition-colors"
          >
            Connect
          </button>
        </div>
      </div>

      <!-- Advanced -->
      <div>
        <button
          class="text-xs text-surface-500 hover:text-surface-300 transition-colors"
          onclick={() => (showAdvanced = !showAdvanced)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced"}
        </button>
        {#if showAdvanced}
          <div class="mt-2">
            <label for="custom-relays" class="block text-xs text-surface-500 mb-1">
              Custom relays for QR code (one per line)
            </label>
            <textarea
              id="custom-relays"
              bind:value={customRelays}
              placeholder={"wss://relay.nsec.app\nwss://bucket.coracle.social"}
              rows="2"
              class="w-full bg-surface-950 border border-surface-700/50 rounded-md px-4 py-2.5 text-xs text-surface-200 placeholder-surface-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 font-mono"
            ></textarea>
            <button
              onclick={generateQR}
              class="mt-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Regenerate QR
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
