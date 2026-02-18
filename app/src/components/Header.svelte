<script lang="ts">
  import { session } from "../lib/stores";
  import { logout } from "../lib/nostr-auth";
  import { link, location } from "svelte-spa-router";

  function truncatePubkey(pk: string): string {
    return pk.slice(0, 8) + "..." + pk.slice(-8);
  }

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/plans", label: "Plans" },
    { href: "/docs/", label: "Docs", external: true },
  ];

  function isActive(path: string, loc: string): boolean {
    if (path === "/") return loc === "/" || loc === "/generate";
    return loc.startsWith(path);
  }
</script>

<header class="relative z-50 pt-6 pb-2">
  <div class="max-w-6xl mx-auto px-6 flex items-center justify-between">
    <a href="/" use:link class="font-mono font-semibold text-base text-surface-200 hover:text-white transition-colors">
      spryt.es
    </a>

    <div class="flex items-center gap-1">
      <nav class="flex items-center gap-1 text-sm">
        {#each navItems as item}
          {#if item.external}
            <a
              href={item.href}
              class="px-3 py-1.5 rounded-md transition-colors text-surface-500 hover:text-surface-200"
            >
              {item.label}
            </a>
          {:else}
            <a
              href={item.href}
              use:link
              class="px-3 py-1.5 rounded-md transition-colors
                {isActive(item.href, $location)
                  ? 'bg-white/5 text-white'
                  : 'text-surface-500 hover:text-surface-200'}"
            >
              {item.label}
            </a>
          {/if}
        {/each}
      </nav>

      {#if $session}
        <div class="flex items-center gap-3 ml-4">
          <span class="font-mono text-xs text-surface-600">
            {truncatePubkey($session.pubkey)}
          </span>
          <button
            onclick={logout}
            class="text-surface-500 hover:text-red-400 text-xs transition-colors"
          >
            Logout
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>
