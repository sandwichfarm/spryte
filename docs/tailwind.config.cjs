module.exports = {
  content: ["./src/**/*.{html,svelte,ts}", "./index.html"],
  theme: {
    extend: {},
  },
  plugins: [require("@tailwindcss/typography")],
};
