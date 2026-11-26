import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// The app always calls relative /api/... paths.
// Locally Vite proxies them to scripts/local_api.py; on AWS CloudFront routes /api/* to API Gateway.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": a new version waits until every tab is closed, so it never swaps the app under an open case
      // (the case lives only in memory). There is no prompt UI; the update applies on the next fresh open.
      registerType: "prompt",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "favicon.svg", "samples/*.jpg", "audio/**/*.mp3", "eval-report.md"],
      manifest: {
        name: "Asli Ya Nakli?",
        short_name: "Asli Ya Nakli",
        description: "Paid a scammer? Get your 1930 call script and cybercrime report pack in seconds.",
        theme_color: "#14513f",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        // App shell, samples and Saathi audio are precached, so they open with no network.
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,mp3,json,webmanifest,md}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [], // never cache API responses
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [".."] }, // rules are imported from ../backend/rules (one source of truth)
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
  },
});
