import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from './version';

// Rileva se l'app è eseguita come APK nativo Capacitor
export const isNativeCapacitor = () => {
  return Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:';
};

// Pulisce CacheStorage/ServiceWorker ad ogni cambio versione senza cancellare i dati utente
export const purgaCacheInutile = async () => {
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.log('CacheStorage svuotato.');
    } catch (e) {
      console.warn('Impossibile svuotare caches:', e);
    }
  }
};

const SUPABASE_URL = "https://qvumsogedmqqrytvoajh.supabase.co";
const SUPABASE_KEY = "sb_publishable_vxNzIfXIV6Qm1ZmMEtfk3Q_q7N-rc_z";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------
// FUNZIONAMENTO OFFLINE: cache locale + coda di sincronizzazione.
// Ogni modifica (salva / modifica / cancella) va PRIMA nella cache locale
// (mgs5_ricariche), cosi' l'utente la vede subito anche senza rete; poi
// viene messa in una coda (mgs5_coda_sync) che si svuota verso Supabase
// appena c'e' connessione. Le ricariche create offline hanno un id
// temporaneo ("loc_...") sostituito con quello vero dopo l'insert.
// ---------------------------------------------------------------------
const LS_RICARICHE = 'mgs5_ricariche';
const LS_CODA = 'mgs5_coda_sync';
const LS_CODA_SCARTATE = 'mgs5_coda_scartate';

const generaIdTemp = () => 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isIdTemp = id => typeof id === 'string' && id.startsWith('loc_');
const nuovoOpId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function leggiCoda() {
  try {
    const raw = localStorage.getItem(LS_CODA);
    const c = raw ? JSON.parse(raw) : [];
    return Array.isArray(c) ? c : [];
  } catch { return []; }
}
function scriviCoda(coda) {
  try { localStorage.setItem(LS_CODA, JSON.stringify(coda)); } catch { /* non bloccante */ }
}
function salvaCacheLocale(lista) {
  try { localStorage.setItem(LS_RICARICHE, JSON.stringify(lista)); } catch { /* non bloccante */ }
}
function leggiCacheLocale() {
  try {
    const raw = localStorage.getItem(LS_RICARICHE);
    return raw ? ricalcolaKmParziali(JSON.parse(raw).map(sanitizzaRicarica)) : null;
  } catch { return null; }
}

// Accoda un salvataggio. Se la ricarica e' ancora solo locale (id temporaneo)
// si aggiorna l'insert gia' in coda; se ha un id vero si accoda/aggiorna un update.
// "v" conta le modifiche: serve a capire se un'operazione e' cambiata mentre
// veniva inviata.
function accodaSalvataggio(id, payload) {
  const coda = leggiCoda();
  if (isIdTemp(id)) {
    const op = coda.find(o => o.tipo === 'insert' && o.tempId === id);
    if (op) { op.payload = payload; op.v = (op.v || 0) + 1; }
    else coda.push({ opId: nuovoOpId(), tipo: 'insert', tempId: id, payload, ts: Date.now(), v: 0 });
  } else {
    const op = coda.find(o => o.tipo === 'update' && o.id === id);
    if (op) { op.payload = payload; op.ts = Date.now(); op.v = (op.v || 0) + 1; }
    else coda.push({ opId: nuovoOpId(), tipo: 'update', id, payload, ts: Date.now(), v: 0 });
  }
  scriviCoda(coda);
}

// Accoda una cancellazione. Una ricarica solo locale non ha mai raggiunto il
// server: basta toglierla dalla coda. Una con id vero: si scartano gli update
// in sospeso (inutili) e si accoda il delete.
function accodaCancellazione(id) {
  let coda = leggiCoda();
  if (isIdTemp(id)) {
    coda = coda.filter(o => !(o.tipo === 'insert' && o.tempId === id));
  } else {
    coda = coda.filter(o => !(o.tipo === 'update' && o.id === id));
    coda.push({ opId: nuovoOpId(), tipo: 'delete', id, ts: Date.now(), v: 0 });
  }
  scriviCoda(coda);
}

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwE6U_h_lUBuNOOGedHxs7nAiLuP71YUcSmpbGZn1TyjusCmdmszC6Qqh7o4carU49l/exec";

const MESI_NOMI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

const DEFAULT_SETTINGS = { batteria: 64, prezzo: 0.20, luogo: 'CASA', targa: 'MGS5', p1a: 20, p1b: 30, p2a: 80, p2b: 100 };

const THEMES = {
  dark: {
    bg: '#0a0f1e', bg2: 'rgba(255,255,255,0.04)', border: 'rgba(0,229,255,0.15)',
    accent: '#00e5ff', accent2: '#7c3aed', green: '#10b981',
    text: '#e2e8f0', text2: '#94a3b8', headerBg: 'rgba(10,15,30,0.95)', navBg: '#0a0f1e'
  },
  light: {
    bg: '#f0f4f8', bg2: 'rgba(0,0,0,0.04)', border: 'rgba(0,140,200,0.25)',
    accent: '#0070a8', accent2: '#5b21b6', green: '#047857',
    text: '#1e293b', text2: '#64748b', headerBg: 'rgba(240,244,248,0.95)', navBg: '#f0f4f8'
  }
};

const S = THEMES.dark;

