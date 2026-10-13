import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";


export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { target: "es2020", rollupOptions: { output: { manualChunks: { vendor: ["react", "react-dom", "react-router-dom"], supabase: ["@supabase/supabase-js"], query: ["@tanstack/react-query"] } } } },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "Academy OS", short_name: "STEM Academy",
        description: "ORT SA STEM & IT Academy departmental management platform",
        theme_color: "#1E4589", background_color: "#ffffff", display: "standalone", start_url: "/dashboard", scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/submit\//],
        // App shell is precached. Supabase API/Storage calls are NEVER cached (private data).
        runtimeCaching: [],
      },
    }),
  ],
});
