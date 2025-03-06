<script lang="ts">
  import type { SourceFiles, MappingJson } from "./types";
  import sourceFiles from "../output/source_files.json";
  import mappingJson from "../output/mapping.json";
  import { SPRITE_IMAGE_URL } from "./lib/constants";
  import { onMount } from 'svelte';

  // Configuration constants
  const CONFIG = {
    IMAGE_LOAD_TIMEOUT: 2000,    // Individual image load timeout
    SPRITE_LOAD_TIMEOUT: 3000,   // Sprite sheet load timeout
    FETCH_TIMEOUT: 6000,         // Increased timeout for fetch operations
    STATE_LOG_INTERVAL: 1000,    // How often to log state
    UI_UPDATE_INTERVAL: 100,     // How often to update UI timer
    FORCE_COMPLETION_TIMEOUT: 10000  // Force completion after 10 seconds
  } as const;

  // Convert the sourceFiles object into an array of [pubkey, string[]] pairs
  const pubkeyEntries: [string, string[]][] = Object.entries(sourceFiles as SourceFiles).map(([pubkey, urls]) => [
    pubkey,
    typeof urls === 'string' ? [urls] : urls
  ]);

  function getSpriteStyle(pubkey: string): string {
    const mapping = mappingJson.mapping[pubkey];
    if (!mapping) return '';
    
    const { x, y } = mapping;
    const { width, height } = mappingJson.cellDimensions;
    
    // Calculate how many cells are in the sprite sheet horizontally and vertically
    const totalWidth = Math.max(...Object.values(mappingJson.mapping).map(m => m.x)) + width;
    const totalHeight = Math.max(...Object.values(mappingJson.mapping).map(m => m.y)) + height;
    
    // Calculate scale factor based on UI avatar size (w-16 = 64px = 4rem) vs sprite cell dimensions
    const uiAvatarSize = 64; // w-16 in Tailwind is 4rem = 64px
    const scale = uiAvatarSize / width;
    
    return `
      background-image: url('${SPRITE_IMAGE_URL}');
      background-position: ${-x * scale}px ${-y * scale}px;
      background-size: ${totalWidth * scale}px ${totalHeight * scale}px;
      background-repeat: no-repeat;
    `;
  }

  // Track loading state for each column
  let sourceLoadedCount = 0;
  let spriteLoadedCount = 0;
  let sourceDataLoaded = 0;
  let spriteDataLoaded = 0;
  let sourceStartTime: number | null = null;
  let spriteStartTime: number | null = null;
  let sourceEndTime: number | null = null;
  let spriteEndTime: number | null = null;
  let sourceRaceEndTime: number | null = null; // Track race completion time (for winner determination)
  let spriteRaceEndTime: number | null = null; // Track race completion time (for winner determination)
  let winner: 'source' | 'sprite' | null = null;
  let spriteImageLoaded = false;
  let currentTime = Date.now();
  let sourceErrorCount = 0;
  let spriteErrorCount = 0;
  let spriteMappedProcessed = new Set<string>(); // Track which sprite-mapped images have been processed
  let spriteMappedElements = new Map<string, HTMLElement>(); // Track sprite-mapped elements by pubkey
  let spriteMappedCount = 0; // Track how many sprite-mapped images we've seen
  let isFullyLoaded = false; // Track whether all images are fully loaded
  let sourceStillLoading = true; // Track if source side is still loading images
  let spriteStillLoading = true; // Track if sprite side is still loading images
  let visibilityCheckTimer: number; // Timer for checking if images are visible
  let sourceVisibleCount = 0; // Track how many source images are actually visible
  let spriteVisibleCount = 0; // Track how many sprite images are actually visible
  let completionMode: 'none' | 'race' | 'force' | 'full' = 'none'; // Track what completion state we're in

  // BULLETPROOF FIX: Create a global network request monitor
  // This class will intercept ALL network requests to track data regardless of race status
  class NetworkResourceTracker {
    private originalFetch: typeof window.fetch;
    private sourceUrlPattern: RegExp;
    private spriteUrlPattern: RegExp;
    private pendingRequests: Map<string, { type: 'source' | 'sprite', timestamp: number }>;
    private active: boolean;
    
    constructor() {
      this.originalFetch = window.fetch;
      this.sourceUrlPattern = /\.(jpg|jpeg|png|gif|webp|svg|avif)/i;
      this.spriteUrlPattern = new RegExp(`${SPRITE_IMAGE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|\\.(jpg|jpeg|png|gif|webp|svg|avif)`, 'i');
      this.pendingRequests = new Map();
      this.active = false;
      
      console.log('[NetworkTracker] Initializing');
      this.monitorNetworkActivity();
    }
    
    monitorNetworkActivity() {
      // Override the global fetch method to track all requests
      window.fetch = (...args) => {
        // Safety check - if our tracker isn't in good state, use original fetch
        if (!this.active) {
          try {
            // Try to set active flag first
            this.active = true;
            
            // Safely extract URL from different possible argument types
            let url = '';
            if (typeof args[0] === 'string') {
              url = args[0];
            } else if (args[0] instanceof URL) {
              url = args[0].toString();
            } else if (args[0] instanceof Request) {
              url = args[0].url;
            } else {
              // Default fallback - call original fetch and return
              return this.originalFetch.apply(window, args);
            }
            
            const requestId = `${url}_${Date.now()}`;
            
            // Determine if this is a source or sprite request
            let type: 'source' | 'sprite' | null = null;
            if (url === SPRITE_IMAGE_URL) {
              type = 'sprite';
            } else if (this.sourceUrlPattern.test(url) && 
                      !url.includes('sprite') && 
                      !url.includes('SPRITE')) {
              type = 'source';
            }
            
            if (type) {
              console.log(`[NetworkTracker] Detected ${type} request: ${url}`);
              this.pendingRequests.set(requestId, { 
                type, 
                timestamp: Date.now() 
              });
            }
            
            // Call the original fetch and track the response
            return this.originalFetch.apply(window, args)
              .then(response => {
                if (type && response.ok) {
                  // Clone the response so we can access the body
                  const clonedResponse = response.clone();
                  
                  clonedResponse.blob().then(blob => {
                    const size = blob.size;
                    
                    console.log(`[NetworkTracker] ${type} request complete: ${url}, size: ${formatBytes(size)}`);
                    
                    // Update counters directly
                    if (type === 'source') {
                      console.log('[NetworkTracker] Adding source data:', {
                        size: formatBytes(size),
                        prevTotal: formatBytes(sourceDataLoaded),
                        newTotal: formatBytes(sourceDataLoaded + size)
                      });
                      sourceDataLoaded += size;
                      sourceLoadedCount++;
                    } else if (type === 'sprite') {
                      console.log('[NetworkTracker] Adding sprite data:', {
                        size: formatBytes(size),
                        prevTotal: formatBytes(spriteDataLoaded),
                        newTotal: formatBytes(spriteDataLoaded + size)
                      });
                      spriteDataLoaded += size;
                      if (url === SPRITE_IMAGE_URL) {
                        spriteImageLoaded = true;
                      } else {
                        spriteLoadedCount++;
                      }
                    }
                    
                    // Force UI update with new data
                    setTimeout(forceUIUpdate, 0);
                    
                    // Remove from pending requests
                    this.pendingRequests.delete(requestId);
                  }).catch(error => {
                    console.error('[NetworkTracker] Error processing blob:', error);
                    // Still count as loaded even if we couldn't process size
                    if (type === 'source') {
                      sourceLoadedCount++;
                    } else if (type === 'sprite') {
                      spriteLoadedCount++;
                    }
                    this.pendingRequests.delete(requestId);
                  });
                } else if (this.pendingRequests.has(requestId)) {
                  // If the request failed, count it as an error
                  const reqInfo = this.pendingRequests.get(requestId);
                  if (reqInfo && reqInfo.type === 'source') {
                    sourceErrorCount++;
                  } else if (reqInfo) {
                    spriteErrorCount++;
                  }
                  this.pendingRequests.delete(requestId);
                }
                
                return response;
              })
              .catch(error => {
                // If the request failed, count it as an error
                if (this.pendingRequests.has(requestId)) {
                  const reqInfo = this.pendingRequests.get(requestId);
                  if (reqInfo) {
                    console.log(`[NetworkTracker] ${reqInfo.type} request failed: ${url}`, error);
                    if (reqInfo.type === 'source') {
                      sourceErrorCount++;
                    } else {
                      spriteErrorCount++;
                    }
                  }
                  this.pendingRequests.delete(requestId);
                }
                throw error;
              });
          } catch (error) {
            console.error('[NetworkTracker] Critical error in fetch override:', error);
            // If anything goes wrong, use the original fetch
            return this.originalFetch.apply(window, args);
          } finally {
            // Reset active flag
            this.active = false;
          }
        } else {
          // If we're already processing a fetch, use the original to avoid recursion
          console.warn('[NetworkTracker] Detected recursive fetch call, using original fetch');
          return this.originalFetch.apply(window, args);
        }
      };
      
      console.log('[NetworkTracker] Network monitoring active');
    }
    
    cleanup() {
      // Restore the original fetch
      window.fetch = this.originalFetch;
      this.active = false;
      this.pendingRequests.clear();
      console.log('[NetworkTracker] Network monitoring stopped and cleaned up');
    }
  }
  
  // Create a single instance of the network tracker
  let networkTracker: NetworkResourceTracker | null = null;

  // Get total number of images to load for each column
  const sourceTotalImages = pubkeyEntries.length;
  const fallbackImages = pubkeyEntries.filter(([pubkey]) => !mappingJson.mapping[pubkey]).length;
  const spriteMappedImages = pubkeyEntries.filter(([pubkey]) => mappingJson.mapping[pubkey]).length;
  const spriteTotalImages = fallbackImages + 1; // 1 sprite sheet + fallback images

  // Check DOM for actually visible images
  function checkVisibleImages() {
    // Check source images
    const sourceImgs = document.querySelectorAll('#source-column img');
    let prevSourceVisibleCount = sourceVisibleCount;
    sourceVisibleCount = 0;
    
    sourceImgs.forEach(img => {
      // An image is considered visible when it has content
      if ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0) {
        sourceVisibleCount++;
      }
    });
    
    // Check sprite images
    const spriteImgs = document.querySelectorAll('#sprite-column img');
    const spriteDivs = document.querySelectorAll('#sprite-column [data-sprite-mapped="true"]');
    let prevSpriteVisibleCount = spriteVisibleCount;
    spriteVisibleCount = 0;
    
    // Count loaded regular images
    spriteImgs.forEach(img => {
      if ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0) {
        spriteVisibleCount++;
      }
    });
    
    // Count sprite-mapped divs with background-image applied
    spriteDivs.forEach(div => {
      if (window.getComputedStyle(div).backgroundImage !== 'none') {
        spriteVisibleCount++;
      }
    });
    
    // Only log when counts change to reduce noise
    if (sourceVisibleCount !== prevSourceVisibleCount || spriteVisibleCount !== prevSpriteVisibleCount) {
      console.log('[Visibility] Source:', sourceVisibleCount + '/' + sourceTotalImages, 
                  'Sprite:', spriteVisibleCount + '/' + (spriteMappedImages + fallbackImages));
    }
    
    // Update loading flags based on visibility
    sourceStillLoading = sourceVisibleCount < sourceTotalImages;
    spriteStillLoading = spriteVisibleCount < (spriteMappedImages + fallbackImages);
    
    // Update full end times if needed
    if (!sourceStillLoading && !sourceEndTime) {
      sourceEndTime = Date.now();
      console.log('[Source] Setting FINAL end time based on visibility:', sourceEndTime);
    }
    
    if (!spriteStillLoading && !spriteEndTime) {
      spriteEndTime = Date.now();
      console.log('[Sprite] Setting FINAL end time based on visibility:', spriteEndTime);
    }
    
    // Check if both sides are fully visible
    if (!sourceStillLoading && !spriteStillLoading) {
      if (!isFullyLoaded) {
        console.log('[Complete] All images visibly loaded, stopping timers');
        isFullyLoaded = true;
        completionMode = 'full';
        stopTimer('full');
      }
    }
    
    // CRITICAL FIX: Track percentage of visible images for race completion 
    // and log when we hit visibility thresholds
    const VISIBILITY_THRESHOLDS = [0.1, 0.25, 0.5, 0.75, 0.9]; // 10%, 25%, etc.
    const sourceVisibilityPercentage = sourceVisibleCount / sourceTotalImages;
    const spriteVisibilityPercentage = spriteVisibleCount / (spriteMappedImages + fallbackImages);
    
    // Check source visibility thresholds
    for (const threshold of VISIBILITY_THRESHOLDS) {
      if (sourceVisibilityPercentage >= threshold && prevSourceVisibleCount / sourceTotalImages < threshold) {
        console.log(`[Source] Reached ${threshold * 100}% visibility: ${sourceVisibleCount}/${sourceTotalImages}`);
      }
    }
    
    // Check sprite visibility thresholds
    for (const threshold of VISIBILITY_THRESHOLDS) {
      if (spriteVisibilityPercentage >= threshold && prevSpriteVisibleCount / (spriteMappedImages + fallbackImages) < threshold) {
        console.log(`[Sprite] Reached ${threshold * 100}% visibility: ${spriteVisibleCount}/${spriteMappedImages + fallbackImages}`);
      }
    }
  }

  // Debug function to log current state
  function logState(prefix: string) {
    const sourceTotal = sourceLoadedCount + sourceErrorCount;
    const fallbackTotal = spriteLoadedCount + spriteErrorCount;
    const mappedTotal = spriteMappedProcessed.size;
    
    // CRITICAL FIX: A side is race-complete only when it has processed all images AND 
    // a minimum threshold of images are actually visible
    // This prevents premature race completion when data is loaded but images aren't visible yet
    const VISIBILITY_THRESHOLD = 0.6; // At least 60% of images must be visible to count as complete
    const MIN_LOADING_TIME = 500; // Minimum 500ms loading time required before race completion
    const sourceRequiredVisible = Math.ceil(sourceTotalImages * VISIBILITY_THRESHOLD);
    const spriteRequiredVisible = Math.ceil((spriteMappedImages + fallbackImages) * VISIBILITY_THRESHOLD);
    
    const sourceElapsedTime = sourceStartTime ? (Date.now() - sourceStartTime) : 0;
    const spriteElapsedTime = spriteStartTime ? (Date.now() - spriteStartTime) : 0;
    
    // Updated race completion criteria that includes visibility check and minimum time
    const sourceRaceComplete = sourceTotal === sourceTotalImages && 
                              sourceVisibleCount >= sourceRequiredVisible &&
                              sourceElapsedTime >= MIN_LOADING_TIME;
    
    const spriteRaceComplete = spriteImageLoaded && 
                             mappedTotal === spriteMappedCount && 
                             fallbackTotal === fallbackImages &&
                             spriteMappedCount === spriteMappedImages &&
                             spriteVisibleCount >= spriteRequiredVisible &&
                             spriteElapsedTime >= MIN_LOADING_TIME;
    
    console.log(`[State] ${prefix}:`, {
      source: {
        loaded: sourceLoadedCount,
        errors: sourceErrorCount,
        total: sourceTotal,
        target: sourceTotalImages,
        visible: sourceVisibleCount,
        requiredVisible: sourceRequiredVisible,
        elapsedMs: sourceElapsedTime,
        minTimeReached: sourceElapsedTime >= MIN_LOADING_TIME,
        raceComplete: sourceRaceComplete,
        visuallyLoaded: sourceVisibleCount,
        stillLoading: sourceStillLoading
      },
      sprite: {
        sheetLoaded: spriteImageLoaded,
        mapped: mappedTotal,
        mappedSeen: spriteMappedCount,
        mappedTarget: spriteMappedImages,
        fallbackLoaded: spriteLoadedCount,
        fallbackErrors: spriteErrorCount,
        fallbackTotal,
        fallbackTarget: fallbackImages,
        visible: spriteVisibleCount,
        requiredVisible: spriteRequiredVisible,
        elapsedMs: spriteElapsedTime,
        minTimeReached: spriteElapsedTime >= MIN_LOADING_TIME,
        raceComplete: spriteRaceComplete,
        visuallyLoaded: spriteVisibleCount,
        stillLoading: spriteStillLoading
      },
      isFullyLoaded
    });

    // Check if either side is race-complete (for winner determination)
    if (sourceRaceComplete && !sourceRaceEndTime) {
      sourceRaceEndTime = Date.now();
      console.log('[Source] Setting race end time:', sourceRaceEndTime, `(${sourceVisibleCount}/${sourceTotalImages} images visible)`);
    }
    
    if (spriteRaceComplete && !spriteRaceEndTime) {
      spriteRaceEndTime = Date.now();
      console.log('[Sprite] Setting race end time:', spriteRaceEndTime, `(${spriteVisibleCount}/${spriteMappedImages + fallbackImages} images visible)`);
    }

    // Check if both sides are race-complete (for winner determination)
    if (sourceRaceEndTime && spriteRaceEndTime && !winner) {
      determineWinner();
    }
    
    // Check DOM for visible images
    checkVisibleImages();
  }

  // Format bytes to human readable
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  // Format time in seconds to a more readable format
  function formatTime(seconds: number): string {
    if (seconds === 0) return '0.0s';
    return seconds.toFixed(1) + 's';
  }

  // Function to safely increment data counts for any stage of the race
  function addSourceData(size: number) {
    console.log('[DATA] Adding source data:', {
      size: formatBytes(size),
      prevTotal: formatBytes(sourceDataLoaded),
      newTotal: formatBytes(sourceDataLoaded + size),
      winner,
      completionMode
    });
    sourceDataLoaded += size;
  }

  function addSpriteData(size: number) {
    console.log('[DATA] Adding sprite data:', {
      size: formatBytes(size),
      prevTotal: formatBytes(spriteDataLoaded),
      newTotal: formatBytes(spriteDataLoaded + size),
      winner,
      completionMode
    });
    spriteDataLoaded += size;
  }

  function incrementSourceLoaded() {
    sourceLoadedCount++;
    console.log('[DATA] Incrementing source loaded:', {
      count: sourceLoadedCount,
      winner,
      completionMode
    });
  }

  function incrementSpriteLoaded() {
    spriteLoadedCount++;
    console.log('[DATA] Incrementing sprite loaded:', {
      count: spriteLoadedCount,
      winner,
      completionMode
    });
  }

  // Track image loading for source images
  function trackSourceImage(url: string) {
    if (!sourceStartTime) {
      sourceStartTime = Date.now();
      currentTime = sourceStartTime;
    }

    // Create an Image object to properly track loading
    const img = new Image();
    let isLoadHandled = false;
    
    // Add timeout to handle images that never load
    const timeout = setTimeout(() => {
      if (!img.complete && !isLoadHandled) {
        console.log('[Source] Image load timeout:', url);
        isLoadHandled = true;
        sourceErrorCount++;
        logState('Source Load Timeout');
      }
    }, CONFIG.IMAGE_LOAD_TIMEOUT);

    img.onload = () => {
      if (isLoadHandled) return;
      clearTimeout(timeout);
      isLoadHandled = true;
      
      // SIMPLIFIED: Direct fetch without abort controller
      console.log('[Source] Starting fetch for:', url);
      
      fetch(url, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return response.blob();
        })
        .then(blob => {
          // CRITICAL FIX: Always increment data counters regardless of race status
          console.log('[Source] Fetched data:', {
            url,
            size: formatBytes(blob.size),
            prevTotal: formatBytes(sourceDataLoaded),
            newTotal: formatBytes(sourceDataLoaded + blob.size),
            winner,
            raceCompleted: sourceRaceEndTime !== null
          });
          
          // Directly add to the data count
          sourceDataLoaded += blob.size;
          incrementSourceLoaded();
          
          // Force immediate UI update
          forceUIUpdate();
          
          logState('Source Fetch Complete');
        })
        .catch(error => {
          sourceErrorCount++;
          console.log('[Source] Fetch error:', url, error.message);
          logState('Source Fetch Error');
        });
    };
    img.onerror = () => {
      if (isLoadHandled) return;
      clearTimeout(timeout);
      isLoadHandled = true;
      sourceErrorCount++;
      logState('Source Load Error');
    };
    img.src = url;
  }

  // Track sprite loading
  function trackSpriteImage(pubkey: string, urls: string[]) {
    if (!spriteStartTime) {
      spriteStartTime = Date.now();
      currentTime = spriteStartTime;
    }

    if (mappingJson.mapping[pubkey]) {
      return;
    }

    // Create an Image object to properly track loading
    const img = new Image();
    let isLoadHandled = false;

    // Add timeout to handle images that never load
    const timeout = setTimeout(() => {
      if (!img.complete && !isLoadHandled) {
        console.log('[Sprite] Fallback image load timeout:', urls[0]);
        isLoadHandled = true;
        spriteErrorCount++;
        logState('Sprite Load Timeout');
      }
    }, CONFIG.IMAGE_LOAD_TIMEOUT);

    img.onload = () => {
      if (isLoadHandled) return;
      clearTimeout(timeout);
      isLoadHandled = true;
      
      // SIMPLIFIED: Direct fetch without abort controller
      console.log('[Sprite] Starting fetch for:', urls[0]);
      
      fetch(urls[0], { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return response.blob();
        })
        .then(blob => {
          // CRITICAL FIX: Always increment data counters regardless of race status
          console.log('[Sprite] Fetched fallback data:', {
            url: urls[0],
            size: formatBytes(blob.size),
            prevTotal: formatBytes(spriteDataLoaded),
            newTotal: formatBytes(spriteDataLoaded + blob.size),
            winner,
            raceCompleted: spriteRaceEndTime !== null
          });
          
          // Directly add to the data count
          spriteDataLoaded += blob.size;
          incrementSpriteLoaded();
          
          // Force immediate UI update
          forceUIUpdate();
          
          logState('Sprite Fetch Complete');
        })
        .catch(error => {
          spriteErrorCount++;
          console.log('[Sprite] Fetch error:', urls[0], error.message);
          logState('Sprite Fetch Error');
        });
    };
    img.onerror = () => {
      if (isLoadHandled) return;
      clearTimeout(timeout);
      isLoadHandled = true;
      spriteErrorCount++;
      logState('Sprite Load Error');
    };
    img.src = urls[0];
  }

  // Use action to handle sprite div mounting
  function spriteMount(node: HTMLElement, pubkey: string) {
    const urls = pubkeyEntries.find(([p]) => p === pubkey)?.[1] || [];
    
    if (mappingJson.mapping[pubkey]) {
      // Handle sprite-mapped image
      const style = getSpriteStyle(pubkey);
      node.setAttribute('data-sprite-mapped', 'true');
      node.setAttribute('data-sprite-style', style);
      node.setAttribute('data-pubkey', pubkey);
      
      // Track this element for processing when sprite sheet loads
      if (!spriteMappedElements.has(pubkey)) {
        spriteMappedElements.set(pubkey, node);
        spriteMappedCount++; // Increment count of sprite-mapped images we've seen
        console.log('[Sprite] New element tracked:', {
          pubkey,
          total: spriteMappedCount,
          target: spriteMappedImages,
          spriteLoaded: spriteImageLoaded
        });
      }
      
      // If sprite sheet is already loaded, process immediately
      if (spriteImageLoaded) {
        processSpriteMappedElement(pubkey, node);
      }
    } else {
      // Handle fallback image
      trackSpriteImage(pubkey, urls);
    }

    return {
      destroy() {
        if (mappingJson.mapping[pubkey]) {
          spriteMappedElements.delete(pubkey);
          // Only decrement count if we're not hot reloading
          const isHotReload = document.querySelector(`[data-pubkey="${pubkey}"]`);
          if (!isHotReload) {
            spriteMappedCount--;
            spriteMappedProcessed.delete(pubkey);
            console.log('[Sprite] Mapped image removed:', {
              pubkey,
              total: spriteMappedCount,
              target: spriteMappedImages
            });
          }
        }
        node.removeAttribute('data-sprite-mapped');
        node.removeAttribute('data-sprite-style');
        node.removeAttribute('data-pubkey');
      }
    };
  }

  // Process a single sprite-mapped element
  function processSpriteMappedElement(pubkey: string, node: HTMLElement) {
    const style = getSpriteStyle(pubkey);
    node.style = style;
    spriteMappedProcessed.add(pubkey);
    console.log('[Sprite] Processed mapped image:', {
      pubkey,
      total: spriteMappedProcessed.size,
      target: spriteMappedImages
    });
    logState('Sprite Mapped Element Processed');
  }

  // Process all tracked sprite-mapped elements
  function processAllSpriteMappedElements() {
    console.log('[Sprite] Processing mapped elements:', {
      tracked: spriteMappedElements.size,
      target: spriteMappedImages
    });
    
    spriteMappedElements.forEach((node, pubkey) => {
      processSpriteMappedElement(pubkey, node);
    });
    
    logState('Sprite Elements Processed');
  }

  // Preload sprite sheet
  function preloadSpriteSheet() {
    if (!spriteStartTime) {
      spriteStartTime = Date.now();
      currentTime = spriteStartTime;
    }

    // Create an Image object to properly track sprite sheet loading
    const img = new Image();
    let isLoadHandled = false;
    
    // Add timeout for sprite sheet loading
    const timeout = setTimeout(() => {
      if (!img.complete && !isLoadHandled) {
        console.log('[Sprite] Sheet timeout');
        isLoadHandled = true;
        spriteErrorCount++;
        spriteImageLoaded = true; // Mark as loaded even though it failed
        logState('Sprite Sheet Timeout');
      }
    }, CONFIG.SPRITE_LOAD_TIMEOUT);

    img.onload = () => {
      if (isLoadHandled) return;
      clearTimeout(timeout);
      isLoadHandled = true;
      console.log('[Sprite] Sheet loaded');
      
      // SIMPLIFIED: Direct fetch without abort controller
      console.log('[Sprite] Starting fetch for sprite sheet');
      
      fetch(SPRITE_IMAGE_URL, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return response.blob();
        })
        .then(blob => {
          // CRITICAL FIX: Always increment data counters regardless of race status
          console.log('[Sprite Sheet] Fetched data:', {
            size: formatBytes(blob.size),
            prevTotal: formatBytes(spriteDataLoaded),
            newTotal: formatBytes(spriteDataLoaded + blob.size),
            winner,
            raceCompleted: spriteRaceEndTime !== null
          });
          
          // Add to the sprite data count, not overwrite
          spriteDataLoaded += blob.size;
          spriteImageLoaded = true;
          
          // Force immediate UI update
          forceUIUpdate();
          
          // Process all currently tracked elements
          processAllSpriteMappedElements();
          
          logState('Sprite Sheet Loaded');
        })
        .catch(error => {
          spriteErrorCount++;
          spriteImageLoaded = true;
          console.log('[Sprite] Sheet fetch error:', error.message);
          logState('Sprite Sheet Error');
        });
    };
    img.onerror = () => {
      if (isLoadHandled) return;
      clearTimeout(timeout);
      isLoadHandled = true;
      spriteErrorCount++;
      spriteImageLoaded = true;
      logState('Sprite Sheet Error');
    };
    img.src = SPRITE_IMAGE_URL;
  }

  // Check if loading is complete for each column
  function checkSourceComplete() {
    const total = sourceLoadedCount + sourceErrorCount;
    
    if (total === sourceTotalImages) {
      logState('Source Complete Check');
    }
  }

  function checkSpriteComplete() {
    const fallbackTotal = spriteLoadedCount + spriteErrorCount;
    const mappedTotal = spriteMappedProcessed.size;
    
    // Sprite side is complete when:
    // 1. Sprite sheet is loaded (or errored)
    // 2. All mapped images we've seen are processed
    // 3. All fallback images are either loaded or errored
    // 4. We've seen all sprite-mapped images
    const isComplete = spriteImageLoaded && 
                      mappedTotal === spriteMappedCount && 
                      fallbackTotal === fallbackImages &&
                      spriteMappedCount === spriteMappedImages;
    
    console.log('[Sprite] Checking completion:', {
      sheetLoaded: spriteImageLoaded,
      mapped: mappedTotal,
      mappedSeen: spriteMappedCount,
      mappedTarget: spriteMappedImages,
      fallbackLoaded: spriteLoadedCount,
      fallbackErrors: spriteErrorCount,
      fallbackTotal,
      fallbackTarget: fallbackImages,
      complete: isComplete
    });
    
    if (isComplete) {
      logState('Sprite Complete Check');
    }
  }

  // Helper to determine winner
  function determineWinner() {
    if (!sourceRaceEndTime || !spriteRaceEndTime || winner) return;
    
    // CRITICAL FIX: Force a UI refresh before making winner determination
    // to ensure we're using the latest data values
    forceUIUpdate();
    
    console.log('[Winner] Pre-determination stats:', {
      sourceData: sourceDataDisplay,
      spriteData: spriteDataDisplay,
    });
    
    // Check if both sides race-completed at the same time (within a small threshold)
    const timeDifference = Math.abs(sourceRaceEndTime - spriteRaceEndTime);
    const TIME_THRESHOLD = 100; // 100ms threshold for "same time" determination
    
    if (timeDifference <= TIME_THRESHOLD) {
      console.log('[Winner] Both sides completed at approximately the same time, using tiebreakers');
      
      // Tiebreaker #1: Less data loaded
      if (sourceDataLoaded < spriteDataLoaded) {
        winner = 'source';
        console.log('[Winner] Source wins tiebreaker: Less data loaded', {
          sourceData: formatBytes(sourceDataLoaded),
          spriteData: formatBytes(spriteDataLoaded)
        });
      } else if (spriteDataLoaded < sourceDataLoaded) {
        winner = 'sprite';
        console.log('[Winner] Sprite wins tiebreaker: Less data loaded', {
          sourceData: formatBytes(sourceDataLoaded),
          spriteData: formatBytes(spriteDataLoaded)
        });
      } else {
        // Tiebreaker #2: Less failures
        if (sourceErrorCount < spriteErrorCount) {
          winner = 'source';
          console.log('[Winner] Source wins tiebreaker: Less failures', {
            sourceErrors: sourceErrorCount,
            spriteErrors: spriteErrorCount
          });
        } else if (spriteErrorCount < sourceErrorCount) {
          winner = 'sprite';
          console.log('[Winner] Sprite wins tiebreaker: Less failures', {
            sourceErrors: sourceErrorCount,
            spriteErrors: spriteErrorCount
          });
        } else {
          // Tiebreaker #3: Less images loaded
          if (sourceLoadedCount < spriteLoadedCount) {
            winner = 'source';
            console.log('[Winner] Source wins tiebreaker: Less images loaded', {
              sourceLoaded: sourceLoadedCount,
              spriteLoaded: spriteLoadedCount
            });
          } else if (spriteLoadedCount < sourceLoadedCount) {
            winner = 'sprite';
            console.log('[Winner] Sprite wins tiebreaker: Less images loaded', {
              sourceLoaded: sourceLoadedCount,
              spriteLoaded: spriteLoadedCount
            });
          } else {
            // Ultimate fallback if all tiebreakers are equal
            winner = 'source'; // Default source as winner in case of perfect tie
            console.log('[Winner] Perfect tie on all metrics, defaulting to source');
          }
        }
      }
    } else {
      // Regular time-based winner determination
      winner = sourceRaceEndTime <= spriteRaceEndTime ? 'source' : 'sprite';
      console.log('[Winner] Determined by completion time:', winner, {
        sourceTime: sourceRaceEndTime - (sourceStartTime || 0),
        spriteTime: spriteRaceEndTime - (spriteStartTime || 0),
        timeDifference
      });
    }
    
    console.log('[Winner] Final:', winner, {
      sourceTime: sourceRaceEndTime - (sourceStartTime || 0),
      spriteTime: spriteRaceEndTime - (spriteStartTime || 0),
      sourceData: formatBytes(sourceDataLoaded),
      spriteData: formatBytes(spriteDataLoaded),
      sourceErrors: sourceErrorCount,
      spriteErrors: spriteErrorCount,
      sourceLoaded: sourceLoadedCount,
      spriteLoaded: spriteLoadedCount
    });
    
    // We continue loading to get final stats, don't stop timers
    completionMode = 'race';
    
    // CRITICAL FIX: Force another UI refresh after setting winner
    // to ensure the UI updates with the latest values
    setTimeout(forceUIUpdate, 0);
    
    // CRITICAL FIX: Set up a continuous update timer for post-race stats
    // This ensures display values continue updating even after a winner is determined
    const postRaceTimer = window.setInterval(() => {
      // Update display values regardless of race status
      sourceDataDisplay = formatBytes(sourceDataLoaded);
      spriteDataDisplay = formatBytes(spriteDataLoaded);
      sourceLoadedDisplay = sourceLoadedCount;
      spriteLoadedDisplay = spriteLoadedCount;
      sourceErrorDisplay = sourceErrorCount;
      spriteErrorDisplay = spriteErrorCount;
      
      // Force reactivity by updating currentTime
      currentTime = Date.now();
      
      console.log('[Post-Race] Updated display values:', {
        sourceData: sourceDataDisplay,
        spriteData: spriteDataDisplay,
        sourceLoaded: sourceLoadedDisplay,
        spriteLoaded: spriteLoadedDisplay
      });
    }, 50); // Update every 50ms
    
    // Clean up after 30 seconds (all data should be loaded by then)
    setTimeout(() => {
      clearInterval(postRaceTimer);
      console.log('[Post-Race] Stopped post-race update timer');
    }, 30000);
  }

  // Helper to stop the timer
  function stopTimer(mode: 'race' | 'force' | 'full' = 'full') {
    console.log(`[Timer] Stop requested, mode: ${mode}, current mode: ${completionMode}`);
    
    // Don't downgrade completion mode - once we're in a more complete state, stay there
    if (
      (completionMode === 'full') || 
      (completionMode === 'force' && mode === 'race') ||
      (completionMode === 'race' && mode === 'race')
    ) {
      console.log(`[Timer] Ignoring stop request, already in ${completionMode} mode`);
      return;
    }
    
    // Update completion mode
    completionMode = mode;
    
    if (mode === 'full') {
      // Full completion - but NEVER stop data update timer
      if (timer) {
        console.log('[Timer] Stopped UI timer');
        clearInterval(timer);
        timer = 0;
      }
      if (completionCheck) {
        console.log('[Timer] Stopped completion check timer');
        clearInterval(completionCheck);
        completionCheck = 0;
      }
      if (forceCompletionTimeout) {
        console.log('[Timer] Stopped force completion timeout');
        clearTimeout(forceCompletionTimeout);
        forceCompletionTimeout = 0;
      }
      if (visibilityCheckTimer) {
        console.log('[Timer] Stopped visibility check timer');
        clearInterval(visibilityCheckTimer);
        visibilityCheckTimer = 0;
      }
      
      // CRITICAL FIX: We NEVER stop the data update timer or UI update timer
      console.log('[Timer] Keeping data and UI update timers running for final stats');
      
      // Log final data values
      console.log('[Final Data] Values after completion:', {
        sourceData: formatBytes(sourceDataLoaded),
        spriteData: formatBytes(spriteDataLoaded),
        sourceLoaded: sourceLoadedCount,
        spriteLoaded: spriteLoadedCount,
        sourceErrors: sourceErrorCount,
        spriteErrors: spriteErrorCount
      });
    } else if (mode === 'force') {
      // Force completion - keep all data timers running
      if (forceCompletionTimeout) {
        console.log('[Timer] Stopped force completion timeout');
        clearTimeout(forceCompletionTimeout);
        forceCompletionTimeout = 0;
      }
      
      // CRITICAL FIX: Never stop ANY data/UI timers - we need them for continuous updates
      console.log('[Timer] Keeping ALL timers running for data tracking');
    } else if (mode === 'race') {
      // Race completion - just track stats
      console.log('[Timer] Race completion - continuing to track ALL stats');
      // Never stop ANY timers when in race mode - we need them to continue tracking data
    }
  }

  // Start timer updates and preload sprite sheet
  let timer: number;
  let completionCheck: number;
  let forceCompletionTimeout: number;
  let uiUpdateTimer: number; // Special timer just for UI updates
  let dataUpdateTimer: number;
  onMount(() => {
    // Reset state on mount
    sourceLoadedCount = 0;
    spriteLoadedCount = 0;
    sourceDataLoaded = 0;
    spriteDataLoaded = 0;
    sourceStartTime = null;
    spriteStartTime = null;
    sourceEndTime = null;
    spriteEndTime = null;
    sourceRaceEndTime = null;
    spriteRaceEndTime = null;
    winner = null;
    spriteImageLoaded = false;
    currentTime = Date.now();
    sourceErrorCount = 0;
    spriteErrorCount = 0;
    spriteMappedProcessed.clear();
    isFullyLoaded = false;
    sourceStillLoading = true;
    spriteStillLoading = true;
    sourceVisibleCount = 0;
    spriteVisibleCount = 0;
    
    // BULLETPROOF FIX: Make sure the network tracker is active
    // If it was somehow not initialized earlier, initialize it now
    if (!networkTracker) {
      networkTracker = new NetworkResourceTracker();
      console.log('[Init] Created new NetworkResourceTracker in onMount');
    } else {
      console.log('[Init] NetworkResourceTracker already active');
    }
    
    console.log('[Init]', {
      sourceTotalImages,
      fallbackImages,
      spriteMappedImages,
      spriteTotalImages
    });

    // Start visibility check timer - used to check DOM for loaded images
    visibilityCheckTimer = window.setInterval(() => {
      checkVisibleImages();
    }, 100); // Check frequently for visible images
    
    // Start preloading sprite sheet
    preloadSpriteSheet();
    
    // Manually trigger loading for all source images
    console.log('[Init] Manually triggering source image loading');
    pubkeyEntries.forEach(([pubkey, urls]) => {
      trackSourceImage(urls[0]);
    });
    
    // Manually trigger loading for all fallback sprite images
    console.log('[Init] Manually triggering sprite fallback image loading');
    pubkeyEntries.forEach(([pubkey, urls]) => {
      if (!mappingJson.mapping[pubkey]) {
        trackSpriteImage(pubkey, urls);
      }
    });

    // Add periodic completion check
    completionCheck = window.setInterval(() => {
      // Continue updating stats even after a race winner is determined
      logState('Timer Check');
      // Only stop if we're fully loaded
      if (isFullyLoaded) {
        stopTimer('full');
      }
    }, CONFIG.STATE_LOG_INTERVAL);

    // Create a special timer specifically for UI updates that continues
    // running even after race completion
    uiUpdateTimer = window.setInterval(() => {
      forceUIUpdate();
    }, 500); // Update UI every 500ms

    timer = window.setInterval(() => {
        currentTime = Date.now();
    }, CONFIG.UI_UPDATE_INTERVAL);

    // Force completion after timeout
    forceCompletionTimeout = window.setTimeout(() => {
      console.log('[Force] Forcing completion after timeout');
      
      console.log('[Force] Data stats before force completion:', {
        sourceDataLoaded: formatBytes(sourceDataLoaded),
        spriteDataLoaded: formatBytes(spriteDataLoaded),
        sourceLoadedCount,
        spriteLoadedCount,
        sourceErrorCount,
        spriteErrorCount
      });
      
      // Update completion mode to force
      completionMode = 'force';
      
      // Force source side race completion (for race winner determination only)
      if (!sourceRaceEndTime) {
        console.log('[Force] Forcing source race completion');
        const sourceTotal = sourceLoadedCount + sourceErrorCount;
        const remaining = sourceTotalImages - sourceTotal;
        
        if (remaining > 0) {
          console.log(`[Force] Adding ${remaining} errors to source`);
          sourceErrorCount += remaining;
        }
        
        sourceRaceEndTime = Date.now();
      }
      
      // Force sprite side race completion (for race winner determination only)
      if (!spriteRaceEndTime) {
        console.log('[Force] Forcing sprite race completion');
        
        // Force sprite sheet loaded if not already
        if (!spriteImageLoaded) {
          console.log('[Force] Forcing sprite sheet loaded');
          spriteImageLoaded = true;
          spriteErrorCount++;
        }
        
        // Force all mapped images processed
        const mappedRemaining = spriteMappedImages - spriteMappedProcessed.size;
        if (mappedRemaining > 0) {
          console.log(`[Force] Processing remaining ${mappedRemaining} mapped images`);
          // Add all remaining pubkeys to processed set
          pubkeyEntries.forEach(([pubkey]) => {
            if (mappingJson.mapping[pubkey] && !spriteMappedProcessed.has(pubkey)) {
              spriteMappedProcessed.add(pubkey);
            }
          });
        }
        
        // Force all fallback images loaded or errored - for race completion only
        const fallbackTotal = spriteLoadedCount + spriteErrorCount;
        const fallbackRemaining = fallbackImages - fallbackTotal;
        if (fallbackRemaining > 0) {
          console.log(`[Force] Adding ${fallbackRemaining} errors to sprite fallbacks`);
          spriteErrorCount += fallbackRemaining;
        }
        
        spriteRaceEndTime = Date.now();
      }
      
      // Determine winner if not already determined
      if (!winner) {
        determineWinner();
      }
      
      // Log the current data after winner is determined
      console.log('[Force] Data stats after winner determination:', {
        sourceDataLoaded: formatBytes(sourceDataLoaded),
        spriteDataLoaded: formatBytes(spriteDataLoaded)
      });
      
      // We DON'T stop all in-flight fetches - let them complete
      // We only mark these for UI purposes but don't prevent data from accumulating
      if (!sourceEndTime) {
        sourceEndTime = Date.now();
      }
      
      if (!spriteEndTime) {
        spriteEndTime = Date.now();
      }
      
      // Important: We're not actually fully loaded, but we mark it this way for UI
      // Don't stop loading or accumulating data!
      sourceStillLoading = false;
      spriteStillLoading = false;
      isFullyLoaded = true;
      
      logState('Force Completion');
      
      // Tell the timer we're in force mode, but don't stop data counting
      stopTimer('force');
      
      // Add a special timer to periodically update the UI with final stats
      const finalStatsTimer = window.setInterval(() => {
        console.log('[Final Stats]', {
          sourceData: formatBytes(sourceDataLoaded),
          spriteData: formatBytes(spriteDataLoaded),
          sourceLoaded: sourceLoadedCount,
          spriteLoaded: spriteLoadedCount
        });
        
        // Ensure the UI updates by forcing a reactive update
        currentTime = Date.now();
      }, 1000);
      
      // Clear after 20 seconds, by which time all data should be loaded
      setTimeout(() => {
        clearInterval(finalStatsTimer);
        console.log('[Final Stats] Stats collection complete');
      }, 20000);
      
    }, CONFIG.FORCE_COMPLETION_TIMEOUT);

    // Set up data update timer to run every 100ms
    dataUpdateTimer = window.setInterval(() => {
      // Update UI with latest data values, regardless of race status
      sourceDataDisplay = formatBytes(sourceDataLoaded);
      spriteDataDisplay = formatBytes(spriteDataLoaded);
      sourceLoadedDisplay = sourceLoadedCount;
      spriteLoadedDisplay = spriteLoadedCount;
      sourceErrorDisplay = sourceErrorCount;
      spriteErrorDisplay = spriteErrorCount;
      
      // Log to verify data is updating
      console.log('[Data Timer] Latest values:', {
        sourceData: formatBytes(sourceDataLoaded),
        spriteData: formatBytes(spriteDataLoaded),
        sourceLoaded: sourceLoadedCount,
        spriteLoaded: spriteLoadedCount,
        winner,
        completionMode
      });
      
      // CRITICAL FIX: Always check if we need to redetermine the winner 
      // in case data changed after race completion
      if (sourceRaceEndTime && spriteRaceEndTime && !winner) {
        determineWinner();
      }
      
      // Force a reactive update by updating the current time
      currentTime = Date.now();
    }, 50); // Update every 50ms for greater accuracy

    return () => {
      stopTimer();
      // Clear maps on unmount instead
      spriteMappedElements.clear();
      spriteMappedProcessed.clear();
      
      // Clear UI update timer on unmount
      if (uiUpdateTimer) {
        clearInterval(uiUpdateTimer);
        uiUpdateTimer = 0;
      }
      
      // Clear data update timer
      if (dataUpdateTimer) {
        clearInterval(dataUpdateTimer);
        dataUpdateTimer = 0;
      }
      
      // BULLETPROOF FIX: Clean up the network tracker
      if (networkTracker) {
        networkTracker.cleanup();
        networkTracker = null;
      }
    };
  });

  // Calculate elapsed time for display - using the race end time for the winning side ONLY for time
  $: sourceElapsed = sourceStartTime 
    ? (winner === 'source' ? (sourceRaceEndTime! - sourceStartTime) / 1000 : 
       sourceEndTime ? (sourceEndTime - sourceStartTime) / 1000 : 
       (currentTime - sourceStartTime) / 1000)
    : 0;
  
  $: spriteElapsed = spriteStartTime 
    ? (winner === 'sprite' ? (spriteRaceEndTime! - spriteStartTime) / 1000 : 
       spriteEndTime ? (spriteEndTime - spriteStartTime) / 1000 : 
       (currentTime - spriteStartTime) / 1000)
    : 0;

  // Bug fix: Keep tracking actual elapsed time separately from display time
  $: actualSourceElapsed = sourceStartTime ? (currentTime - sourceStartTime) / 1000 : 0;
  $: actualSpriteElapsed = spriteStartTime ? (currentTime - spriteStartTime) / 1000 : 0;
  
  // Calculate race completion time
  $: sourceRaceElapsed = sourceStartTime && sourceRaceEndTime
    ? (sourceRaceEndTime - sourceStartTime) / 1000
    : null;
  
  $: spriteRaceElapsed = spriteStartTime && spriteRaceEndTime
    ? (spriteRaceEndTime - spriteStartTime) / 1000
    : null;

  // CRITICAL FIX: Create reactive variables for displaying data counts and sizes
  // These variables will be explicitly updated by the UI timer, forcing reactivity
  $: sourceDataDisplay = formatBytes(sourceDataLoaded);
  $: spriteDataDisplay = formatBytes(spriteDataLoaded);
  $: sourceLoadedDisplay = sourceLoadedCount;
  $: spriteLoadedDisplay = spriteLoadedCount;
  $: sourceErrorDisplay = sourceErrorCount;
  $: spriteErrorDisplay = spriteErrorCount;

  // This timer update will force reactivity by updating the current time,
  // which will cause all reactive declarations to re-evaluate
  function forceUIUpdate() {
    // CRITICAL FIX: Instead of relying on reactive declarations,
    // directly update the display variables from the current data values
    // This bypasses any potential reactivity issues after winner determination
    sourceDataDisplay = formatBytes(sourceDataLoaded);
    spriteDataDisplay = formatBytes(spriteDataLoaded);
    sourceLoadedDisplay = sourceLoadedCount;
    spriteLoadedDisplay = spriteLoadedCount;
    sourceErrorDisplay = sourceErrorCount;
    spriteErrorDisplay = spriteErrorCount;
    
    // Simply updating currentTime will trigger a UI refresh for other reactive vars
    currentTime = Date.now();
    
    // Log actual data values to verify data is updating in memory
    console.log('[UI Refresh] Raw values:', {
      sourceData: sourceDataLoaded,
      spriteData: spriteDataLoaded,
      sourceLoaded: sourceLoadedCount,
      spriteLoaded: spriteLoadedCount,
      sourceErrors: sourceErrorCount,
      spriteErrors: spriteErrorCount,
    });
    
    console.log('[UI Refresh] Display values:', {
      sourceData: sourceDataDisplay,
      spriteData: spriteDataDisplay,
      sourceLoaded: sourceLoadedDisplay,
      spriteLoaded: spriteLoadedDisplay,
      sourceErrors: sourceErrorDisplay,
      spriteErrors: spriteErrorDisplay,
    });
  }

  // CRITICAL FIX: Initialize the Network Tracker immediately
  // This ensures it's ready before any components mount
  networkTracker = new NetworkResourceTracker();
  console.log('[App] NetworkResourceTracker initialized immediately');
