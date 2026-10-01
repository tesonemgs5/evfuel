import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'

// Il service worker serve SOLO nella versione web/PWA, per aprire l'app
// senza rete. Dentro l'APK (Capacitor) i file dell'app sono già sul
// telefono: il service worker è superfluo e, peggio, dopo un aggiornamento
// dell'APK continuerebbe a servire il codice VECCHIO messo in cache. Qui
// quindi non lo si registra e si eliminano quelli e le cache eventualmente
// rimasti da installazioni precedenti.
const staGirandoInCapacitor =
  (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) ||
  window.location.protocol === 'capacitor:' ||
  /capacitor/i.test(navigator.userAgent || '')

if (staGirandoInCapacitor) {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => regs.forEach(r => r.unregister()))
        .catch(() => {})
    }
    if ('caches' in window) {
      caches.keys()
        .then(nomi => nomi.forEach(n => caches.delete(n)))
        .catch(() => {})
    }
  } catch { /* non bloccante */ }
} else {
  // Quando il service worker trova una versione nuova, la attiva subito e
  // ricarica una volta: cosi' la versione non resta bloccata su quella vecchia.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { updateSW(true) }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
