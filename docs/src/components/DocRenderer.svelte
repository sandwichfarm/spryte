<script lang="ts">
  import { renderMarkdown } from "../lib/markdown";

  export let content: string = "";

  $: html = renderMarkdown(content);
</script>

<article
  class="prose prose-invert prose-sm max-w-none
    prose-headings:text-purple-300
    prose-h3:text-gray-300
    prose-a:text-purple-400 hover:prose-a:text-purple-300
    prose-code:text-gray-300 prose-code:bg-gray-800 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5
    prose-pre:bg-gray-800 prose-pre:rounded prose-pre:p-4 prose-pre:text-xs
    prose-strong:text-gray-200
    prose-p:text-gray-400
    prose-li:text-gray-400"
>
  {@html html}
</article>