const inputSt = (theme) => ({
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${theme.border}`,
  borderRadius: 10, color: theme.text, fontFamily: 'monospace', fontSize: '1rem',
  padding: '10px 12px', width: '100%', outline: 'none', boxSizing: 'border-box',
  MozAppearance: 'textfield', appearance: 'textfield'
});

const chipSt = (theme) => ({
  padding: '4px 10px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)',
  borderRadius: 20, color: (theme || S).accent, fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'pointer'
});



function today() { return new Date().toISOString().split('T')[0]; }
// ---- formato italiano: punto = migliaia, virgola = decimali ----
function fmtN(v, max = 2, min = max) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  let t = Math.abs(n).toFixed(max);
  if (max > min && t.includes('.')) {
    let [i, d] = t.split('.');
    while (d.length > min && d.endsWith('0')) d = d.slice(0, -1);
    t = d.length ? i + '.' + d : i;
  }
  const [i, d] = t.split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const neg = n < 0 && Number(t) !== 0;
  return (neg ? '-' : '') + g + (d ? ',' + d : '');
}
// testo digitato (es. "1.234,5") -> numero (NaN se vuoto)
function parseIt(s) {
  if (s === null || s === undefined || s === '') return NaN;
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
}
function groupInt(i) { return i.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
// numero -> testo per i campi di input
function toInputStr(v, group = false) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '';
  const [i, d] = String(Number(v)).split('.');
  return (group ? groupInt(i) : i) + (d ? ',' + d.padEnd(2, '0') : '');
}
// numero intero senza decimali, altrimenti sempre 2 decimali (per le scale dei grafici)
function fmtD(v) { return Number.isInteger(Math.round(Number(v) * 1e6) / 1e6) ? fmtN(v, 0) : fmtN(v, 2); }

// Campo numerico: il punto diventa virgola, le migliaia (se group) si mettono da sole.
function NumInput({ value, onChange, decimals = true, group = false, style, placeholder }) {
  const ref = useRef(null);
  const caretRef = useRef(null);
  useEffect(() => {
    if (caretRef.current !== null && ref.current && document.activeElement === ref.current) {
      try { ref.current.setSelectionRange(caretRef.current, caretRef.current); } catch (_) {}
    }
    caretRef.current = null;
  });
  const handle = (e) => {
    const el = e.target;
    let r = el.value;
    let c = el.selectionStart ?? r.length;
    const typed = e.nativeEvent && e.nativeEvent.data;
    if (decimals) {
      if (!group) r = r.replace(/\./g, ',');
      else if (typed === '.' && c > 0 && r[c - 1] === '.') r = r.slice(0, c - 1) + ',' + r.slice(c);
    }
    // quanti caratteri "veri" (cifre e virgola) stanno prima del cursore
    const keepCh = ch => /\d/.test(ch) || (decimals && ch === ',');
    let k = 0;
    for (let i = 0; i < Math.min(c, r.length); i++) if (keepCh(r[i])) k++;
    let clean = '', seenComma = false;
    for (const ch of r) {
      if (/\d/.test(ch)) clean += ch;
      else if (decimals && ch === ',' && !seenComma) { clean += ch; seenComma = true; }
    }
    let [i, d] = clean.split(',');
    const out = (group ? groupInt(i) : i) + (clean.includes(',') ? ',' + (d || '') : '');
    // posizione del cursore nel testo formattato
    let pos = 0, cnt = 0;
    while (pos < out.length && cnt < k) { if (keepCh(out[pos])) cnt++; pos++; }
    caretRef.current = pos;
    onChange(out);
  };
  const pad = () => {
    if (!decimals || !value || !String(value).includes(',')) return;
    const [i, d] = String(value).split(',');
    const out = (i === '' ? '0' : i) + ',' + (d || '').padEnd(2, '0');
    if (out !== value) onChange(out);
  };
  return <input ref={ref} type="text" inputMode={decimals ? 'decimal' : 'numeric'} autoComplete="off" value={value} onChange={handle} onBlur={pad} placeholder={placeholder} style={style} />;
}
// versione per i valori numerici delle impostazioni
function SetNum({ value, onValue, decimals = true, group = false, style }) {
  const [t, setT] = useState(toInputStr(value, group));
  useEffect(() => { if (parseIt(t) !== Number(value)) setT(toInputStr(value, group)); /* eslint-disable-next-line */ }, [value]);
  return <NumInput value={t} decimals={decimals} group={group} style={style}
    onChange={(x) => { setT(x); const n = parseIt(x); if (!isNaN(n)) onValue(n); }} />;
}

function toNum(x, def = 0) { const n = Number(x); return Number.isFinite(n) ? n : def; }

// kWh da usare nei calcoli: effettivi se inseriti, altrimenti teorici.
function kwhUsati(r) {
  if (r && r.kwhEff !== null && r.kwhEff !== undefined) return Number(r.kwhEff) || 0;
  return Number(r?.kwhTeor) || 0;
}

function normalizzaData(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0, 10);
  const dt = new Date(d);
  if (!isNaN(dt)) return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  return String(d).slice(0, 10);
}

function sanitizzaRicarica(r) {
  const pctPrima = toNum(r?.pct_prima ?? r?.pctPrima, 0);
  const pctDopo  = toNum(r?.pct_dopo  ?? r?.pctDopo,  0);
  const kwhEffRaw = r?.kwh_eff ?? r?.kwhEff;
  const kwhEff   = (kwhEffRaw === null || kwhEffRaw === undefined || kwhEffRaw === '') ? null : toNum(kwhEffRaw, null);
  const prezzoKwh = toNum(r?.prezzo_kwh ?? r?.prezzoKwh, 0);
  const kwhTeorV = toNum(r?.kwh_teor ?? r?.kwhTeor, 0);
  const costoRaw = toNum(r?.costo, 0);
  // costo = kWh effettivi x prezzo; se i kWh effettivi mancano si usano i teorici
  const kwhBase  = kwhEff !== null ? kwhEff : kwhTeorV;
  const costo    = prezzoKwh > 0 ? kwhBase * prezzoKwh : costoRaw;
  const luogo = ((r?.luogo || '').toString().trim().toUpperCase()) || '';
  return {
    id: r?.id || null,
    luogo,
    data: normalizzaData(r?.data),
    kwhEff,
    kwhTeor: kwhTeorV,
    costo,
    prezzoKwh,
    pctPrima,
    pctDopo,
    kwh100: r?.kwh_100 != null ? toNum(r.kwh_100, null) : (r?.kwh100 != null ? toNum(r.kwh100, null) : null),
    km: r?.km != null ? toNum(r.km, null) : null,
    kmParziali: r?.km_parziali != null ? toNum(r.km_parziali, null) : (r?.kmParziali != null ? toNum(r.kmParziali, null) : null),
  };
}

// Step 1: calcola kmParziali reali (km percorsi dall'odometro rispetto alla ricarica precedente).
// Questo valore è sempre affidabile, indipendentemente dalle percentuali di ricarica.
function calcolaKmParzialiReali(lista) {
  return lista.map((r, i) => {
    if (r.km && r.km > 0) {
      const prev = lista.slice(0, i).filter(x => x.km && x.km > 0).pop();
      if (!prev) return { ...r, kmParziali: r.km };
      return { ...r, kmParziali: r.km - prev.km };
    }
    return r;
  });
}

// Step 2: calcola kwh100 usando la logica del "blocco chiuso da 80% esatto".
// Una ricarica che arriva esattamente a pctDopo === 80 chiude il blocco: il consumo
// mostrato su quella ricarica è la somma di tutti i kWh e km del blocco (comprese
// eventuali ricariche intermedie sovrapposte, che restano senza kwh100 proprio).
// Ricariche che arrivano oltre 80 (es. 90, 100) NON chiudono il blocco: restano "in sospeso"
// e il loro kWh/km confluiscono nel blocco che si chiuderà alla prossima ricarica esatta all'80%.
// Se i kWh effettivi non sono inseriti si usano i kWh teorici; quando si inseriscono gli
// effettivi il consumo viene ricalcolato con quelli.
function applicaLogicaBlocco80(lista) {
  const risultato = lista.map(r => ({ ...r, kwh100: null }));
  let blocco = { kwhTot: 0, kmTot: 0, completo: true, indici: [] };

  for (let i = 0; i < risultato.length; i++) {
    const r = risultato[i];
    const km = Number(r.kmParziali) || 0;
    const kwhR = kwhUsati(r);
    const haKwh = kwhR > 0;

    blocco.kmTot += km;
    blocco.indici.push(i);
    if (haKwh) {
      blocco.kwhTot += kwhR;
    } else {
      blocco.completo = false; // manca un dato: il blocco non può dare un consumo affidabile
    }

    const pctDopoNum = r.pctDopo > 1 ? r.pctDopo : r.pctDopo * 100;
    const chiudeBlocco = Math.round(pctDopoNum) === 80;

    if (chiudeBlocco) {
      if (blocco.completo && blocco.kmTot > 0) {
        const kwh100Aggregato = (blocco.kwhTot / blocco.kmTot) * 100;
        risultato[i] = { ...r, kwh100: kwh100Aggregato };
      }
      // reset per il prossimo blocco, indipendentemente dall'esito
      blocco = { kwhTot: 0, kmTot: 0, completo: true, indici: [] };
    }
  }

  return risultato;
}

function ricalcolaKmParziali(lista) {
  const conKm = calcolaKmParzialiReali(lista);
  return applicaLogicaBlocco80(conKm);
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, color = '#10b981') => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2500);
  };
  return { toast, show };
}

function niceScale(min, max, n = 6) {
  const range = (max - min) || Math.abs(max) || 1;
  const raw = range / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const stepN = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = stepN * mag;
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi <= lo) hi = lo + step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(parseFloat(v.toFixed(6)));
  return { lo, hi: ticks[ticks.length - 1], ticks };
}

// Grafico a linea a tutta larghezza, con zoom e spostamento del periodo.
// data: [{ label, titolo, y }]  (tutti i dati; initialVisible = quanti punti mostrare all'inizio)
function ChartLinea({ title, data, initialVisible, labelW = 40, color, theme, formatTick, formatValue }) {
  const T = theme || S;
  const n = data.length;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [W, setW] = useState(340);
  const initView = () => {
    const span = Math.max(Math.min(initialVisible, n) - 1, 0);
    return { start: Math.max(n - 1 - span, 0), span };
  };
  const [view, setViewState] = useState(initView);
  const viewRef = useRef(view);
  const [sel, setSel] = useState(null);
  const ptrs = useRef(new Map());
  const g = useRef({ moved: false, lastTap: 0 });

  const H = 230, L = 36, R = 6, Tm = 14, B = 26, PAD = 9;
  const pw = W - L - R - PAD * 2, ph = H - Tm - B;
  const minSpan = Math.min(2, Math.max(n - 1, 0));
  const maxSpan = Math.max(n - 1, 0);

  const setView = (v) => { viewRef.current = v; setViewState(v); };
  const clampView = (start, span) => {
    span = Math.min(Math.max(span, minSpan), maxSpan);
    start = Math.min(Math.max(start, 0), Math.max(maxSpan - span, 0));
    return { start, span };
  };
  const reset = () => { setView(initView()); setSel(null); };

  // nuova ricarica / dati cambiati: torna alla vista iniziale
  useEffect(() => { reset(); /* eslint-disable-next-line */ }, [n]);

  // larghezza reale del contenitore
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const upd = () => { const w = el.getBoundingClientRect().width; if (w > 50) setW(w); };
    upd();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', upd); return () => window.removeEventListener('resize', upd); }
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // zoom: factor < 1 ingrandisce (meno periodo), > 1 riduce. frac = punto fisso (0..1 sulla larghezza)
  const zoomBy = (factor, frac = 0.5) => {
    const v = viewRef.current;
    const c = v.start + frac * v.span;
    const span = Math.min(Math.max(v.span * factor, minSpan), maxSpan);
    setView(clampView(c - frac * span, span));
  };
  const panBy = (idx) => { const v = viewRef.current; setView(clampView(v.start + idx, v.span)); };

  // rotella del mouse = zoom (listener nativo per poter bloccare lo scroll della pagina)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const frac = Math.min(Math.max((e.clientX - rect.left - L - PAD) / (pw || 1), 0), 1);
      zoomBy(e.deltaY > 0 ? 1.2 : 1 / 1.2, frac);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line
  }, [pw, n]);

  if (!n) return (
    <div ref={wrapRef} style={{ padding: '14px 12px', color: T.text2, fontSize: '0.75rem' }}>
      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      Nessun dato
    </div>
  );

  const { start, span } = view;
  const end = start + span;
  const px = i => (span === 0 ? L + PAD + pw / 2 : L + PAD + ((i - start) / span) * pw);

  // scala verticale calcolata solo sui punti visibili
  const i0 = Math.max(Math.ceil(start - 1e-9), 0), i1 = Math.min(Math.floor(end + 1e-9), n - 1);
  let vis = [];
  for (let i = i0; i <= i1; i++) vis.push(data[i].y);
  if (!vis.length) vis = [data[Math.min(Math.round(start), n - 1)].y];
  const { lo, hi, ticks } = niceScale(Math.min(...vis), Math.max(...vis));
  const py = y => Tm + ph - ((y - lo) / (hi - lo || 1)) * ph;
  const baseY = Tm + ph;

  const a = Math.max(Math.floor(start) - 1, 0), b = Math.min(Math.ceil(end) + 1, n - 1);
  const idxs = [];
  for (let i = a; i <= b; i++) idxs.push(i);
  const pts = idxs.map(i => `${px(i)},${py(data[i].y)}`).join(' ');
  const gradId = 'gc' + color.replace(/[^a-z0-9]/gi, '');
  const clipId = 'cl' + gradId;

  const pxPerIdx = span === 0 ? pw : pw / span;
  const every = Math.max(1, Math.ceil((labelW + 6) / pxPerIdx));

  // tooltip
  let tip = null;
  if (sel !== null && sel >= start - 1e-9 && sel <= end + 1e-9) {
    const d = data[sel];
    const riga1 = d.titolo || d.label;
    const riga2 = formatValue(d.y);
    const w = Math.max(riga1.length, riga2.length) * 6.4 + 16;
    const h = 34;
    const bx = Math.min(Math.max(px(sel) - w / 2, L), W - R - w);
    let by = py(d.y) - h - 10;
    if (by < 0) by = py(d.y) + 12;
    tip = (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={bx} y={by} width={w} height={h} rx="7" fill={T.bg} stroke={color} strokeWidth="1" />
        <text x={bx + w / 2} y={by + 13} textAnchor="middle" fontSize="10" fill={T.text2}>{riga1}</text>
        <text x={bx + w / 2} y={by + 27} textAnchor="middle" fontSize="12" fontWeight="700" fill={T.text}>{riga2}</text>
      </g>
    );
  }

  // gesti: 1 dito = sposta, 2 dita = zoom, tocco = valore, doppio tocco = reset
  const rel = (e) => { const r = svgRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e) => {
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    const p = rel(e);
    ptrs.current.set(e.pointerId, p);
    const gg = g.current;
    if (ptrs.current.size === 1) { gg.moved = false; gg.sx = p.x; gg.sy = p.y; }
    else { gg.moved = true; }
    gg.lastX = p.x;
    if (ptrs.current.size === 2) { const [p1, p2] = [...ptrs.current.values()]; gg.lastDist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1; }
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const p = rel(e);
    ptrs.current.set(e.pointerId, p);
    const gg = g.current;
    if (ptrs.current.size === 1) {
      if (Math.abs(p.x - gg.sx) > 6 || Math.abs(p.y - gg.sy) > 6) gg.moved = true;
      if (gg.moved) {
        const v = viewRef.current;
        const dx = p.x - gg.lastX;
        setView(clampView(v.start - (dx / (pw || 1)) * v.span, v.span));
      }
      gg.lastX = p.x;
    } else if (ptrs.current.size === 2) {
      const [p1, p2] = [...ptrs.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const mid = (p1.x + p2.x) / 2;
      const frac = Math.min(Math.max((mid - L - PAD) / (pw || 1), 0), 1);
      zoomBy(gg.lastDist / dist, frac);
      gg.lastDist = dist;
    }
  };
  const onUp = (e, cancelled) => {
    const gg = g.current;
    const p = ptrs.current.get(e.pointerId);
    const wasSingle = ptrs.current.size === 1;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 1) { gg.lastX = [...ptrs.current.values()][0].x; }
    if (!cancelled && wasSingle && !gg.moved && p) {
      const now = Date.now();
      if (now - gg.lastTap < 320) { gg.lastTap = 0; reset(); return; }
      gg.lastTap = now;
      let best = null, bd = 22;
      for (let i = Math.max(i0, 0); i <= i1; i++) {
        const d = Math.hypot(px(i) - p.x, py(data[i].y) - p.y);
        if (d < bd) { bd = d; best = i; }
      }
      setSel(best !== null && best !== sel ? best : null);
    }
  };

  const btn = { width: 28, height: 26, padding: 0, background: 'rgba(0,229,255,0.08)', border: `1px solid ${T.border}`, borderRadius: 8, color: T.accent, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', lineHeight: 1 };
  const primo = data[Math.min(Math.max(Math.round(start), 0), n - 1)].titolo || data[Math.round(start)].label;
  const ultimo = data[Math.min(Math.max(Math.round(end), 0), n - 1)].titolo || data[Math.round(end)].label;

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <div style={{ padding: '12px 10px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.65rem', color: T.text2, textTransform: 'uppercase' }}>{title}</div>
          <div style={{ fontSize: '0.6rem', color: T.text2, opacity: 0.8, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{primo} → {ultimo}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => panBy(-Math.max(span / 2, 0.5))} style={btn} aria-label="Indietro">◀</button>
          <button onClick={() => panBy(Math.max(span / 2, 0.5))} style={btn} aria-label="Avanti">▶</button>
          <button onClick={() => zoomBy(1.5)} style={btn} aria-label="Riduci">−</button>
          <button onClick={() => zoomBy(1 / 1.5)} style={btn} aria-label="Ingrandisci">+</button>
          <button onClick={reset} style={btn} aria-label="Reimposta">⟲</button>
        </div>
      </div>
      <svg ref={svgRef} width={W} height={H}
        style={{ display: 'block', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
        onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={(e) => onUp(e, false)} onPointerCancel={(e) => onUp(e, true)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}><rect x={L} y={Tm - 8} width={W - L - R} height={ph + 16} /></clipPath>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke={T.text2} strokeOpacity="0.35" strokeWidth="0.7" />
            <text x={L - 4} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill={T.text2}>{formatTick(t)}</text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {idxs.length > 1 && <polygon points={`${px(a)},${baseY} ${pts} ${px(b)},${baseY}`} fill={`url(#${gradId})`} />}
          {idxs.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />}
          {tip === null ? null : <line x1={px(sel)} x2={px(sel)} y1={Tm} y2={baseY} stroke={color} strokeWidth="0.8" strokeDasharray="3 3" />}
          {idxs.map(i => (
            <circle key={i} cx={px(i)} cy={py(data[i].y)} r={sel === i ? 6 : 4} fill={color} />
          ))}
        </g>
        {idxs.filter(i => i >= start - 1e-9 && i <= end + 1e-9 && (n - 1 - i) % every === 0).map(i => (
          <text key={'l' + i} x={Math.min(Math.max(px(i), L + labelW / 2 - PAD), W - R - labelW / 2 + PAD)} y={H - 8} textAnchor="middle" fontSize="10" fill={sel === i ? T.text : T.text2}>{data[i].label}</text>
        ))}
        {tip}
      </svg>
    </div>
  );
}

function fmtLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtIt(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '…'; }

// Riepilogo con selezione del periodo.
function RiepilogoPeriodo({ ricariche, theme }) {
  const T = theme || S;
  const [per, setPer] = useState('tutto');
  const [dal, setDal] = useState('');
  const [al, setAl] = useState('');
  const oggi = new Date();
  let da = '', a = '';
  if (per === 'mese') da = fmtLocal(new Date(oggi.getFullYear(), oggi.getMonth(), 1));
  else if (per === '3mesi') da = fmtLocal(new Date(oggi.getFullYear(), oggi.getMonth() - 3, oggi.getDate()));
  else if (per === 'anno') da = oggi.getFullYear() + '-01-01';
  else if (per === 'custom') { da = dal; a = al; }

  const filtrate = ricariche.filter(r => r.data && (!da || r.data >= da) && (!a || r.data <= a));
  const tot = filtrate.reduce((acc, r) => {
    acc.costo += Number(r.costo) || 0;
    acc.kwh += kwhUsati(r);
    acc.km += Number(r.kmParziali) || 0;
    return acc;
  }, { costo: 0, kwh: 0, km: 0 });

  const opzioni = [['tutto', 'Tutto'], ['mese', 'Mese'], ['3mesi', '3 mesi'], ['anno', 'Anno'], ['custom', 'Periodo']];
  const etichetta = per === 'tutto' ? 'Tutto lo storico' : `${fmtIt(da)} – ${fmtIt(a || fmtLocal(oggi))}`;
  const dateSt = { ...inputSt(T), fontSize: '0.8rem', padding: '8px 10px' };

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 10px' }}>
      <div style={{ fontSize: '0.65rem', color: T.text2, marginBottom: 10, textTransform: 'uppercase' }}>Riepilogo</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {opzioni.map(([id, nome]) => (
          <button key={id} onClick={() => setPer(id)} style={{
            ...chipSt(T),
            background: per === id ? T.accent : 'rgba(0,229,255,0.08)',
            color: per === id ? T.bg : T.accent,
            fontWeight: per === id ? 800 : 400, cursor: 'pointer'
          }}>{nome}</button>
        ))}
      </div>
      {per === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: '0.6rem', color: T.text2 }}>Dal</label>
            <input type="date" value={dal} onChange={e => setDal(e.target.value)} style={dateSt} />
          </div>
          <div>
            <label style={{ fontSize: '0.6rem', color: T.text2 }}>Al</label>
            <input type="date" value={al} onChange={e => setAl(e.target.value)} style={dateSt} />
          </div>
        </div>
      )}
      <div style={{ fontSize: '0.65rem', color: T.text2, marginBottom: 10 }}>{etichetta} · {filtrate.length} ricariche</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: T.green, fontFamily: 'monospace' }}>€{fmtN(tot.costo, 0)}</div>
          <div style={{ fontSize: '0.6rem', color: T.text2 }}>Spesa totale</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: T.accent, fontFamily: 'monospace' }}>{fmtN(tot.kwh, 0)}</div>
          <div style={{ fontSize: '0.6rem', color: T.text2 }}>kWh totali</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: T.accent2, fontFamily: 'monospace' }}>{fmtN(tot.km, 0)}</div>
          <div style={{ fontSize: '0.6rem', color: T.text2 }}>KM totali</div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ messaggio, onConfirm, onCancel, theme }) {
  const T = theme || S;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: T.bg, border: '1px solid rgba(239,68,68,0.4)', borderRadius: 20, padding: 28, maxWidth: 320, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗑</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: T.text }}>{messaggio}</div>
        <div style={{ fontSize: '0.8rem', color: T.text2, marginBottom: 24 }}>Questa azione non può essere annullata.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px 0', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 12, color: T.text2, fontSize: '0.9rem', cursor: 'pointer' }}>Annulla</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '12px 0', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 12, color: '#ef4444', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>Conferma</button>
        </div>
      </div>
    </div>
  );
}

