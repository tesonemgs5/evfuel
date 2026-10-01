import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' invece di 'autoUpdate': con autoUpdate, ad ogni apertura o
      // reload il service worker controlla subito se c'è una versione più
      // recente. Se quel controllo fallisce per assenza di rete (proprio il
      // caso "utente offline che ricarica la pagina"), il worker già attivo
      // può finire in stato 'redundant' e smettere di servire la cache,
      // rompendo lo scenario offline. Con 'prompt' il worker attivo resta
      // sempre in servizio.
      registerType: 'prompt',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'EVFuel',
        short_name: 'EVFuel',
        description: 'Registro ricariche auto elettrica',
        theme_color: '#0a0f1e',
        background_color: '#0a0f1e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Qualsiasi apertura o ricarica della pagina offline viene servita
        // dalla index.html già in cache, invece della pagina di errore del
        // browser.
        navigateFallback: '/index.html',
        // Denylist vuota: senza, in alcune versioni di Workbox il fallback
        // non viene applicato agli URL con querystring (es. ?v=123, usato
        // come cache-buster), che andrebbero in rete e fallirebbero offline.
        navigateFallbackDenylist: []
      }
    })
  ]
})
