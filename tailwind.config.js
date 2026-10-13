/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#1E4589", 50: "#EEF3FB", 100: "#D9E4F5", 600: "#1E4589", 700: "#183970", 800: "#122C58" },
        sky: { DEFAULT: "#56BBED", 600: "#1D8FC7", 700: "#13709E" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
