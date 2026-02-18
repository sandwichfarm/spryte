<script lang="ts">
  import { appVisualState } from "../lib/stores";

  const glowMap: Record<string, { color: string; opacity: string; pulse: boolean }> = {
    idle: { color: "36, 174, 158", opacity: "0.04", pulse: false },
    generating: { color: "62, 201, 183", opacity: "0.08", pulse: true },
    success: { color: "16, 185, 129", opacity: "0.06", pulse: false },
    error: { color: "239, 68, 68", opacity: "0.06", pulse: false },
    paying: { color: "245, 158, 11", opacity: "0.06", pulse: false },
  };

  $: glow = glowMap[$appVisualState] ?? glowMap.idle;
  $: glowStyle = `background: radial-gradient(ellipse 80% 60% at 50% 40%, rgba(${glow.color}, ${glow.opacity}) 0%, transparent 70%)`;
</script>

<div class="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
  <!-- Dot grid -->
  <div
    class="absolute inset-0"
    style="background-image: radial-gradient(circle, rgba(138, 135, 127, 0.035) 1px, transparent 1px); background-size: 24px 24px;"
  ></div>

  <!-- Single centered glow -->
  <div
    class="absolute inset-0 transition-all duration-[2000ms] {glow.pulse ? 'animate-pulse' : ''}"
    style={glowStyle}
  ></div>

  <!-- Film grain overlay -->
  <svg class="absolute inset-0 w-full h-full opacity-[0.03]">
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
    </filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
</div>
