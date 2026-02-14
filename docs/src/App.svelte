<script lang="ts">
  import Router, { location } from "svelte-spa-router";
  import Layout from "./components/Layout.svelte";
  import DocPage from "./pages/DocPage.svelte";

  const routes = {
    "/": DocPage,
    "/:slug": DocPage,
  };

  // Derive active page from location
  $: activePage = $location === "/" ? "overview" : $location.slice(1);
</script>

<Layout {activePage}>
  <Router {routes} />
</Layout>
