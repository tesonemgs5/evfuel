import { useEffect, useState } from "react"

// Aggiornamento dell'APK: pop-up "nuova versione disponibile".
// Si sceglie in Config -> Aggiornamenti app quando controllare:
//  - "ogni"    (predefinita): all'avvio e ogni volta che l'app torna in primo piano,
//              al massimo 1 richiesta al minuto;
//  - "avvio"   : solo quando l'app parte da zero;
//  - "manuale" : mai in automatico, solo col pulsante "Controlla aggiornamenti ora".
// Nessun timer e nessun controllo in background. Funziona solo dentro l'APK.
// Versione: A.GGG.HHMM#NUMERO_BUILD (la release su GitHub ha tag vA.GGG.HHMM-NUMERO_BUILD).
const REPO = "tesonemgs5/evfuel"
const APK_URL = `https://github.com/${REPO}/releases/latest/download/evfuel.apk`
const PAUSA_MIN_MS = 60 * 1000
const CHIAVE_MODO = "evfuel_aggiornamenti_modo"
const MODI = ["ogni", "avvio", "manuale"]

export function inApk() {
  try {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform())
  } catch { return false }
}
export function leggiModo() {
  try {
    const m = localStorage.getItem(CHIAVE_MODO)
    return MODI.includes(m) ? m : "ogni"
  } catch { return "ogni" }
}
function salvaModo(m) {
  try { localStorage.setItem(CHIAVE_MODO, m) } catch { /* non bloccante */ }
}

// Versione installata: { base: "6.286.1530", build: 42 }
function installata() {
  if (typeof __APP_VERSION__ === "undefined") return null
  const build = typeof __BUILD_NUM__ !== "undefined" && __BUILD_NUM__ ? parseInt(__BUILD_NUM__, 10) || 0 : 0
  return { base: String(__APP_VERSION__), build }
}
// Dal tag "v6.286.1530-42" -> { base: "6.286.1530", build: 42 }
function daTag(tag) {
  const t = String(tag || "").replace(/^v/, "")
  const i = t.lastIndexOf("-")
  if (i < 0) return { base: t, build: 0 }
  return { base: t.slice(0, i), build: parseInt(t.slice(i + 1), 10) || 0 }
}
function parti(v) { return String(v || "").split(".").map(n => parseInt(n, 10) || 0) }
function piuNuova(a, b) { // true se a > b
  const x = parti(a.base), y = parti(b.base)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return a.build > b.build
}
function testo(v) { return v.base + (v.build ? "#" + v.build : "") }

// Stato condiviso tra il pop-up e la pagina Config
let mostraPopup = null
let inVolo = null
let ultimo = 0
let daRiprovare = false

// Esito: "nuova" | "aggiornato" | "errore" | "saltato"
export function controllaAggiornamenti({ forza = false } = {}) {
  if (inVolo) return inVolo
  const corrente = installata()
  if (!corrente) return Promise.resolve({ esito: "errore" })
  if (!forza && Date.now() - ultimo < PAUSA_MIN_MS) return Promise.resolve({ esito: "saltato" })
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    daRiprovare = true
    return Promise.resolve({ esito: "errore" })
  }
  inVolo = (async () => {
    const ctrl = new AbortController()
    const stop = setTimeout(() => ctrl.abort(), 10000)
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
        signal: ctrl.signal,
      })
      if (!r.ok) throw new Error("http " + r.status)
      const dati = await r.json()
      ultimo = Date.now()
      daRiprovare = false
      const remota = daTag(dati.tag_name)
      if (remota.base && piuNuova(remota, corrente)) {
        if (mostraPopup) mostraPopup(testo(remota))
        return { esito: "nuova", versione: testo(remota) }
      }
      return { esito: "aggiornato", versione: testo(corrente) }
    } catch {
      daRiprovare = true
      return { esito: "errore" }
    } finally {
      clearTimeout(stop)
      inVolo = null
    }
  })()
  return inVolo
}

