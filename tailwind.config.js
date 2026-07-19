/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eff8f3", 100: "#d9efe2", 200: "#b5dfc7", 300: "#83c8a2", 400: "#4eaa79", 500: "#2d8c60", 600: "#1e704c", 700: "#195a3f", 800: "#174834", 900: "#143c2c" },
      },
      fontFamily: { sans: ["var(--font-sans)", "sans-serif"], mono: ["var(--font-mono)", "monospace"] },
      boxShadow: { card: "0 1px 2px rgb(15 23 42 / .04), 0 12px 30px rgb(15 23 42 / .05)" },
    },
  },
  plugins: [],
};
