import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: Number(process.env.PORT) || 8080,
    allowedHosts: true,
    hmr: { overlay: false },
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // registro feito manualmente em main.tsx (controle do reload)
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Pré-cacheia os assets leves (JS/CSS/ícones/imagens). O HTML
        // continua vindo da rede para evitar chunks antigos após deploy.
        globPatterns: ["**/*.{js,css,ico,jpg,jpeg,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Limpa caches de versões antigas automaticamente
        cleanupOutdatedCaches: true,
        // SPA: serve index.html para todas as rotas (network-first para HTML)
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/firebase-sync/],
        // index.html: sempre busca da rede, usa cache só se offline
        navigationPreload: true,
        runtimeCaching: [
          // Imagens do Firebase Storage — cache 7 dias
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "firebase-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Firestore REST — NetworkFirst (tenta rede, fallback cache 1h)
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "firestore-data",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts — cache longo
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "NikkeyBox - Importados do Japão",
        short_name: "NikkeyBox",
        description: "Produtos originais do Japão entregues com cuidado.",
        start_url: "/?hero=transition&utm_source=pwa",
        display: "standalone",
        background_color: "#8b5cf6",
        theme_color: "#a855f7",
        lang: "pt-BR",
        icons: [
          { src: "/icons/icon-192x192.png?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-splash-512x512.png?v=9", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512x512.png?v=9", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        // Divide bibliotecas pesadas em chunks separados (melhor cache entre
        // deploys e download paralelo). As páginas já são lazy via React.lazy.
        manualChunks(id) {
          const moduleId = id.includes('\\') ? id.replaceAll('\\', '/') : id;
          if (!moduleId.includes('/node_modules/')) return undefined;
          if (/\/node_modules\/(?:react|react-dom|react-router|react-router-dom)\//.test(moduleId)) return 'react-vendor';
          if (/\/node_modules\/(?:firebase\/firestore|@firebase\/firestore(?:-compat)?|@firebase\/webchannel-wrapper)\//.test(moduleId)) return 'firebase-firestore';
          if (/\/node_modules\/(?:firebase\/auth|@firebase\/auth(?:-compat)?)\//.test(moduleId)) return 'firebase-auth';
          if (/\/node_modules\/(?:firebase\/storage|@firebase\/storage(?:-compat)?)\//.test(moduleId)) return 'firebase-storage';
          if (/\/node_modules\/(?:firebase\/analytics|@firebase\/analytics(?:-compat)?)\//.test(moduleId)) return 'firebase-analytics';
          if (moduleId.includes('/node_modules/firebase/') || moduleId.includes('/node_modules/@firebase/')) return 'firebase-core';
          // `recharts` NÃO entra aqui de propósito. Todo manual chunk vira um
          // `<link rel="modulepreload">` no index.html, ou seja, é baixado com
          // prioridade alta em TODA visita — inclusive na home, no celular.
          // São 101 KB de biblioteca de gráficos usada só no painel admin.
          // Deixando fora, ela viaja dentro do chunk lazy do Admin e só desce
          // quando o administrador abre o dashboard.
          if (moduleId.includes('/node_modules/@tanstack/react-query/')) return 'query';
          return undefined;
        },
      },
    },
  },
}));