export default function AvvisoAggiornamento() {
  const [nuova, setNuova] = useState(null)

  useEffect(() => {
    if (!inApk()) return
    const setter = v => setNuova(v)
    mostraPopup = setter

    if (leggiModo() !== "manuale") controllaAggiornamenti({ forza: true })
    const onVis = () => {
      if (document.visibilityState === "visible" && leggiModo() === "ogni") controllaAggiornamenti({ forza: false })
    }
    const onOnline = () => {
      if (daRiprovare && leggiModo() !== "manuale") controllaAggiornamenti({ forza: true })
    }
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("online", onOnline)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("online", onOnline)
      if (mostraPopup === setter) mostraPopup = null
    }
  }, [])

  if (!nuova) return null
  const corrente = installata()
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#0a0f1e",border:"1px solid rgba(0,229,255,0.4)",borderRadius:16,color:"#e2e8f0",
        width:"100%",maxWidth:360,padding:"22px 20px",textAlign:"center",
        boxShadow:"0 10px 40px rgba(0,0,0,0.5)"}}>
        <div style={{fontSize:34,marginBottom:6}}>🔔</div>
        <div style={{fontSize:17,fontWeight:800,marginBottom:8}}>Nuova versione disponibile</div>
        <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.5,marginBottom:18}}>
          Versione <b>{nuova}</b>{corrente ? <> (installata: {testo(corrente)})</> : null}.<br/>
          Vuoi scaricarla ora?
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={() => setNuova(null)}
            style={{flex:1,background:"#334155",border:"none",borderRadius:10,color:"#e2e8f0",
              padding:"12px 0",fontWeight:700,fontSize:14}}>Dopo</button>
          <button onClick={() => { window.location.href = APK_URL }}
            style={{flex:1,background:"#00b8d4",border:"none",borderRadius:10,color:"#fff",
              padding:"12px 0",fontWeight:800,fontSize:14}}>Scarica ora</button>
        </div>
      </div>
    </div>
  )
}

// Contenuto della sezione "Aggiornamenti app" nella pagina Config
const OPZIONI = [
  ["ogni", "A ogni apertura", "Controlla ogni volta che apri l'app o la riporti in primo piano. Consigliata."],
  ["avvio", "Solo all'avvio da zero", "Controlla solo quando l'app parte da chiusa del tutto."],
  ["manuale", "Solo manuale", "Nessun controllo automatico: usi il pulsante qui sotto."],
]

export function ImpostazioniAggiornamenti({ T }) {
  const [modo, setModo] = useState(leggiModo())
  const [attesa, setAttesa] = useState(false)
  const [stato, setStato] = useState(null)
  const corrente = installata()

  function scegli(m) { salvaModo(m); setModo(m) }
  async function controllaOra() {
    setAttesa(true)
    setStato(null)
    const r = await controllaAggiornamenti({ forza: true })
    setAttesa(false)
    if (r.esito === "nuova") setStato({ ok: true, testo: `🔔 Nuova versione disponibile: ${r.versione}` })
    else if (r.esito === "aggiornato") setStato({ ok: true, testo: "✅ Sei aggiornato" })
    else setStato({ ok: false, testo: "❌ Non riesco a controllare: verifica la connessione e riprova" })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: "0.7rem", color: T.text2 }}>
        Scegli quando l'app controlla se c'è una versione nuova. Se c'è, compare un pop-up con
        "Scarica ora" oppure "Dopo". Versione installata: <b>{corrente ? testo(corrente) : "dev"}</b>
      </div>
      {OPZIONI.map(([v, titolo, sub]) => {
        const attiva = modo === v
        return (
          <button key={v} onClick={() => scegli(v)}
            style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
              background: attiva ? T.accent : T.bg2, color: attiva ? "#fff" : T.text,
              border: `2px solid ${attiva ? T.accent : T.border}` }}>
            <div style={{ fontWeight: 800, fontSize: "0.8rem" }}>{attiva ? "● " : "○ "}{titolo}</div>
            <div style={{ fontSize: "0.68rem", marginTop: 2, opacity: attiva ? 0.9 : 0.75 }}>{sub}</div>
          </button>
        )
      })}
      <button onClick={controllaOra} disabled={attesa}
        style={{ width: "100%", background: "none", border: `1px solid ${T.accent}`, borderRadius: 10, color: T.accent,
          padding: "10px 0", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer", opacity: attesa ? 0.6 : 1 }}>
        {attesa ? "⏳ Controllo in corso..." : "🔄 Controlla aggiornamenti ora"}
      </button>
      {stato && (
        <div style={{ fontSize: "0.8rem", textAlign: "center", fontWeight: 700, color: stato.ok ? "#22c55e" : "#ef4444" }}>{stato.testo}</div>
      )}
    </div>
  )
}