function FormRicarica({ settings, ricariche, editIdx, onSave, onCancel, showToast, theme }) {
  const T = theme || S;
  const ex = editIdx !== null ? ricariche[editIdx] : null;
  const [fData,   setFData]   = useState(ex ? ex.data : today());
  const [fLuogo,  setFLuogo]  = useState(ex ? (ex.luogo || '') : (settings.luogo || ''));
  const [fKm,     setFKm]     = useState(ex && ex.km !== null ? toInputStr(ex.km, true) : '');
  const [fKmParz, setFKmParz] = useState(ex && ex.kmParziali !== null ? toInputStr(ex.kmParziali, true) : '');
  const [fPrima,  setFPrima]  = useState(ex ? toInputStr(ex.pctPrima > 1 ? ex.pctPrima : ex.pctPrima * 100) : '');
  const [fDopo,   setFDopo]   = useState(ex ? toInputStr(ex.pctDopo > 1 ? ex.pctDopo : ex.pctDopo * 100) : '');
  const [fKwh,    setFKwh]    = useState(ex && ex.kwhEff !== null && ex.kwhEff !== undefined ? toInputStr(ex.kwhEff) : '');
  const [fPrezzo, setFPrezzo] = useState(ex ? toInputStr(ex.prezzoKwh) : toInputStr(settings.prezzo));

  // prezzo uguale a quello predefinito -> luogo predefinito (CASA); prezzo diverso -> CASA sparisce
  const cambiaPrezzo = (str) => {
    setFPrezzo(str);
    const v = parseIt(str);
    const isDef = !isNaN(v) && Math.abs(v - settings.prezzo) < 0.0005;
    const def = settings.luogo || '';
    if (isDef) { if (fLuogo === '' && def) setFLuogo(def); }
    else if (fLuogo === def) setFLuogo('');
  };

  const prima = parseIt(fPrima) || 0;
  const dopo  = parseIt(fDopo)  || 0;
  const diff  = dopo - prima;
  const kwhTeor  = settings.batteria * (diff / 100);
  const kwhEffInserito = fKwh !== '' && !isNaN(parseIt(fKwh));
  const kwhEff   = kwhEffInserito ? parseIt(fKwh) : null;
  const prezzo   = parseIt(fPrezzo) || settings.prezzo;
  const kwhBase  = kwhEff !== null ? kwhEff : kwhTeor;
  const costo    = kwhBase > 0 ? kwhBase * prezzo : null;
  const kmParzN  = parseIt(fKmParz);
  const kmN      = parseIt(fKm);

  let kmParzAuto = null;
  if (!isNaN(kmN) && kmN > 0 && !(kmParzN > 0)) {
    const altri = editIdx !== null ? ricariche.filter((_, i) => i !== editIdx) : ricariche;
    const prev = [...altri].filter(r => r.km && r.km < kmN).sort((a, b) => b.km - a.km)[0];
    if (prev) kmParzAuto = kmN - prev.km;
  }
  const kmParzEff = (kmParzN > 0) ? kmParzN : kmParzAuto;
  const kwh100 = (kmParzEff && kwhBase > 0) ? (kwhBase / kmParzEff) * 100 : null;

  function salva() {
    if (!fData || prima <= 0 || dopo <= 0) { showToast('⚠️ Compila data e %', '#f59e0b'); return; }
    if (dopo <= prima) { showToast('⚠️ % dopo > % prima', '#f59e0b'); return; }
    onSave({
      id: ex?.id || null,
      data: fData, luogo: fLuogo || null, km: parseIt(fKm) || null,
      pctPrima: prima, pctDopo: dopo, kwhEff, kwhTeor, prezzoKwh: prezzo, costo,
      kmParziali: kmParzEff || null, kwh100
    });
  }

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: T.text2, marginBottom: 12 }}>
        {editIdx !== null ? '✏️ Modifica Ricarica' : 'Nuova Ricarica'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>Data</label>
          <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inputSt(T)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>Dove si ricarica</label>
          <input type="text" value={fLuogo} onChange={e => setFLuogo(e.target.value.toUpperCase())} style={inputSt(T)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>KM Totali</label>
          <NumInput value={fKm} onChange={setFKm} group decimals={false} style={inputSt(T)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>KM Parziali</label>
          <NumInput value={fKmParz} onChange={setFKmParz} group placeholder={kmParzAuto ? fmtN(kmParzAuto, 2, 0) : ''} style={inputSt(T)} />
          {kmParzAuto && !(kmParzN > 0) && <div style={{ fontSize: '0.6rem', color: T.accent, marginTop: 2 }}>⚡ calcolato automaticamente</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>% Prima</label>
          <NumInput value={fPrima} onChange={setFPrima} style={inputSt(T)} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[settings.p1a, settings.p1b].map(v => <button key={v} onClick={() => setFPrima(toInputStr(v))} style={chipSt(T)}>{v}%</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>% Dopo</label>
          <NumInput value={fDopo} onChange={setFDopo} style={inputSt(T)} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[settings.p2a, settings.p2b].map(v => <button key={v} onClick={() => setFDopo(toInputStr(v))} style={chipSt(T)}>{v}%</button>)}
          </div>
        </div>
        <div style={{ gridColumn: '1/-1', background: 'rgba(0,229,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: T.text2, textTransform: 'uppercase' }}>Differenza %</div>
            <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: T.accent }}>{diff > 0 ? fmtN(diff, 0) + ' %' : '\u00a0'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: T.text2, textTransform: 'uppercase' }}>kWh teorici</div>
            <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: T.accent }}>{kwhTeor > 0 ? fmtN(kwhTeor, 2) + ' kWh' : '\u00a0'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>Prezzo €/kWh</label>
          <NumInput value={fPrezzo} onChange={cambiaPrezzo} style={inputSt(T)} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setFPrezzo(toInputStr(settings.prezzo)); setFLuogo(settings.luogo || ''); }} style={chipSt(T)}>€{fmtN(settings.prezzo, 2)}</button>
            <button onClick={() => cambiaPrezzo('0,50')} style={chipSt(T)}>€0,50</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>Costo €</label>
          <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: T.green, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, borderRadius: 10 }}>
            {costo > 0 ? '€ ' + fmtN(costo, 2) : '\u00a0'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>kWh effettivi</label>
          <NumInput value={fKwh} onChange={setFKwh} placeholder="inserisci valore reale" style={inputSt(T)} />
          {!kwhEffInserito && <div style={{ fontSize: '0.6rem', color: '#f59e0b', marginTop: 2 }}>⚠️ vuoto: costo e consumo calcolati sui kWh teorici</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>kWh / 100km</label>
          <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: T.accent2, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, borderRadius: 10 }}>
            {kwh100 ? fmtN(kwh100, 2) : '\u00a0'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {onCancel && <button onClick={onCancel} style={{ flex: 1, padding: 16, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 12, color: T.text2, fontSize: '0.85rem', cursor: 'pointer' }}>Annulla</button>}
        <button onClick={salva} style={{ flex: 2, padding: 16, background: `linear-gradient(135deg,${T.accent},${T.accent2})`, border: 'none', borderRadius: 12, color: '#fff', fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer' }}>
          {editIdx !== null ? '✏️ Aggiorna' : '⚡ Salva Ricarica'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [view,       setView]       = useState('home');
  const mainRef = useRef(null);
  // layout a schermo intero: la pagina non scorre, scorre solo l'area contenuti
  useEffect(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body,#root{margin:0;padding:0;height:100%;overflow:hidden;overscroll-behavior:none;background:#0a0f1e}';
    document.head.appendChild(st);
    const mv = document.querySelector('meta[name="viewport"]');
    if (mv && !/viewport-fit/.test(mv.content)) mv.content += ', viewport-fit=cover';
    return () => st.remove();
  }, []);
  // cambio sezione: contenuti di nuovo in alto
  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [view]);
  const [themeMode,  setThemeMode]  = useState(() => localStorage.getItem('mgs5_theme') || 'auto');
  const [ricariche,  setRicariche]  = useState(() => leggiCacheLocale() || []);
  const [loading,    setLoading]    = useState(() => !localStorage.getItem(LS_RICARICHE));
  const [settings,   setSettings]   = useState(() => {
    try {
      const raw = localStorage.getItem('mgs5_settings');
      if (!raw) return { ...DEFAULT_SETTINGS };
      const o = JSON.parse(raw);
      const m = { ...DEFAULT_SETTINGS, ...o };
      // impostazioni salvate prima dell'introduzione del luogo predefinito: parte da CASA a 0,20
      if (!('luogo' in o)) { m.luogo = 'CASA'; m.prezzo = 0.20; }
      return m;
    } catch { return { ...DEFAULT_SETTINGS }; }
  });
  const [editIdx,    setEditIdx]    = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [mesiAperti, setMesiAperti] = useState({});
  const [openSec,    setOpenSec]    = useState({ veicolo: true, preset: false, sheets: false, supabase: false, danger: false, archivio: false });
  const { toast, show: showToast }  = useToast();
  // Stato rete REALE (non piu' un flag salvato che restava rosso finche' non
  // si toccava il pulsante): supabaseOffline = senza rete oppure server non
  // raggiungibile all'ultimo tentativo. Si azzera da solo appena torna la rete.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [supabaseKo, setSupabaseKo] = useState(false);
  const [codaCount, setCodaCount] = useState(() => leggiCoda().length);
  const supabaseOffline = !isOnline || supabaseKo;
  const onlineRef = useRef(navigator.onLine);
  const syncInCorso = useRef(false);

  function segnalaSupabaseOffline() {
    setSupabaseKo(true);
  }
  function riattivaSupabase() {
    setSupabaseKo(false);
    showToast('🔄 Riprovo la sincronizzazione...', '#10b981');
    loadRicariche();
  }

  useEffect(() => {
    const s = document.createElement('style');
    s.textContent = 'input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}';
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  useEffect(() => { loadRicariche(); }, []);

  // Svuota la coda verso Supabase, in ordine cronologico. Non parte senza rete.
  // Usa solo localStorage, ref e setState funzionali: puo' essere chiamata
  // anche da timer ed eventi senza problemi di closure.
  async function processaCodaSync() {
    if (syncInCorso.current) return;
    if (leggiCoda().length === 0) { setCodaCount(0); return; }
    if (navigator.onLine === false) return;
    syncInCorso.current = true;
    let inviate = 0;
    try {
      for (let giro = 0; giro < 500; giro++) {
        const coda = leggiCoda().sort((x, y) => (x.ts || 0) - (y.ts || 0));
        if (coda.length === 0) break;
        const op = coda[0];
        let idReale = null;
        try {
          let res;
          if (op.tipo === 'insert') {
            res = await supabase.from('ricariche').insert(op.payload).select('id').single();
          } else if (op.tipo === 'update') {
            res = await supabase.from('ricariche').update(op.payload).eq('id', op.id);
          } else {
            res = await supabase.from('ricariche').delete().eq('id', op.id);
          }
          if (res.error) throw res.error;
          if (op.tipo === 'insert') idReale = res.data?.id ?? null;
        } catch (err) {
          if (err && err.code) {
            // Risposta di rifiuto dal server (non un problema di rete): l'operazione
            // non andra' mai a buon fine, quindi si toglie dalla coda (per non
            // bloccare le altre) e si tiene traccia in mgs5_coda_scartate.
            scriviCoda(leggiCoda().filter(o => o.opId !== op.opId));
            try {
              const sc = JSON.parse(localStorage.getItem(LS_CODA_SCARTATE) || '[]');
              sc.push({ ...op, errore: err.message || String(err), quando: new Date().toISOString() });
              localStorage.setItem(LS_CODA_SCARTATE, JSON.stringify(sc.slice(-50)));
            } catch { /* non bloccante */ }
            showToast('❌ Una modifica è stata rifiutata dal server: ' + (err.message || ''), '#ef4444');
            continue;
          }
          // Errore di rete: si ferma qui e si riprova piu' tardi.
          setSupabaseKo(true);
          break;
        }

        inviate++;
        const attuale = leggiCoda();
        const inCoda = attuale.find(o => o.opId === op.opId);
        let nuovaCoda = attuale;
        if (!inCoda) {
          // Tolta dalla coda mentre veniva inviata (ricarica cancellata nel
          // frattempo): se era un insert ora esiste sul server e va cancellata.
          if (op.tipo === 'insert' && idReale != null) {
            nuovaCoda = [...attuale, { opId: nuovoOpId(), tipo: 'delete', id: idReale, ts: Date.now(), v: 0 }];
          }
        } else if ((inCoda.v || 0) === (op.v || 0)) {
          nuovaCoda = attuale.filter(o => o.opId !== op.opId);
        } else if (op.tipo === 'insert' && idReale != null) {
          // Modificata mentre veniva inviata: diventa un update sul record appena creato.
          nuovaCoda = attuale.map(o => o.opId === op.opId ? { ...o, tipo: 'update', id: idReale, tempId: undefined } : o);
        }
        // (un update modificato mentre veniva inviato resta in coda e riparte al giro dopo)
        scriviCoda(nuovaCoda);
        if (op.tipo === 'insert' && idReale != null) sostituisciIdTemp(op.tempId, idReale);
      }
    } finally {
      syncInCorso.current = false;
      const rimaste = leggiCoda().length;
      setCodaCount(rimaste);
      if (inviate > 0 && rimaste === 0) setSupabaseKo(false);
    }
  }

  function sostituisciIdTemp(tempId, idReale) {
    try {
      const raw = localStorage.getItem(LS_RICARICHE);
      if (raw) {
        const l = JSON.parse(raw).map(r => r.id === tempId ? { ...r, id: idReale } : r);
        localStorage.setItem(LS_RICARICHE, JSON.stringify(l));
      }
    } catch { /* non bloccante */ }
    setRicariche(prev => prev.map(r => r.id === tempId ? { ...r, id: idReale } : r));
  }

  // Per le operazioni "in blocco" (reset totale, import) serve la rete e che
  // non ci siano modifiche in attesa: altrimenti verrebbero perse o duplicate.
  async function richiediOnlineECodaVuota() {
    if (!navigator.onLine) {
      showToast('📴 Serve la connessione per questa operazione', '#f59e0b');
      return false;
    }
    await processaCodaSync();
    if (leggiCoda().length > 0) {
      showToast('⏳ Ci sono modifiche in attesa di sincronizzazione: riprova tra poco', '#f59e0b');
      return false;
    }
    return true;
  }

  // Listener rete: evento 'online'/'offline' + controllo ogni 3 secondi (su
  // Capacitor Android gli eventi spesso non scattano) + nuovo tentativo della
  // coda ogni 2 minuti (linea "ballerina": navigator.onLine resta true ma le
  // richieste cadono, quindi l'evento 'online' non arriva mai).
  useEffect(() => {
    function aggiornaStatoRete() {
      const reale = navigator.onLine;
      if (reale === onlineRef.current) return;
      onlineRef.current = reale;
      setIsOnline(reale);
      if (reale) { setSupabaseKo(false); processaCodaSync(); }
    }
    window.addEventListener('online', aggiornaStatoRete);
    window.addEventListener('offline', aggiornaStatoRete);
    const timerRete = setInterval(aggiornaStatoRete, 3000);
    const timerCoda = setInterval(() => { processaCodaSync(); }, 2 * 60 * 1000);
    return () => {
      window.removeEventListener('online', aggiornaStatoRete);
      window.removeEventListener('offline', aggiornaStatoRete);
      clearInterval(timerRete);
      clearInterval(timerCoda);
    };
  }, []);

  async function loadRicariche() {
    const locale = leggiCacheLocale();
    if (locale) setRicariche(locale);
    // Con dati in cache l'app e' subito utilizzabile: non si aspetta mai la rete.
    setLoading(!locale && navigator.onLine !== false);
    if (navigator.onLine === false) return locale || [];

    try {
      // Prima si smaltiscono le modifiche fatte offline: scaricare dal server
      // adesso le cancellerebbe dalla cache locale.
      await processaCodaSync();
      if (leggiCoda().length > 0) return leggiCacheLocale() || [];

      const { data, error } = await supabase
        .from('ricariche')
        .select('*')
        .order('data', { ascending: true });
      if (error) throw error;
      // Se nel frattempo e' stata fatta una modifica locale, non sovrascriverla.
      if (leggiCoda().length > 0) return leggiCacheLocale() || [];
      const lista = (data || []).map(sanitizzaRicarica).sort((a, b) => (a.km || 0) - (b.km || 0));
      const listaCalcolata = ricalcolaKmParziali(lista);
      setRicariche(listaCalcolata);
      salvaCacheLocale(listaCalcolata);
      setSupabaseKo(false);
      return listaCalcolata;
    } catch (e) {
      if (locale) showToast('⚠️ Usando dati locali', '#f59e0b');
      segnalaSupabaseOffline();
      return leggiCacheLocale() || [];
    } finally {
      setLoading(false);
    }
  }

  function salvaSettings() {
    try { localStorage.setItem('mgs5_settings', JSON.stringify(settings)); showToast('✅ Impostazioni salvate!'); } catch {}
  }

  async function salvaRicarica(record) {
    const dbRecord = {
      data: record.data,
      luogo: record.luogo || null,
      km: record.km,
      km_parziali: record.kmParziali,
      pct_prima: record.pctPrima,
      pct_dopo: record.pctDopo,
      kwh_eff: record.kwhEff,
      kwh_teor: record.kwhTeor,
      prezzo_kwh: record.prezzoKwh,
      costo: record.costo ?? (((record.kwhEff ?? record.kwhTeor) || 0) * record.prezzoKwh),
      kwh_100: record.kwh100,
    };
    const isNuova = !record.id;
    const idLocale = record.id || generaIdTemp();

    try {
      // 1) SUBITO in locale: la ricarica si vede all'istante, online o offline.
      const recordLocale = sanitizzaRicarica({ ...dbRecord, id: idLocale });
      const base = isNuova ? [...ricariche, recordLocale] : ricariche.map(r => r.id === record.id ? recordLocale : r);
      const nuove = ricalcolaKmParziali([...base].sort((a, b) => (a.km || 0) - (b.km || 0)));
      setRicariche(nuove);
      salvaCacheLocale(nuove);

      // 2) In coda e invio a Supabase (se c'e' rete parte subito).
      accodaSalvataggio(idLocale, dbRecord);
      setCodaCount(leggiCoda().length);
      await processaCodaSync();

      if (leggiCoda().length === 0) {
        showToast(isNuova ? '✅ Salvata!' : '✅ Aggiornata!');
        const listaAggiornata = await loadRicariche();
        await esportaSheets(listaAggiornata);
      } else {
        showToast('📴 Salvata sul dispositivo: verrà sincronizzata appena torna la connessione', '#f59e0b');
      }
    } catch (e) {
      showToast('❌ Errore salvataggio: ' + (e.message || ''), '#ef4444');
    }
    setEditIdx(null);
    setView('home');
  }

  async function cancellaRicarica(idx) {
    try {
      if (idx === 'all') {
        if (!(await richiediOnlineECodaVuota())) { setConfirmIdx(null); return; }
        const { error } = await supabase.from('ricariche').delete().neq('id', 0);
        if (error) throw error;
        setRicariche([]);
        localStorage.removeItem(LS_RICARICHE);
        showToast('🗑️ Dati resettati');
      } else {
        const r = ricariche[idx];
        // Subito in locale, poi in coda (se c'e' rete parte subito).
        const nuove = ricalcolaKmParziali(ricariche.filter((_, i) => i !== idx));
        setRicariche(nuove);
        salvaCacheLocale(nuove);
        if (r?.id) accodaCancellazione(r.id);
        setCodaCount(leggiCoda().length);
        await processaCodaSync();
        if (leggiCoda().length > 0) showToast('📴 Ricarica rimossa: verrà sincronizzata appena torna la connessione', '#f59e0b');
        else showToast('🗑️ Ricarica rimossa');
      }
    } catch (e) {
      showToast('❌ Errore cancellazione', '#ef4444');
      segnalaSupabaseOffline();
    }
    setConfirmIdx(null);
  }

  function esportaCSV() {
    const header = 'data,luogo,km,km_parziali,pct_prima,pct_dopo,kwh_eff,kwh_teor,prezzo_kwh,costo,kwh_100';
    const righe = ricariche.map(r => [r.data,r.luogo,r.km,r.kmParziali,r.pctPrima,r.pctDopo,r.kwhEff,r.kwhTeor,r.prezzoKwh,r.costo,r.kwh100].join(','));
    const blob = new Blob([header + '\n' + righe.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ricariche.csv'; a.click();
    showToast('📊 CSV esportato!');
  }

  function importaCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        if (!(await richiediOnlineECodaVuota())) return;
        const lines = ev.target.result.trim().split('\n');
        const keys = lines[0].split(',');
        const lista = lines.slice(1).map(l => {
          const vals = l.split(',');
          const obj = {};
          keys.forEach((k, i) => obj[k] = vals[i]);
          return sanitizzaRicarica(obj);
        });
        for (const r of lista) {
          await supabase.from('ricariche').insert({ data:r.data, luogo:r.luogo, km:r.km, km_parziali:r.kmParziali, pct_prima:r.pctPrima, pct_dopo:r.pctDopo, kwh_eff:r.kwhEff, kwh_teor:r.kwhTeor, prezzo_kwh:r.prezzoKwh, costo:r.costo, kwh_100:r.kwh100 });
        }
        showToast(`✅ Importate ${lista.length} ricariche!`);
        await loadRicariche();
      } catch (err) { showToast('❌ Errore CSV: ' + err.message, '#ef4444'); segnalaSupabaseOffline(); }
    };
    reader.readAsText(file);
  }

  function esportaJSON() {
    const blob = new Blob([JSON.stringify(ricariche, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ricariche.json'; a.click();
    showToast('💾 JSON esportato!');
  }

  function importaJSON(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        if (!(await richiediOnlineECodaVuota())) return;
        const lista = JSON.parse(ev.target.result).map(sanitizzaRicarica);
        for (const r of lista) {
          await supabase.from('ricariche').insert({ data:r.data, luogo:r.luogo, km:r.km, km_parziali:r.kmParziali, pct_prima:r.pctPrima, pct_dopo:r.pctDopo, kwh_eff:r.kwhEff, kwh_teor:r.kwhTeor, prezzo_kwh:r.prezzoKwh, costo:r.costo, kwh_100:r.kwh100 });
        }
        showToast(`✅ Importate ${lista.length} ricariche!`);
        await loadRicariche();
      } catch (err) { showToast('❌ Errore JSON: ' + err.message, '#ef4444'); segnalaSupabaseOffline(); }
    };
    reader.readAsText(file);
  }

  async function esportaSheets(listaOverride) {
    const url = localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL;
    try {
      const dati = listaOverride || ricariche;
      await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ ricariche: dati, settings }) });
      showToast('☁️ Sheets aggiornato!');
    } catch (e) {
      showToast('❌ Errore Sheets', '#ef4444');
    }
  }

  async function importaSheets() {
    const url = localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL;
    try {
        if (!(await richiediOnlineECodaVuota())) return;
      showToast('⏳ Importazione...', '#f59e0b');
      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const lista = json.ricariche.map(r => ({
        data: r.data, luogo: (r.luogo || '').toUpperCase(), km: r.km || null,
        kmParziali: null, pctPrima: r.pctPrima, pctDopo: r.pctDopo,
        kwhEff: r.kwhEff, kwhTeor: settings.batteria * ((r.pctDopo - r.pctPrima) / 100),
        prezzoKwh: r.prezzoKwh, costo: r.kwhEff * r.prezzoKwh, kwh100: null, id: null,
      }));
      const { error: delError } = await supabase.from('ricariche').delete().neq('id', 0);
      if (delError) throw delError;
      for (const r of lista) {
        await supabase.from('ricariche').insert({
          data: r.data, luogo: r.luogo, km: r.km,
          pct_prima: r.pctPrima, pct_dopo: r.pctDopo,
          kwh_eff: r.kwhEff, kwh_teor: r.kwhTeor,
          prezzo_kwh: r.prezzoKwh, costo: r.costo,
        });
      }
      showToast(`✅ Importate ${lista.length} ricariche!`);
      await loadRicariche();
    } catch (e) {
      showToast('❌ Errore import: ' + (e.message || ''), '#ef4444');
      segnalaSupabaseOffline();
    }
  }

  function esportaSupabaseBackup() {
    const blob = new Blob([JSON.stringify(ricariche, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup_supabase.json'; a.click();
    showToast('💾 Backup Supabase esportato!');
  }

  function importaSupabaseBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        if (!(await richiediOnlineECodaVuota())) return;
        const lista = JSON.parse(ev.target.result).map(sanitizzaRicarica);
        const { error: delError } = await supabase.from('ricariche').delete().neq('id', 0);
        if (delError) throw delError;
        for (const r of lista) {
          await supabase.from('ricariche').insert({
            data: r.data, luogo: r.luogo, km: r.km, km_parziali: r.kmParziali,
            pct_prima: r.pctPrima, pct_dopo: r.pctDopo, kwh_eff: r.kwhEff,
            kwh_teor: r.kwhTeor, prezzo_kwh: r.prezzoKwh, costo: r.costo, kwh_100: r.kwh100
          });
        }
        showToast(`✅ Ripristinate ${lista.length} ricariche su Supabase!`);
        await loadRicariche();
      } catch (err) {
        showToast('❌ Errore import Supabase: ' + err.message, '#ef4444');
        segnalaSupabaseOffline();
      }
    };
    reader.readAsText(file);
  }

  const isDark = themeMode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : themeMode === 'dark';
  const theme = isDark ? THEMES.dark : THEMES.light;

  const totali = ricariche.reduce((acc, r) => {
    acc.costo += Number(r.costo) || 0;
    acc.kwh   += kwhUsati(r);
    acc.km    += Number(r.kmParziali) || 0;
    return acc;
  }, { costo: 0, kwh: 0, km: 0 });

  const mediaKwh100 = totali.km > 0 ? (totali.kwh / totali.km) * 100 : 0;

  const raggruppatoPerMese = {};
  ricariche.forEach(r => {
    if (!r.data) return;
    const mKey = r.data.slice(0, 7);
    if (!raggruppatoPerMese[mKey]) raggruppatoPerMese[mKey] = { ricariche: [], kwhTotali: 0, costoTotale: 0, kmTotali: 0 };
    raggruppatoPerMese[mKey].ricariche.push(r);
    raggruppatoPerMese[mKey].ricariche.sort((a,b) => (b.km||0) - (a.km||0));    raggruppatoPerMese[mKey].kwhTotali   += kwhUsati(r);
    raggruppatoPerMese[mKey].costoTotale += Number(r.costo) || 0;
    raggruppatoPerMese[mKey].kmTotali    += Number(r.kmParziali) || 0;
  });

  const graficiMesi = Object.keys(raggruppatoPerMese).sort().map(m => {
    const [anno, mm] = m.split('-');
    return { label: MESI_BREVI[parseInt(mm) - 1] + ' ' + anno, titolo: MESI_NOMI[parseInt(mm) - 1] + ' ' + anno, y: raggruppatoPerMese[m].costoTotale };
  });
  const graficiConsumi = ricariche.filter(r => r.kwh100 > 0).map(r => ({
    label: r.data.slice(8, 10) + '/' + r.data.slice(5, 7),
    titolo: r.data.slice(8, 10) + '/' + r.data.slice(5, 7) + '/' + r.data.slice(0, 4),
    y: r.kwh100
  }));

  const toggleSec = (key) => setOpenSec(p => ({ ...p, [key]: !p[key] }));

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: theme.bg, color: theme.text, height: '100dvh', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: 480, margin: '0 auto', position: 'relative', boxSizing: 'border-box' }}>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 500, padding: '12px 24px', background: toast.color, color: '#fff', borderRadius: 30, fontWeight: 700, whiteSpace: 'nowrap' }}>{toast.msg}</div>}
      {confirmIdx !== null && <ConfirmDialog messaggio={confirmIdx === 'all' ? 'Vuoi cancellare tutto?' : 'Cancellare la ricarica?'} onConfirm={() => cancellaRicarica(confirmIdx)} onCancel={() => setConfirmIdx(null)} theme={theme} />}

      <header style={{
        flexShrink: 0, position: 'relative', zIndex: 100,
        background: supabaseOffline ? 'rgba(239,68,68,0.92)' : theme.headerBg,
        backdropFilter: 'blur(12px)',
        borderBottom: supabaseOffline ? '1px solid rgba(239,68,68,0.9)' : `1px solid ${theme.border}`,
        padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        transition: 'background 0.3s, border-color 0.3s'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}><span style={{ color: supabaseOffline ? '#fff' : theme.text }}>{settings.targa}</span></div>

          {supabaseOffline ? (
            <button onClick={riattivaSupabase} title="Tocca per riprovare la sincronizzazione" style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, color: '#fff', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800 }}>
              ⚠️ OFFLINE{codaCount > 0 ? ` · ${codaCount} in attesa` : ''}
            </button>
          ) : (
            <button onClick={() => { const n = themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'auto' : 'dark'; setThemeMode(n); localStorage.setItem('mgs5_theme', n); }} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${theme.border}`, borderRadius: 20, color: theme.text2, cursor: 'pointer', fontSize: '0.7rem' }}>
              {themeMode === 'auto' ? '🌓' : themeMode === 'dark' ? '🌙' : '☀️'}
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: supabaseOffline ? '#fff' : theme.accent }}>{totali.km > 0 ? fmtN(totali.km, 0) : '—'}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: supabaseOffline ? '#fff' : theme.accent }}>€{fmtN(totali.costo, 2)}</div>
          <div style={{ fontSize: '0.55rem', color: supabaseOffline ? 'rgba(255,255,255,0.8)' : theme.text2, textTransform: 'uppercase' }}>KM TOTALI</div>
          <div style={{ fontSize: '0.55rem', color: supabaseOffline ? 'rgba(255,255,255,0.8)' : theme.text2, textTransform: 'uppercase' }}>COSTO TOT.</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: supabaseOffline ? '#fff' : theme.accent }}>{fmtN(totali.kwh, 2)}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: supabaseOffline ? '#fff' : theme.accent }}>{mediaKwh100 ? fmtN(mediaKwh100, 2) : '—'}</div>
          <div style={{ fontSize: '0.55rem', color: supabaseOffline ? 'rgba(255,255,255,0.8)' : theme.text2, textTransform: 'uppercase' }}>KWH TOTALI</div>
          <div style={{ fontSize: '0.55rem', color: supabaseOffline ? 'rgba(255,255,255,0.8)' : theme.text2, textTransform: 'uppercase' }}>MEDIA /100KM</div>
        </div>
      </header>

      <main ref={mainRef} style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: (view === 'grafici' || view === 'dati') ? '12px 4px 16px' : '20px 16px 24px' }}>
        {view === 'home' && (
          <>
            {editIdx !== null && (
              <FormRicarica settings={settings} ricariche={ricariche} editIdx={editIdx} onSave={salvaRicarica} onCancel={() => setEditIdx(null)} showToast={showToast} theme={theme} />
            )}

            {loading && <div style={{ textAlign: 'center', color: theme.text2, padding: 20 }}>Caricamento...</div>}

            {!loading && ricariche.length === 0 && (
              <div style={{ textAlign: 'center', color: theme.text2, padding: 40 }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔋</div>
                <div>Nessuna ricarica.<br />Premi + per aggiungerne.</div>
              </div>
            )}

            {Object.keys(raggruppatoPerMese).sort((a, b) => b.localeCompare(a)).map(mKey => {
              const mData = raggruppatoPerMese[mKey];
              const nomeMese = MESI_NOMI[parseInt(mKey.split('-')[1]) - 1] + ' ' + mKey.split('-')[0];
              const aperto = mesiAperti[mKey] ?? false;
              return (
                <div key={mKey} style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                  <div onClick={() => setMesiAperti(p => ({ ...p, [mKey]: !aperto }))} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accent, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: isDark ? '#fff' : '#000', lineHeight: 1.2 }}>{MESI_NOMI[parseInt(mKey.split('-')[1]) - 1]}</div>
                      <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.06em', color: isDark ? '#fff' : '#000', lineHeight: 1.2 }}>{mKey.split('-')[0]}</div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: 8 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>{mData.ricariche.length} ric</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>tot</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>{mData.ricariche.filter(r => (r.luogo||'').toUpperCase()==='CASA').length} ric</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>casa</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: isDark ? theme.accent : '#004a6e', lineHeight: 1.8 }}>€{fmtN(mData.costoTotale, 2)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: isDark ? theme.accent : '#004a6e', lineHeight: 1.8 }}>{fmtN(mData.kwhTotali, 2)} kWh</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.green, lineHeight: 1.8 }}>€{fmtN(mData.ricariche.filter(r=>(r.luogo||'').toUpperCase()==='CASA').reduce((s,r)=>s+r.costo,0), 2)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.green, lineHeight: 1.8 }}>{fmtN(mData.ricariche.filter(r=>(r.luogo||'').toUpperCase()==='CASA').reduce((s,r)=>s+kwhUsati(r),0), 2)} kWh</div>
                    </div>
                  </div>
                  {aperto && (
                    <div style={{ padding: 8, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[...mData.ricariche].sort((a, b) => (b.km || 0) - (a.km || 0)).map(r => {
                        const idx = ricariche.findIndex(x => x.id !== null ? x.id === r.id : x.data === r.data && x.kwhEff === r.kwhEff);
                        return (
                          <div key={r.id} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: theme.text2, fontWeight: 600 }}>{r.data.slice(8,10)}/{r.data.slice(5,7)}/{r.data.slice(0,4)}{r.luogo ? ' · '+r.luogo : ''}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: theme.text2 }}>{Math.round(r.pctPrima > 1 ? r.pctPrima : r.pctPrima * 100)}→{Math.round(r.pctDopo > 1 ? r.pctDopo : r.pctDopo * 100)}%</div>
                                <button onClick={() => { setEditIdx(idx); setView('home'); if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', padding: '4px 6px', fontSize: '1rem' }}>✏️</button>
                                <button onClick={() => setConfirmIdx(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', fontSize: '1.1rem', fontWeight: 700 }}>✕</button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                              <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'monospace', color: theme.text }}>{fmtN((r.kwhEff||0), 2)} kWh</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#f59e0b' }}>{r.kwh100 ? fmtN(r.kwh100, 2)+' kWh/100km' : '—'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontSize: '0.9rem', color: theme.text2, lineHeight: 1.6 }}>
                                {r.prezzoKwh ? '€'+fmtN(r.prezzoKwh, 2)+'/kWh' : '—'}
                                {r.kmParziali ? '  ·  +'+r.kmParziali+' km' : ''}
                                {r.km ? '  ·  '+fmtN(r.km, 0)+' km tot' : ''}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 700, color: theme.green }}>€{fmtN((r.costo||0), 2)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {view === 'nuovo' && <FormRicarica settings={settings} ricariche={ricariche} editIdx={null} onSave={salvaRicarica} onCancel={() => setView('home')} showToast={showToast} theme={theme} />}

        {view === 'grafici' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '0 0 6px', overflow: 'hidden' }}>
              <ChartLinea title="Spesa mensile (€)" data={graficiMesi} initialVisible={6} labelW={52} color={theme.green} theme={theme} formatTick={v => '€' + fmtD(v)} formatValue={v => '€ ' + fmtN(v, 2)} />
            </div>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '0 0 6px', overflow: 'hidden' }}>
              <ChartLinea title="Andamento consumi (kWh/100km)" data={graficiConsumi} initialVisible={10} labelW={34} color={theme.accent} theme={theme} formatTick={v => fmtD(v)} formatValue={v => fmtN(v, 2) + ' kWh/100km'} />
            </div>
            <RiepilogoPeriodo ricariche={ricariche} theme={theme} />
          </div>
        )}

        {view === 'dati' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '12px 8px' }}>
              <div onClick={() => toggleSec('archivio')} style={{ fontSize: '0.65rem', color: theme.text2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <span>Archivio Dati</span><span>{openSec.archivio ? '▲' : '▼'}</span>
              </div>
              {openSec.archivio && (
              <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.csv'; inp.onchange=importaCSV; inp.click(); }} style={{ padding:'16px 0', background:'rgba(0,229,255,0.1)', border:`1px solid rgba(0,229,255,0.3)`, borderRadius:14, color:theme.accent, fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📊 Importa CSV</button>
                <button onClick={esportaCSV} style={{ padding:'16px 0', background:'rgba(0,229,255,0.1)', border:`1px solid rgba(0,229,255,0.3)`, borderRadius:14, color:theme.accent, fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📊 Esporta CSV</button>
                <button onClick={()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.onchange=importaJSON; inp.click(); }} style={{ padding:'16px 0', background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.35)', borderRadius:14, color:'#a78bfa', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📂 Importa JSON</button>
                <button onClick={esportaJSON} style={{ padding:'16px 0', background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.35)', borderRadius:14, color:'#a78bfa', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>💾 Esporta JSON</button>
                <button onClick={importaSheets} style={{ padding:'16px 0', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:14, color:'#10b981', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📥 Importa Sheets</button>
                <button onClick={esportaSheets} style={{ padding:'16px 0', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.35)', borderRadius:14, color:'#f59e0b', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📤 Esporta Sheets</button>
                <button onClick={()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.onchange=importaSupabaseBackup; inp.click(); }} style={{ padding:'16px 0', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:14, color:'#10b981', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📥 Importa Supabase</button>
                <button onClick={esportaSupabaseBackup} style={{ padding:'16px 0', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.35)', borderRadius:14, color:'#f59e0b', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📤 Esporta Supabase</button>
              </div>
              <div style={{ fontSize: '0.65rem', color: theme.text2, marginTop: 10, lineHeight: 1.6 }}>⚠️ Importa sovrascrive tutti i dati esistenti</div>
              </>
              )}
            </div>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '12px 8px' }}>
              <div style={{ fontSize: '0.65rem', color: theme.text2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Riepilogo Mensile</div>
              {Object.keys(raggruppatoPerMese).sort((a,b) => b.localeCompare(a)).map(mKey => {
                const mData = raggruppatoPerMese[mKey];
                const kmMese = mData.kmTotali || 0;
                const mediaKwhMese = kmMese > 0 ? (mData.kwhTotali / kmMese) * 100 : null;
                return (
                  <div key={mKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.text }}>{MESI_NOMI[parseInt(mKey.split('-')[1])-1]} {mKey.split('-')[0]}</div>
                      <div style={{ fontSize: '0.75rem', color: theme.text2, marginTop: 2 }}>{mData.ricariche.length} ric · {kmMese > 0 ? fmtN(kmMese, 0) + ' km' : '— km'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: theme.accent }}>{fmtN(mData.kwhTotali, 2)} kWh · <span style={{ color: '#34d399' }}>€{fmtN(mData.costoTotale, 2)}</span></div>
                      {mediaKwhMese && <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#a78bfa' }}>{fmtN(mediaKwhMese, 2)} kWh/100km</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('veicolo')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: theme.text }}>
                <span>🚗 Veicolo</span><span>{openSec.veicolo ? '▲' : '▼'}</span>
              </div>
              {openSec.veicolo && (
                <div style={{ padding: 14, borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.65rem', color: theme.text2 }}>TARGA / NOME</label>
                    <input type="text" value={settings.targa} onChange={e => setSettings({ ...settings, targa: e.target.value })} style={inputSt(theme)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', color: theme.text2 }}>CAPACITÀ BATTERIA (kWh)</label>
                    <SetNum value={settings.batteria} onValue={v => setSettings(st => ({ ...st, batteria: v }))} style={inputSt(theme)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', color: theme.text2 }}>LUOGO PREDEFINITO (es. CASA)</label>
                    <input type="text" value={settings.luogo || ''} onChange={e => setSettings({ ...settings, luogo: e.target.value.toUpperCase() })} placeholder="CASA" style={inputSt(theme)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', color: theme.text2 }}>PREZZO PREDEFINITO (€/kWh)</label>
                    <SetNum value={settings.prezzo} onValue={v => setSettings(st => ({ ...st, prezzo: v }))} style={inputSt(theme)} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('preset')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: theme.text }}>
                <span>🔢 Pulsanti Rapidi (%)</span><span>{openSec.preset ? '▲' : '▼'}</span>
              </div>
              {openSec.preset && (
                <div style={{ padding: 14, borderTop: `1px solid ${theme.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Prima (A)</label><SetNum value={settings.p1a} decimals={false} onValue={v => setSettings(st => ({ ...st, p1a: v }))} style={inputSt(theme)} /></div>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Prima (B)</label><SetNum value={settings.p1b} decimals={false} onValue={v => setSettings(st => ({ ...st, p1b: v }))} style={inputSt(theme)} /></div>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Dopo (A)</label><SetNum value={settings.p2a} decimals={false} onValue={v => setSettings(st => ({ ...st, p2a: v }))} style={inputSt(theme)} /></div>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Dopo (B)</label><SetNum value={settings.p2b} decimals={false} onValue={v => setSettings(st => ({ ...st, p2b: v }))} style={inputSt(theme)} /></div>
                </div>
              )}
            </div>

            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('sheets')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: theme.text }}>
                <span>📊 Google Sheets</span><span>{openSec.sheets ? '▲' : '▼'}</span>
              </div>
              {openSec.sheets && (
                <div style={{ padding: 14, borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.65rem', color: theme.text2, display: 'block', marginBottom: 6 }}>URL Google Apps Script</label>
                    <input type="text" defaultValue={localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL} onChange={e => localStorage.setItem('mgs5_sheetsUrl', e.target.value)} style={{ ...inputSt(theme), fontSize: '0.7rem' }} />
                  </div>
                  <button onClick={esportaSheets} style={{ padding: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', color: '#10b981', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    ☁️ Esporta su Sheets
                  </button>
                  <button onClick={importaSheets} style={{ padding: 10, background: 'rgba(0,229,255,0.1)', border: `1px solid ${theme.accent}`, color: theme.accent, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    📥 Importa da Sheets
                  </button>
                  <a href="https://docs.google.com/spreadsheets/d/1egavj34-1EM3lY91kSikV48G7zxrnM7tOKdJ5GqPhY4/edit?gid=433900317#gid=433900317" target="_blank" rel="noreferrer" style={{ padding: 10, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.35)', color: '#a78bfa', borderRadius: 10, cursor: 'pointer', fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>
                    📊 Visualizza Sheet
                  </a>
                </div>
              )}
            </div>

            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('supabase')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: theme.text }}>
                <span>🗄️ Supabase</span><span>{openSec.supabase ? '▲' : '▼'}</span>
              </div>
              {openSec.supabase && (
                <div style={{ padding: 14, borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={esportaSupabaseBackup} style={{ padding: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    📤 Esporta Supabase
                  </button>
                  <button onClick={()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.onchange=importaSupabaseBackup; inp.click(); }} style={{ padding: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    📥 Importa Supabase
                  </button>
                  <a href={`https://supabase.com/dashboard/project/${SUPABASE_URL.replace('https://','').replace('.supabase.co','')}/editor`} target="_blank" rel="noreferrer" style={{ padding: 10, background: 'rgba(0,229,255,0.1)', border: `1px solid ${theme.accent}`, color: theme.accent, borderRadius: 10, cursor: 'pointer', fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>
                    🔎 Visualizza Dati
                  </a>
                </div>
              )}
            </div>

            <div style={{ background: theme.bg2, border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('danger')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', color: '#ef4444', display: 'flex', justifyContent: 'space-between' }}>
                <span>⚠️ Zona Pericolo</span><span>{openSec.danger ? '▲' : '▼'}</span>
              </div>
              {openSec.danger && (
                <div style={{ padding: 14, borderTop: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.02)' }}>
                  <button onClick={() => setConfirmIdx('all')} style={{ width: '100%', padding: 12, background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer' }}>
                    🗑 Cancella tutti i dati
                  </button>
                </div>
              )}
            </div>

            <button onClick={salvaSettings} style={{ width: '100%', padding: 14, background: `linear-gradient(135deg,${theme.accent},${theme.accent2})`, border: 'none', borderRadius: 16, color: '#fff', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem' }}>
              💾 Salva Impostazioni
            </button>

            <button onClick={() => loadRicariche()} style={{ width: '100%', padding: 14, background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 16, color: theme.accent, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
              🔄 Aggiorna dati
            </button>

            <button onClick={async () => {
              try {
                if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
                if ('caches' in window) { const nomi = await caches.keys(); await Promise.all(nomi.map(n => caches.delete(n))); }
              } catch { /* non bloccante */ }
              window.location.reload();
            }} style={{ width: '100%', padding: 14, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 16, color: theme.text2, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
              🧹 Svuota cache e ricarica
            </button>

            <div style={{ textAlign: 'center', marginTop: 12, marginBottom: 24, fontSize: '0.75rem', color: theme.text2, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              Versione v{APP_VERSION}
            </div>

          </div>
        )}
      </main>

      <nav style={{ flexShrink: 0, position: 'relative', width: '100%', background: theme.navBg, borderTop: `1px solid ${theme.border}`, display: 'flex', padding: '0 0 env(safe-area-inset-bottom, 0px)', zIndex: 200, boxSizing: 'border-box' }}>
        {[
          { id: 'home',     l: 'HOME',    i: '🏠' },
          { id: 'nuovo',    l: 'AGGIUNGI', i: '➕' },
          { id: 'grafici',  l: 'GRAFICI',  i: '📊' },
          { id: 'dati',     l: 'DATI',     i: '📋' },
          { id: 'settings', l: 'CONFIG',   i: '⚙️' }
        ].map(t => {
          const active = view === t.id;
          return (
          <button key={t.id} onClick={() => { setView(t.id); setEditIdx(null); }} style={{ flex: 1, background: active ? 'rgba(0,229,255,0.1)' : 'transparent', border: 'none', borderTop: active ? `2px solid ${theme.accent}` : '2px solid transparent', color: active ? theme.accent : theme.text2, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, padding: '4px 0 3px', margin: 0, lineHeight: 1.1, transition: 'all 0.2s' }}>
            <span style={{ fontSize: '1.05rem', lineHeight: 1.1 }}>{t.i}</span>
            <span style={{ fontSize: '0.55rem', letterSpacing: '0.05em', fontWeight: active ? 800 : 400 }}>{t.l}</span>
          </button>
          );
        })}
      </nav>
    </div>
  );
}
