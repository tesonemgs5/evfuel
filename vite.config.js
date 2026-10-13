import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

function calcolaVersioneBuild() {
  // Usa la data dell'ULTIMO COMMIT git, non l'istante in cui gira questa
  // build: cosi' la versione resta IDENTICA sia che la build parta su
  // Vercel (subito dopo il push) sia che parta in locale ore o giorni
  // dopo (es. lanciando il file .bat per generare l'APK) -- finche' non
  // c'e' un nuovo commit, ricompilare produce sempre lo stesso numero.
  // Se il comando git fallisce per qualsiasi motivo (repo non trovato,
  // git non installato...) si ripiega sull'istante attuale, cosi' la
  // build non si blocca mai per questo.
  let ora;
  try {
    const isoCommit = execSync('git log -1 --format=%cI').toString().trim();
    ora = new Date(isoCommit);
    if (isNaN(ora.getTime())) throw new Error('data commit non valida');
  } catch {
    ora = new Date();
  }
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(ora).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const inizioAnno = new Date(Date.UTC(parseInt(parti.year, 10), 0, 1));
  const oraRoma = new Date(Date.UTC(
    parseInt(parti.year, 10), parseInt(parti.month, 10) - 1, parseInt(parti.day, 10)
  ));
  const giornoAnno = Math.floor((oraRoma - inizioAnno) / 86400000) + 1;
  const cifraAnno = parti.year.slice(-1);
  return `${cifraAnno}.${giornoAnno}.${parti.hour}${parti.minute}`;
}

// Numero di build = numero di commit del repository. E' IDENTICO su Vercel (PC),
// su GitHub Actions (APK) e in locale, perche' dipende solo dal commit: cosi' la
// versione "A.GGG.HHMM#NN" e' la stessa ovunque. Se la copia git e' parziale
// (shallow, come su Vercel) prova prima a completarla.
function calcolaNumeroBuild() {
  try {
    try {
      if (execSync('git rev-parse --is-shallow-repository', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true') {
        execSync('git fetch --unshallow --quiet', { stdio: 'ignore' })
      }
    } catch { /* non bloccante */ }
    const n = parseInt(execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 10)
    return n > 0 ? String(n) : ''
  } catch {
    return ''
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(calcolaVersioneBuild()),
    // Numero di build (conteggio commit): uguale su PC, Vercel e APK.
    __BUILD_NUM__: JSON.stringify(calcolaNumeroBuild()),
  },
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
