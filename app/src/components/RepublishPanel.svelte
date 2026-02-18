<script lang="ts">
  import { session, spryteResult } from "../lib/stores";

  let serverUrl = "";
  let republishing = false;
  let republishError = "";
  let republishResult: { spriteUrl: string; mappingUrl: string } | null = null;

  async function sha256hex(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function createAuthHeader(fileHash: string): Promise<string> {
    const signer = $session?.signer;
    if (!signer) throw new Error("No signer available");

    const now = Math.floor(Date.now() / 1000);
    const event = {
      kind: 24242,
      created_at: now,
      tags: [
        ["t", "upload"],
        ["x", fileHash],
        ["expiration", String(now + 300)],
      ],
      content: "Upload via Spryte",
    };

    const signed = await signer.signEvent(event);
    return "Nostr " + btoa(JSON.stringify(signed));
  }

  async function uploadFile(
    url: string,
    data: Uint8Array,
    contentType: string,
    hash: string,
  ): Promise<string> {
    const auth = await createAuthHeader(hash);
    const res = await fetch(`${url}/upload`, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        Authorization: auth,
      },
      body: data,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    return json.url;
  }

  async function handleRepublish() {
    if (!$spryteResult || !serverUrl) return;

    republishing = true;
    republishError = "";
    republishResult = null;

    try {
      const baseUrl = serverUrl.replace(/\/+$/, "");

      const [spriteRes, mappingRes] = await Promise.all([
        fetch($spryteResult.spriteUrl),
        fetch($spryteResult.mappingUrl),
      ]);

      const [spriteData, mappingData] = await Promise.all([
        spriteRes.arrayBuffer().then((b) => new Uint8Array(b)),
        mappingRes.arrayBuffer().then((b) => new Uint8Array(b)),
      ]);

      const [spriteHash, mappingHash] = await Promise.all([
        sha256hex(spriteData),
        sha256hex(mappingData),
      ]);

      const [spriteUrl, mappingUrl] = await Promise.all([
        uploadFile(baseUrl, spriteData, "image/png", spriteHash),
        uploadFile(baseUrl, mappingData, "application/json", mappingHash),
      ]);

      republishResult = { spriteUrl, mappingUrl };
    } catch (e: any) {
      if (
        e?.message?.includes("sign") ||
        e?.message?.includes("denied") ||
        e?.message?.includes("rejected")
      ) {
        republishError =
          "Your signer rejected the kind 24242 authorization event. Some NIP-46 remote signers restrict which event kinds can be signed.";
      } else {
        republishError = e?.message ?? "Republish failed";
      }
    } finally {
      republishing = false;
    }
  }
</script>

<div class="space-y-4">
  <p class="text-sm text-surface-400">
    Upload your sprite sheet and mapping to a custom Blossom server.
  </p>

  <div class="flex gap-2">
    <input
      type="text"
      bind:value={serverUrl}
      placeholder="https://blossom.example.com"
      class="flex-1 bg-surface-950 border border-surface-700/50 rounded-md px-4 py-2.5 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
    />
    <button
      onclick={handleRepublish}
      disabled={republishing || !serverUrl || !$session}
      class="bg-brand-500 hover:bg-brand-400 active:bg-brand-600 disabled:bg-surface-800 disabled:text-surface-500 text-white rounded-md px-5 py-2.5 text-sm font-medium transition-colors"
    >
      {republishing ? "Uploading..." : "Republish"}
    </button>
  </div>

  {#if republishError}
    <div class="bg-red-950/40 border border-red-800/40 text-red-300 rounded-lg p-4 text-sm">
      {republishError}
    </div>
  {/if}

  {#if republishResult}
    <div class="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-4 space-y-2">
      <h4 class="text-sm font-semibold text-emerald-300">Republished successfully</h4>
      <div class="text-xs space-y-1">
        <p>
          <span class="text-surface-400">Sprite:</span>
          <a
            href={republishResult.spriteUrl}
            target="_blank"
            rel="noopener"
            class="text-emerald-300 hover:text-emerald-200 underline break-all"
          >
            {republishResult.spriteUrl}
          </a>
        </p>
        <p>
          <span class="text-surface-400">Mapping:</span>
          <a
            href={republishResult.mappingUrl}
            target="_blank"
            rel="noopener"
            class="text-emerald-300 hover:text-emerald-200 underline break-all"
          >
            {republishResult.mappingUrl}
          </a>
        </p>
      </div>
    </div>
  {/if}
</div>
