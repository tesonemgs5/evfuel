import { useState, useEffect } from "react";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbyb70PcCzlVoACCdodeyJ2vmhg9v1_NaEAIlkj_jpBvE4RuFK0kO5d24zsKkAC2Ccwc/exec";
const supabase = null;

const MESI_NOMI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function getSheetsUrl() { return localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL; }

const DEFAULT_SETTINGS = { batteria: 64, prezzo: 0.50, targa: 'MGS5', p1a: 20, p1b: 30, p2a: 80, p2b: 100 };

const THEMES = {
  dark: {
    bg: '#0a0f1e',
    bg2: 'rgba(255,255,255,0.04)',
    border: 'rgba(0,229,255,0.15)',
    accent: '#00e5ff',
    accent2: '#7c3aed',
    green: '#10b981',
    text: '#e2e8f0',
    text2: '#94a3b8',
    headerBg: 'rgba(10,15,30,0.95)',
    navBg: 'rgba(10,15,30,0.95)'
  },
  light: {
    bg: '#f0f4f8',
    bg2: 'rgba(0,0,0,0.04)',
    border: 'rgba(0,140,200,0.25)',
    accent: '#0070a8',
    accent2: '#5b21b6',
    green: '#047857',
    text: '#1e293b',
    text2: '#64748b',
    headerBg: 'rgba(240,244,248,0.95)',
    navBg: 'rgba(240,244,248,0.95)'
  }
};

const S = THEMES.dark;

const inputSt = (theme) => ({
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  color: theme.text,
  fontFamily: 'monospace',
  fontSize: '1rem',
  padding: '10px 12px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
  MozAppearance: 'textfield',
  appearance: 'textfield'
});

const chipSt = {
  padding: '4px 10px',
  background: 'rgba(0,229,255,0.08)',
  border: '1px solid rgba(0,229,255,0.2)',
  borderRadius: 20,
  color: S.accent,
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  cursor: 'pointer'
};

const noSpinnerStyle = document.createElement('style');
noSpinnerStyle.textContent = 'input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}';
document.head.appendChild(noSpinnerStyle);

function today() { return new Date().toISOString().split('T')[0]; }
function toNum(x, def = 0) { const n = Number(x); return Number.isFinite(n) ? n : def; }

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
  const kwhEff   = toNum(r?.kwh_eff   ?? r?.kwhEff,   0);
  const prezzoKwh = toNum(r?.prezzo_kwh ?? r?.prezzoKwh, 0);
  const costo    = toNum(r?.costo, 0);
  const luogo = ((r?.luogo || '').toString().trim().toUpperCase()) || '';
  return {
    id: r?.id || null,
    luogo,
    data: normalizzaData(r?.data),
    kwhEff,
    kwhTeor: toNum(r?.kwh_teor ?? r?.kwhTeor, 0),
    costo,
    prezzoKwh,
    pctPrima,
    pctDopo,
    kwh100: r?.kwh_100 != null ? toNum(r.kwh_100, null) : (r?.kwh100 != null ? toNum(r.kwh100, null) : null),
    km: r?.km != null ? toNum(r.km, null) : null,
    kmParziali: r?.km_parziali != null ? toNum(r.km_parziali, null) : (r?.kmParziali != null ? toNum(r.kmParziali, null) : null),
  };
}

function ricalcolaKmParziali(lista) {
  return lista.map((r, i) => {
    if (r.km && r.km > 0) {
      const prev = lista.slice(0, i).filter(x => x.km && x.km > 0).pop();
      if (!prev) return { ...r, kmParziali: null, kwh100: null };
      const kmParziali = r.km - prev.km;
      const kwh100 = kmParziali > 0 ? (r.kwhEff / kmParziali) * 100 : null;
      return { ...r, kmParziali, kwh100 };
    }
    return r;
  });
}

