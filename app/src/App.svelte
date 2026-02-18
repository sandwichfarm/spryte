<script lang="ts">
  import Router from "svelte-spa-router";
  import Header from "./components/Header.svelte";
  import Footer from "./components/Footer.svelte";
  import AmbientBackground from "./components/AmbientBackground.svelte";
  import Home from "./pages/Home.svelte";
  import Docs from "./pages/Docs.svelte";
  import DevDocs from "./pages/DevDocs.svelte";
  import Plans from "./pages/Plans.svelte";

  const routes = {
    "/": Home,
    "/generate": Home,
    "/plans": Plans,
    "/docs": Docs,
    "/dev-docs": DevDocs,
  };
</script>

<AmbientBackground />
<div class="min-h-screen flex flex-col">
  <Header />
  <main class="flex-1">
    <Router {routes} />
  </main>
  <Footer />
</div>
