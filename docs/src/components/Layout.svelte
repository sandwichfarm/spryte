<script lang="ts">
  import Header from "./Header.svelte";
  import Footer from "./Footer.svelte";
  import Sidebar from "./Sidebar.svelte";
  import MobileNav from "./MobileNav.svelte";

  export let activePage: string = "overview";

  let mobileNavOpen = false;

  function toggleMobileNav() {
    mobileNavOpen = !mobileNavOpen;
  }

  function closeMobileNav() {
    mobileNavOpen = false;
  }
</script>

<div class="min-h-screen flex flex-col">
  <Header onToggleMobileNav={toggleMobileNav} />
  <MobileNav activePage={activePage} open={mobileNavOpen} onClose={closeMobileNav} />
  <div class="flex flex-1">
    <Sidebar activePage={activePage} />
    <main class="flex-1 min-w-0 px-4 py-8 lg:px-8">
      <div class="max-w-3xl mx-auto">
        <slot />
      </div>
    </main>
  </div>
  <Footer />
</div>
