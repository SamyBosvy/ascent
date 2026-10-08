// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0") + `+"-${Date.now()}"` },
    plugins: [
      VitePWA({
        // The worker is generated only for production builds; it is registered by src/lib/pwa.ts.
        registerType: "prompt",
        injectRegister: null,
        manifest: false, // public/manifest.webmanifest is the manifest
        filename: "sw.js",
        devOptions: { enabled: false },
        workbox: {
          // App shell: hashed JS/CSS, self-hosted fonts, icons and the manifest.
          globPatterns: ["**/*.{js,css,woff2,png,svg,ico,webmanifest}"],
          globIgnores: ["**/server/**", "**/_worker.js/**"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // HTML is always fetched fresh; the last copy is used only when offline.
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && url.origin === self.location.origin && !url.pathname.startsWith("/~oauth") && !url.pathname.startsWith("/api/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "ascent-pages",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 40, maxAgeSeconds: 30 * 86400 },
                matchOptions: { ignoreSearch: true },
                plugins: [
                  {
                    // Offline and this page was never opened: fall back to Today's shell.
                    handlerDidError: async () => (await caches.open("ascent-pages").then((c) => c.match("/today", { ignoreSearch: true }))) ?? Response.error(),
                  },
                ],
              },
            },
          ],
        },
      }),
    ],
    optimizeDeps: {
      include: [
        "@radix-ui/react-tabs",
        "@radix-ui/react-dialog",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-label",
        "@radix-ui/react-slot",
        "react-markdown",
        "papaparse",
        "recharts",
        "date-fns",
        "sonner",
        "lucide-react",
      ],
    },
  },
});
