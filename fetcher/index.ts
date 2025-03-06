export interface ImageFetcherOptions {
    /** URL to a default image that is used if fetching fails or times out */
    defaultImageUrl?: string;
    /** Fetch timeout in milliseconds (default is 5000ms) */
    timeout?: number;
  }
  
  /**
   * ImageFetcher is a simple class responsible for retrieving an image from a URL
   * (or from a JSON mapping) with a fetch timeout. In case of failure (or timeout),
   * it returns a default image URL.
   */
  export class ImageFetcher {
    private defaultImageUrl: string;
    private timeout: number;
  
    constructor(options?: ImageFetcherOptions) {
      // Provide a default image if none is supplied (this can be any placeholder image)
      this.defaultImageUrl = options?.defaultImageUrl || 'https://via.placeholder.com/150';
      this.timeout = options?.timeout ?? 5000; // default to 5000ms if not set
    }
  
    /**
     * Fetch an image from the provided URL.
     *
     * @param imageUrl - The HTTP URL of the image to fetch.
     * @returns A Promise that resolves with a blob URL for the image,
     *          or the default image URL if the fetch fails or times out.
     */
    async fetchImage(imageUrl: string): Promise<string> {
      // Create an AbortController to enforce the timeout.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
  
      try {
        const response = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
  
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
  
        // Convert the response to a Blob and create an object URL.
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } catch (error) {
        console.error('Error fetching image:', error);
        return this.defaultImageUrl;
      }
    }
  
    /**
     * Fetch an image using a JSON mapping and a key.
     *
     * @param mapping - An object where keys map to image URLs.
     * @param key - The key to look up in the mapping.
     * @returns A Promise that resolves with the fetched image (or default image URL).
     */
    async fetchImageFromMapping(mapping: { [key: string]: string }, key: string): Promise<string> {
      const imageUrl = mapping[key];
      if (!imageUrl) {
        console.warn(`No image URL found for key "${key}". Using default image.`);
        return this.defaultImageUrl;
      }
      return this.fetchImage(imageUrl);
    }
  }
  