function toDbRecord(r, userId) {
  return {
    user_id: userId,
    data: r.data,
    luogo: r.luogo || null,
    km: r.km,
    km_parziali: r.kmParziali,
    pct_prima: r.pctPrima,
    pct_dopo: r.pctDopo,
    kwh_eff: r.kwhEff,
    kwh_teor: r.kwhTeor,
    prezzo_kwh: r.prezzoKwh,
    costo: (r.costo && r.costo > 0) ? r.costo : r.kwhEff * r.prezzoKwh,
    kwh_100: r.kwh100,
  };
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, color = '#10b981') => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2500);
  };
  return { toast, show };
}

function ConfigSheet({ showToast, theme }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState(SHEETS_URL);
  useEffect(() => {
    setEmail(localStorage.getItem('mgs5_adminEmail') || '');
    setUrl(localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL);
  }, []);
  function salva() {
    localStorage.setItem('mgs5_adminEmail', email.trim());
    localStorage.setItem('mgs5_sheetsUrl', url.trim());
    setEditing(false);
    showToast('✅ Impostazioni salvate!');
  }
  const T = theme || S;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2, display: 'block', marginBottom: 6 }}>Email admin</label>
        {editing
          ? <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tua@email.com" style={inputSt(T)} />
          : <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: T.text, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 10 }}>{email || '—'}</div>}
      </div>
      <div>
        <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2, display: 'block', marginBottom: 6 }}>URL Google Apps Script</label>
        {editing
          ? <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..." style={{ ...inputSt(T), fontSize: '0.7rem' }} />
          : <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: T.text2, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 10, wordBreak: 'break-all' }}>{url}</div>}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.text2, fontSize: '0.8rem', cursor: 'pointer' }}>Annulla</button>
          <button onClick={salva} style={{ flex: 2, padding: '10px 0', background: `linear-gradient(135deg,${T.accent},${T.accent2})`, border: 'none', borderRadius: 10, color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>✅ Salva</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} style={{ padding: '10px 0', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 10, color: T.text2, fontSize: '0.8rem', cursor: 'pointer' }}>✏️ Modifica impostazioni</button>
      )}
      <div style={{ fontSize: '0.65rem', color: T.accent, lineHeight: 1.6 }}>⚡ Il backup si attiva automaticamente solo per l'email admin</div>
    </div>
  );
}

