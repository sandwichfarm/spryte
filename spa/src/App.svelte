<script lang="ts">
  import Router from "svelte-spa-router";
  import Header from "./components/Header.svelte";
  import Footer from "./components/Footer.svelte";
  import Home from "./pages/Home.svelte";
  import Generate from "./pages/Generate.svelte";
  import Docs from "./pages/Docs.svelte";
  import DevDocs from "./pages/DevDocs.svelte";

  const routes = {
    "/": Home,
    "/generate": Generate,
    "/docs": Docs,
    "/dev-docs": DevDocs,
  };
</script>

<div class="min-h-screen flex flex-col">
  <Header />
  <main class="flex-1">
    <Router {routes} />
  </main>
  <Footer />
</div>
