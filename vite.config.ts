import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      // SW registration is handled manually in main.tsx (PROD only)
      // to avoid the virtual:pwa-register import failing in dev.
      injectRegister: null,
      manifest: false,
      workbox: {
        // Real bug found 2026-08-20 (Carin testing fix after fix all day,
        // each confirmed live on the server, still seeing old behavior on
        // her phone) - a new service worker install used to wait until
        // every tab/PWA instance closed before taking over, so a phone
        // left open across multiple publishes kept serving a stale
        // cached bundle indefinitely. Take over immediately instead.
        skipWaiting: true,
        clientsClaim: true,
        // Cache all built assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        navigateFallback: "index.html",
        // Don't use cached fallback for API routes
        navigateFallbackDenylist: [/^\/api\//, /^\/objects\//],
        runtimeCaching: [
          {
            // Roster/store data (KPI counts, SKU lists, overview) - never
            // silently fall back to a stale cached response here. Real bug
            // found 2026-09-04: on weak in-store signal, the small
            // store-overview call would succeed live (showing a real KPI
            // count) while the heavier sku-list "All Clients" fan-out call
            // missed the 8s NetworkFirst timeout and silently served an
            // old/unrelated cached response from the shared 60-entry
            // "stockfix-api" cache - producing a KPI card and its own
            // drill-in list that genuinely disagreed, with no error shown.
            // A failed/slow load must surface as a loading or error state,
            // not a wrong number, for data reps are acting on live in-store.
            urlPattern: /^\/api\/roster\//,
            handler: "NetworkOnly",
          },
          {
            // API: network-first with short cache fallback
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "stockfix-api",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 60, maxAgeSeconds: 5 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts CSS
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            // Google Fonts files — cache aggressively (1 year)
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
