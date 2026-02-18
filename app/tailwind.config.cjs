/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,svelte,ts}", "./index.html"],
  theme: {
    extend: {
      colors: {
        brand: {
          300: "#6edecf",
          400: "#3ec9b7",
          500: "#24ae9e",
          600: "#1a8c82",
          700: "#136b64",
        },
        surface: {
          950: "#121110",
          900: "#1c1b1a",
          800: "#2a2927",
          700: "#484542",
          600: "#5c5955",
          500: "#706d65",
          400: "#8a877f",
          300: "#a5a29a",
          200: "#c4c1b9",
          100: "#e3e1dc",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        hero: [
          "clamp(3.5rem, 8vw, 7rem)",
          { lineHeight: "0.95", letterSpacing: "-0.035em" },
        ],
        section: [
          "clamp(1.5rem, 3vw, 2.25rem)",
          { lineHeight: "1.15", letterSpacing: "-0.02em" },
        ],
      },
      animation: {
        "float-slow": "float 20s ease-in-out infinite",
        "float-medium": "float 14s ease-in-out infinite reverse",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "33%": { transform: "translate(30px, -20px)" },
          "66%": { transform: "translate(-20px, 15px)" },
        },
      },
    },
  },
  plugins: [],
};