function BarChart({ data, color = '#00e5ff' }) {
  if (!data.length) return <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>Nessun dato</div>;
  const max = Math.max(...data.map(d => d.y));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '8px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', background: color + '99', borderRadius: 4, height: max ? `${(d.y / max) * 120}px` : 0, minHeight: d.y ? 4 : 0, transition: 'height 0.4s' }} />
          <div style={{ fontSize: '0.5rem', color: '#94a3b8', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{d.x}</div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, color = '#7c3aed' }) {
  if (data.length < 2) return <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>Servono almeno 2 punti</div>;
  const w = 300, h = 120;
  const ys = data.map(d => d.y), minY = Math.min(...ys), maxY = Math.max(...ys);
  const px = i => (i / (data.length - 1)) * w;
  const py = y => h - ((y - minY) / (maxY - minY || 1)) * (h - 10) - 5;
  const pts = data.map((d, i) => `${px(i)},${py(d.y)}`).join(' ');
  const gradId = `g${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 160 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={px(i)} cy={py(d.y)} r="3" fill={color} />)}
    </svg>
  );
}

function ConfirmDialog({ messaggio, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#111827', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 20, padding: 28, maxWidth: 320, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗑</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>{messaggio}</div>
        <div style={{ fontSize: '0.8rem', color: S.text2, marginBottom: 24 }}>Questa azione non può essere annullata.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px 0', background: 'transparent', border: `1px solid ${S.border}`, borderRadius: 12, color: S.text2, fontSize: '0.9rem', cursor: 'pointer' }}>Annulla</button>
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
  const [fLuogo,  setFLuogo]  = useState(ex ? (ex.luogo || '') : '');
  const [fKm,     setFKm]     = useState(ex && ex.km !== null ? String(ex.km) : '');
  const [fKmParz, setFKmParz] = useState(ex && ex.kmParziali !== null ? String(ex.kmParziali) : '');
  const [fPrima,  setFPrima]  = useState(ex ? String(ex.pctPrima > 1 ? ex.pctPrima : ex.pctPrima * 100) : '');
  const [fDopo,   setFDopo]   = useState(ex ? String(ex.pctDopo > 1 ? ex.pctDopo : ex.pctDopo * 100) : '');
  const [fKwh,    setFKwh]    = useState(ex ? String(ex.kwhEff) : '');
  const [fPrezzo, setFPrezzo] = useState(ex ? String(ex.prezzoKwh) : String(settings.prezzo));

  useEffect(() => {
    const v = parseFloat(fPrezzo);
    if (Math.abs(v - 0.2) < 0.001 && fLuogo !== 'CASA') setFLuogo('CASA');
  }, [fPrezzo]);

  const prima = parseFloat(fPrima) || 0;
  const dopo  = parseFloat(fDopo)  || 0;
  const diff  = dopo - prima;
  const kwhTeor  = settings.batteria * (diff / 100);
  const kwhEff   = parseFloat(fKwh) || kwhTeor;
  const prezzo   = parseFloat(fPrezzo) || settings.prezzo;
  const costo    = kwhEff * prezzo;
  const kmParzN  = parseFloat(fKmParz);
  const kmN      = parseFloat(fKm);

  let kmParzAuto = null;
  if (!isNaN(kmN) && kmN > 0 && !(kmParzN > 0)) {
    const altri = editIdx !== null ? ricariche.filter((_, i) => i !== editIdx) : ricariche;
    const prev = [...altri].filter(r => r.km && r.km < kmN).sort((a, b) => b.km - a.km)[0];
    if (prev) kmParzAuto = kmN - prev.km;
  }
  const kmParzEff = (kmParzN > 0) ? kmParzN : kmParzAuto;
  const kwh100 = kmParzEff ? (kwhEff / kmParzEff) * 100 : null;

  function salva() {
    if (!fData || prima <= 0 || dopo <= 0) { showToast('⚠️ Compila data e %', '#f59e0b'); return; }
    if (dopo <= prima) { showToast('⚠️ % dopo > % prima', '#f59e0b'); return; }
    onSave({
      id: ex?.id || null,
      data: fData, luogo: fLuogo || null, km: parseFloat(fKm) || null,
      pctPrima: prima, pctDopo: dopo, kwhEff, kwhTeor, prezzoKwh: prezzo, costo,
      kmParziali: kmParzEff || null, kwh100: kmParzEff ? (kwhEff / kmParzEff) * 100 : null
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
          <input type="text" value={fLuogo} onChange={e => setFLuogo(e.target.value.toUpperCase())} placeholder="CASA..." style={inputSt(T)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>KM Totali</label>
          <input type="number" value={fKm} onChange={e => setFKm(e.target.value)} placeholder="0" style={inputSt(T)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>KM Parziali</label>
          <input type="number" value={fKmParz} onChange={e => setFKmParz(e.target.value)} placeholder={kmParzAuto ? String(kmParzAuto) : ''} style={inputSt(T)} />
          {kmParzAuto && !(kmParzN > 0) && <div style={{ fontSize: '0.6rem', color: T.accent, marginTop: 2 }}>⚡ calcolato automaticamente</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>% Prima</label>
          <input type="number" value={fPrima} onChange={e => setFPrima(e.target.value)} placeholder="0" style={inputSt(T)} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[settings.p1a, settings.p1b].map(v => <button key={v} onClick={() => setFPrima(String(v))} style={chipSt}>{v}%</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>% Dopo</label>
          <input type="number" value={fDopo} onChange={e => setFDopo(e.target.value)} placeholder="100" style={inputSt(T)} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[settings.p2a, settings.p2b].map(v => <button key={v} onClick={() => setFDopo(String(v))} style={chipSt}>{v}%</button>)}
          </div>
        </div>
        <div style={{ gridColumn: '1/-1', background: 'rgba(0,229,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: T.text2, textTransform: 'uppercase' }}>Differenza %</div>
            <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: T.accent }}>{diff > 0 ? diff.toFixed(0) + ' %' : '—'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: T.text2, textTransform: 'uppercase' }}>kWh teorici</div>
            <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: T.accent }}>{kwhTeor > 0 ? kwhTeor.toFixed(2) + ' kWh' : '—'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>Prezzo €/kWh</label>
          <input type="number" value={fPrezzo} onChange={e => setFPrezzo(e.target.value)} step="0.001" style={inputSt(T)} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setFPrezzo('0.2'); setFLuogo('CASA'); }} style={chipSt}>€0.20</button>
            <button onClick={() => setFPrezzo('0.5')} style={chipSt}>€0.50</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>Costo €</label>
          <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: T.green, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, borderRadius: 10 }}>
            {costo > 0 ? '€ ' + costo.toFixed(2) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>kWh effettivi</label>
          <input type="number" value={fKwh} onChange={e => setFKwh(e.target.value)} placeholder="dal display" step="0.01" style={inputSt(T)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>kWh / 100km</label>
          <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: T.accent2, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, borderRadius: 10 }}>
            {kwh100 ? kwh100.toFixed(2) : '—'}
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
  const [themeMode,  setThemeMode]  = useState(() => localStorage.getItem('mgs5_theme') || 'auto');
  const [ricariche,  setRicariche]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [settings,   setSettings]   = useState(() => {
    try { const s = localStorage.getItem('mgs5_settings'); return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_SETTINGS }; } catch { return { ...DEFAULT_SETTINGS }; }
  });
  const [editIdx,    setEditIdx]    = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [mesiAperti, setMesiAperti] = useState({});
  const [openSec,    setOpenSec]    = useState({ veicolo: true, preset: false, account: false, sheets: false, danger: false });
  const { toast, show: showToast }  = useToast();

  useEffect(() => { loadRicariche(); }, []);
  useEffect(() => { try { localStorage.setItem('mgs5_settings', JSON.stringify(settings)); } catch {} }, [settings]);

  async function loadRicariche() {
    setRicariche([]);
  }

  async function esportaSheets() {
    const url = getSheetsUrl();
    try {
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ ricariche, settings }),
      });
    } catch (e) {
      showToast('❌ Errore Sheets', '#ef4444');
    }
  }

  async function salvaRicarica(record) {
    const nuove = record.id
      ? ricariche.map(r => r.id === record.id ? record : r)
      : [...ricariche, { ...record, id: Date.now() }];
    setRicariche(ricalcolaKmParziali(nuove));
    showToast(record.id ? '✅ Aggiornata!' : '✅ Salvata!');
    const adminEmail = localStorage.getItem('mgs5_adminEmail') || '';
    if (adminEmail) { await esportaSheets(); }
    setEditIdx(null); setView('home');
  }

  async function cancellaRicarica(idx) {
    if (idx === 'all') {
      setRicariche([]);
      showToast('🗑 Dati resettati');
    } else {
      setRicariche(ricalcolaKmParziali(ricariche.filter((_, i) => i !== idx)));
      showToast('🗑 Ricarica rimossa');
    }
    setConfirmIdx(null);
  }

  const isDark = themeMode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : themeMode === 'dark';
  const theme = isDark ? THEMES.dark : THEMES.light;

  const totali = ricariche.reduce((acc, r) => {
    acc.costo += Number(r.costo) || 0;
    acc.kwh   += Number(r.kwhEff) || 0;
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
    raggruppatoPerMese[mKey].kwhTotali   += Number(r.kwhEff) || 0;
    raggruppatoPerMese[mKey].costoTotale += Number(r.costo) || 0;
    raggruppatoPerMese[mKey].kmTotali    += Number(r.kmParziali) || 0;
  });

  const graficiMesi     = Object.keys(raggruppatoPerMese).sort().slice(-6).map(m => ({ x: MESI_BREVI[parseInt(m.split('-')[1]) - 1], y: raggruppatoPerMese[m].costoTotale }));
  const graficiConsumi  = ricariche.filter(r => r.kwh100 > 0).slice(-10).map((r, i) => ({ x: i + 1, y: r.kwh100 }));

  const toggleSec = (key) => setOpenSec(p => ({ ...p, [key]: !p[key] }));

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: theme.bg, color: theme.text, minHeight: '100vh', maxWidth: 480, margin: '0 auto', paddingBottom: 80, position: 'relative', boxSizing: 'border-box' }}>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 500, padding: '12px 24px', background: toast.color, color: '#fff', borderRadius: 30, fontWeight: 700 }}>{toast.msg}</div>}
      {confirmIdx !== null && <ConfirmDialog messaggio={confirmIdx === 'all' ? 'Vuoi cancellare tutto?' : 'Cancellare la ricarica?'} onConfirm={() => cancellaRicarica(confirmIdx)} onCancel={() => setConfirmIdx(null)} />}

      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: theme.headerBg, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${theme.border}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>MG<span style={{ color: '#ef4444' }}>S5</span></div>
          <div style={{ fontSize: '0.65rem', color: theme.text2 }}>{settings.targa} • {ricariche.length} ricariche</div>
        </div>
        <button onClick={() => { const n = themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'auto' : 'dark'; setThemeMode(n); localStorage.setItem('mgs5_theme', n); }} style={{ padding: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.text, cursor: 'pointer' }}>
          {themeMode === 'auto' ? '🌓 Auto' : themeMode === 'dark' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </header>

      <main style={{ padding: '20px 16px' }}>
        {view === 'home' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 14 }}>
                <div style={{ fontSize: '0.62rem', color: theme.text2, textTransform: 'uppercase' }}>Spesa Totale</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: theme.green, fontFamily: 'monospace' }}>€ {totali.costo.toFixed(2)}</div>
              </div>
              <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 14 }}>
                <div style={{ fontSize: '0.62rem', color: theme.text2, textTransform: 'uppercase' }}>Media Consumo</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: theme.text, fontFamily: 'monospace' }}>{mediaKwh100 ? mediaKwh100.toFixed(2) : '—'}</div>
                <div style={{ fontSize: '0.55rem', color: theme.text2 }}>kWh / 100km</div>
              </div>
            </div>

            {editIdx !== null ? (
              <FormRicarica settings={settings} ricariche={ricariche} editIdx={editIdx} onSave={salvaRicarica} onCancel={() => setEditIdx(null)} showToast={showToast} theme={theme} />
            ) : (
              <button onClick={() => setView('nuovo')} style={{ width: '100%', padding: 16, background: `linear-gradient(135deg,${theme.accent},${theme.accent2})`, border: 'none', borderRadius: 16, color: '#fff', fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>⚡ Nuova Ricarica</button>
            )}

            {loading && <div style={{ textAlign: 'center', color: theme.text2 }}>Caricamento...</div>}

            {Object.keys(raggruppatoPerMese).sort((a, b) => b.localeCompare(a)).map(mKey => {
              const mData = raggruppatoPerMese[mKey];
              const nomeMese = MESI_NOMI[parseInt(mKey.split('-')[1]) - 1] + ' ' + mKey.split('-')[0];
              const aperto = mesiAperti[mKey] ?? false;
              return (
                <div key={mKey} style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                  <div onClick={() => setMesiAperti(p => ({ ...p, [mKey]: !aperto }))} style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', alignItems: 'center' }}>
                    <div>
                      <strong>{nomeMese}</strong>
                      <div style={{ fontSize: '0.65rem', color: theme.text2 }}>{mData.ricariche.length} ricariche • {mData.kmTotali} KM</div>
                    </div>
                    <div style={{ color: theme.green, fontFamily: 'monospace', fontWeight: 800 }}>€ {mData.costoTotale.toFixed(2)}</div>
                  </div>
                  {aperto && (
                    <div style={{ padding: 8, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {mData.ricariche.map(r => {
                        const idx = ricariche.findIndex(x => x.id === r.id);
                        return (
                          <div key={r.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div>{r.data.slice(8, 10)}/{r.data.slice(5, 7)} {r.luogo && `• ${r.luogo}`}</div>
                              <div style={{ fontSize: '0.65rem', color: theme.text2 }}>{r.pctPrima}% → {r.pctDopo}% | {r.kwhEff.toFixed(1)} kWh</div>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button onClick={() => setEditIdx(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>✏️</button>
                              <button onClick={() => setConfirmIdx(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}>🗑</button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: '0.65rem', color: theme.text2, marginBottom: 12, textTransform: 'uppercase' }}>Spesa Mensile (€)</div>
              <BarChart data={graficiMesi} color={theme.green} />
            </div>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: '0.65rem', color: theme.text2, marginBottom: 12, textTransform: 'uppercase' }}>Andamento Consumi (kWh/100km)</div>
              <LineChart data={graficiConsumi} color={theme.accent} />
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('veicolo')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
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
                    <input type="number" value={settings.batteria} onChange={e => setSettings({ ...settings, batteria: parseFloat(e.target.value) || 64 })} style={inputSt(theme)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', color: theme.text2 }}>PREZZO DEFAULT (€/kWh)</label>
                    <input type="number" value={settings.prezzo} onChange={e => setSettings({ ...settings, prezzo: parseFloat(e.target.value) || 0.5 })} step="0.01" style={inputSt(theme)} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('preset')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <span>🔢 Pulsanti Rapidi (%)</span><span>{openSec.preset ? '▲' : '▼'}</span>
              </div>
              {openSec.preset && (
                <div style={{ padding: 14, borderTop: `1px solid ${theme.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Prima (A)</label><input type="number" value={settings.p1a} onChange={e => setSettings({ ...settings, p1a: parseInt(e.target.value) || 0 })} style={inputSt(theme)} /></div>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Prima (B)</label><input type="number" value={settings.p1b} onChange={e => setSettings({ ...settings, p1b: parseInt(e.target.value) || 0 })} style={inputSt(theme)} /></div>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Dopo (A)</label><input type="number" value={settings.p2a} onChange={e => setSettings({ ...settings, p2a: parseInt(e.target.value) || 0 })} style={inputSt(theme)} /></div>
                  <div><label style={{ fontSize: '0.65rem', color: theme.text2 }}>Dopo (B)</label><input type="number" value={settings.p2b} onChange={e => setSettings({ ...settings, p2b: parseInt(e.target.value) || 0 })} style={inputSt(theme)} /></div>
                </div>
              )}
            </div>

            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div onClick={() => toggleSec('sheets')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <span>📊 Google Sheets</span><span>{openSec.sheets ? '▲' : '▼'}</span>
              </div>
              {openSec.sheets && (
                <div style={{ padding: 14, borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ConfigSheet showToast={showToast} theme={theme} />
                  <button onClick={async () => {
                    const adminEmail = localStorage.getItem('mgs5_adminEmail') || '';
                    if (!adminEmail) { showToast('❌ Imposta prima l\'email admin', '#ef4444'); return; }
                    await esportaSheets();
                    showToast('☁️ Backup inviato a Sheets!');
                  }} style={{ padding: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', color: '#10b981', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    ☁️ Esporta Ora
                  </button>
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

          </div>
        )}
      </main>

      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: theme.navBg, borderTop: `1px solid ${theme.border}`, display: 'flex', padding: '8px 0', zIndex: 200 }}>
        {[{ id: 'home', l: 'Home', i: '🏠' }, { id: 'grafici', l: 'Grafici', i: '📊' }, { id: 'settings', l: 'Opzioni', i: '⚙️' }].map(t => (
          <button key={t.id} onClick={() => { setView(t.id); setEditIdx(null); }} style={{ flex: 1, background: 'transparent', border: 'none', color: view === t.id ? theme.accent : theme.text2, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span>{t.i}</span><span style={{ fontSize: '0.65rem' }}>{t.l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