</script>

<main class="container mx-auto p-2">
  <!-- <h1 class="text-2xl font-bold mb-4">Sprite Sheet vs Source Image Loading Race</h1> -->
  
  <!-- Stats row above the columns -->
  <div class="grid grid-cols-2 gap-4 mb-4">
    <!-- <div>
      <h2 class="text-xl font-bold mb-2">Source Images</h2>
      <div class="text-sm">
        Time: <span class="font-bold">
          {#if sourceRaceEndTime !== null}
            <span class="{winner === 'source' ? 'text-green-600' : 'text-red-600'}">
              {formatTime(sourceElapsed)}
            </span>
          {:else}
            {formatTime(sourceElapsed)}
          {/if}
        </span>
      </div>
      <div class="text-sm">Loaded: <span class="font-bold">{sourceLoadedDisplay}/{sourceTotalImages}</span></div>
      <div class="text-sm">Failed: <span class="font-bold">{sourceErrorDisplay}</span></div>
      <div class="text-sm">Data: <span class="font-bold">{sourceDataDisplay}</span></div>
    </div>
    
    <div>
      <h2 class="text-xl font-bold mb-2">Sprite Sheet</h2>
      <div class="text-sm">
        Time: <span class="font-bold">
          {#if spriteRaceEndTime !== null}
            <span class="{winner === 'sprite' ? 'text-green-600' : 'text-red-600'}">
              {formatTime(spriteElapsed)}
            </span>
          {:else}
            {formatTime(spriteElapsed)}
          {/if}
        </span>
      </div>
      <div class="text-sm">Loaded: <span class="font-bold">{spriteLoadedDisplay}/{spriteTotalImages}</span></div>
      <div class="text-sm">Failed: <span class="font-bold">{spriteErrorDisplay}</span></div>
      <div class="text-sm">Data: <span class="font-bold">{spriteDataDisplay}</span></div>
    </div> -->
  </div>
  
  <!-- Debug information for tracking data updates -->
  <div class="mb-4 p-2 bg-gray-100 text-xs">
    <div><strong>Debug Info:</strong> currentTime={currentTime}</div>
    <div>Raw Source Data: {sourceDataLoaded} bytes, Display: {sourceDataDisplay}</div>
    <div>Raw Sprite Data: {spriteDataLoaded} bytes, Display: {spriteDataDisplay}</div>
    <div>Race Status: {winner ? 'Complete - Winner: ' + winner : 'In progress...'}</div>
    <div class="text-green-600 font-bold">Network Monitoring Active: Counting data even after race completion</div>
    <div class="text-blue-600">✓ Final Fix Enabled: Simplified Network Tracking</div>
  </div>
  
  <!-- Rest of the existing UI layout -->
<div class="container mx-auto p-8">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
    <!-- Vertical Divider -->
    <div class="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gray-200 -mx-4"></div>
    
    <!-- Left Column: Using source_files.json only -->
      <div id="source-column" class="px-4 relative">
        <!-- CRITICAL FIX: Use an overlay instead of opacity to indicate winner/loser -->
        {#if winner === 'sprite'}
          <div class="absolute inset-0 bg-gray-200 bg-opacity-30 z-10 pointer-events-none"></div>
        {/if}
        <div class="flex items-center gap-1 mb-4">
        <h2 class="text-2xl font-bold">Source Files Only</h2>
        {#if winner === 'source'}<span class="text-2xl">🏆</span>{/if}
      </div>
      <div class="mb-4 space-y-1">
          <div class="font-mono" style="color: {winner === 'source' ? '#22c55e' : winner === 'sprite' ? '#ef4444' : '#000'}">
            Time: {sourceElapsed.toFixed(1)}s {winner === 'sprite' ? '(loser)' : ''}
            {#if winner === 'source'}
              <span class="animate-pulse">✓</span>
            {/if}
        </div>
        <div class="font-mono">
            Loaded: {sourceLoadedDisplay}/{sourceTotalImages} images
            <span class="text-sm text-gray-500">({sourceVisibleCount} visible)</span>
        </div>
        <div class="font-mono text-red-500">
            Failed: {sourceErrorDisplay} images
        </div>
        <div class="font-mono">
            Data: {sourceDataDisplay}
        </div>
          <div class="font-mono text-xs">
            {#if sourceStillLoading}
              <span class="text-blue-500">Loading in progress...</span>
            {:else}
              <span class="text-green-500">Loading complete</span>
            {/if}
      </div>
        </div>
        <div class="grid grid-cols-3 md:grid-cols-7 gap-4">
        {#each pubkeyEntries as [pubkey, urls]}
          <div class="aspect-square w-16">
            <img
              src={urls[0]}
              alt="Avatar"
              class="w-full h-full rounded-full object-cover shadow-lg hover:shadow-xl transition-shadow duration-200"
            />
          </div>
        {/each}
      </div>
    </div>

    <!-- Right Column: Use Sprite if mapping exists; otherwise fallback to source image -->
      <div id="sprite-column" class="px-4 relative">
        <!-- CRITICAL FIX: Use an overlay instead of opacity to indicate winner/loser -->
        {#if winner === 'source'}
          <div class="absolute inset-0 bg-gray-200 bg-opacity-30 z-10 pointer-events-none"></div>
        {/if}
      <div class="flex items-center gap-2 mb-4">
        <h2 class="text-2xl font-bold">Sprite & Fallback</h2>
        {#if winner === 'sprite'}<span class="text-2xl">🏆</span>{/if}
      </div>
      <div class="mb-4 space-y-1">
          <div class="font-mono" style="color: {winner === 'sprite' ? '#22c55e' : winner === 'source' ? '#ef4444' : '#000'}">
            Time: {spriteElapsed.toFixed(1)}s {winner === 'source' ? '(loser)' : ''}
            {#if winner === 'sprite'}
              <span class="animate-pulse">✓</span>
            {/if}
        </div>
        <div class="font-mono">
            Loaded: {spriteLoadedDisplay}/{spriteTotalImages} images ({spriteMappedImages} profile images in sprite)
            <span class="text-sm text-gray-500">({spriteVisibleCount} visible)</span>
        </div>
        <div class="font-mono text-red-500">
            Failed: {spriteErrorDisplay} images
        </div>
        <div class="font-mono">
            Data: {spriteDataDisplay}
        </div>
          <div class="font-mono text-xs">
            {#if spriteStillLoading}
              <span class="text-blue-500">Loading in progress...</span>
            {:else}
              <span class="text-green-500">Loading complete</span>
            {/if}
      </div>
        </div>
        <div class="grid grid-cols-3 md:grid-cols-7 gap-4">
        {#each pubkeyEntries as [pubkey, urls]}
          <div class="aspect-square w-16">
            {#if mappingJson.mapping[pubkey]}
              <div
                class="w-full h-full rounded-full bg-no-repeat shadow-lg hover:shadow-xl transition-shadow duration-200"
                style={getSpriteStyle(pubkey)}
                use:spriteMount={pubkey}
              />
            {:else}
              <img
                src={urls[0]}
                alt="Avatar"
                class="w-full h-full rounded-full object-cover shadow-lg hover:shadow-xl transition-shadow duration-200"
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
</main>