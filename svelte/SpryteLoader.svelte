<!-- src/components/ImageLoader.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { ImageFetcher } from '../fetcher/index.js';
  
    /**
     * Props:
     * - imageUrl: the URL to fetch. (Optional if using mapping.)
     * - mapping: an object mapping keys to image URLs. (Optional)
     * - mappingKey: the key to use from the mapping. (Optional)
     * - timeout: fetch timeout in milliseconds.
     * - defaultImage: a default image URL to use if fetching fails.
     */
    export let imageUrl: string = '';
    export let mapping: { [key: string]: string } | null = null;
    export let mappingKey: string | null = null;
    export let timeout: number = 5000;
    export let defaultImage: string = 'https://via.placeholder.com/150';
  
    let loadedImageUrl: string = '';
    let loading: boolean = true;
  
    onMount(async () => {
      const fetcher = new ImageFetcher({ defaultImageUrl: defaultImage, timeout });
      if (mapping && mappingKey) {
        loadedImageUrl = await fetcher.fetchImageFromMapping(mapping, mappingKey);
      } else if (imageUrl) {
        loadedImageUrl = await fetcher.fetchImage(imageUrl);
      } else {
        // If no imageUrl is provided, simply use the default image.
        loadedImageUrl = defaultImage;
      }
      loading = false;
    });
  </script>
  
  <style>
    /* Shimmer effect for the placeholder */
    .shimmer {
      animation: shimmer 2s infinite;
      background: linear-gradient(to right, #eeeeee 8%, #dddddd 18%, #eeeeee 33%);
      background-size: 800px 104px;
      width: 100%;
      height: 100%;
      position: relative;
    }
  
    @keyframes shimmer {
      0% {
        background-position: -800px 0;
      }
      100% {
        background-position: 800px 0;
      }
    }
  
    .image-container {
      position: relative;
      width: 100%;
      /* Adjust the height as needed or make it responsive */
      height: auto;
    }
    .image-container img {
      width: 100%;
      height: auto;
      display: block;
    }
  </style>
  
  <div class="image-container">
    {#if loading}
      <!-- The shimmer placeholder -->
      <div class="shimmer" style="height: 200px;"></div>
    {:else}
      <!-- Once loaded (or if a default is returned), show the image -->
      <img src="{loadedImageUrl}" alt="Loaded image" />
    {/if}
  </div>
  