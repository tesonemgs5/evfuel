import { defineConfig } from 'vite'
import { writeFileSync } from 'node:fs'

// Su Vercel la versione mostrata dall'app web e' l'ora del deploy
// (fuso Europe/Rome), nel formato A.GGG.HHMM. In locale (build APK) resta
// quella scritta in src/version.js dallo script di build.
if (process.env.VERCEL) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map(x => [x.type, x.value])
  )
  const giorno = Math.round(
    (Date.UTC(+p.year, +p.month - 1, +p.day) - Date.UTC(+p.year, 0, 0)) / 86400000
  )
  const versione = `${String(p.year).slice(-1)}.${String(giorno).padStart(3, '0')}.${p.hour}${p.minute}`
  writeFileSync(new URL('./src/version.js', import.meta.url), `export const APP_VERSION = "${versione}";\n`)
}

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
