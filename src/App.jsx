import { useState, useEffect } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qvumsogedmqqrytvoajh.supabase.co";
const SUPABASE_KEY = "sb_publishable_vxNzIfXIV6Qm1ZmMEtfk3Q_q7N-rc_z";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwE6U_h_lUBuNOOGedHxs7nAiLuP71YUcSmpbGZn1TyjusCmdmszC6Qqh7o4carU49l/exec";

const MESI_NOMI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

const DEFAULT_SETTINGS = { batteria: 64, prezzo: 0.50, targa: 'MGS5', p1a: 20, p1b: 30, p2a: 80, p2b: 100 };

const THEMES = {
  dark: {
    bg: '#0a0f1e', bg2: 'rgba(255,255,255,0.04)', border: 'rgba(0,229,255,0.15)',
    accent: '#00e5ff', accent2: '#7c3aed', green: '#10b981',
    text: '#e2e8f0', text2: '#94a3b8', headerBg: 'rgba(10,15,30,0.95)', navBg: 'rgba(10,15,30,0.95)'
  },
  light: {
    bg: '#f0f4f8', bg2: 'rgba(0,0,0,0.04)', border: 'rgba(0,140,200,0.25)',
    accent: '#0070a8', accent2: '#5b21b6', green: '#047857',
    text: '#1e293b', text2: '#64748b', headerBg: 'rgba(240,244,248,0.95)', navBg: 'rgba(240,244,248,0.95)'
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

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, color = '#10b981') => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2500);
  };
  return { toast, show };
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
            {[settings.p1a, settings.p1b].map(v => <button key={v} onClick={() => setFPrima(String(v))} style={chipSt(T)}>{v}%</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: T.text2 }}>% Dopo</label>
          <input type="number" value={fDopo} onChange={e => setFDopo(e.target.value)} placeholder="100" style={inputSt(T)} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[settings.p2a, settings.p2b].map(v => <button key={v} onClick={() => setFDopo(String(v))} style={chipSt(T)}>{v}%</button>)}
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
            <button onClick={() => { setFPrezzo('0.2'); setFLuogo('CASA'); }} style={chipSt(T)}>€0.20</button>
            <button onClick={() => setFPrezzo('0.5')} style={chipSt(T)}>€0.50</button>
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
  const [loading,    setLoading]    = useState(true);
  const [settings,   setSettings]   = useState(() => {
    try { const s = localStorage.getItem('mgs5_settings'); return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_SETTINGS }; } catch { return { ...DEFAULT_SETTINGS }; }
  });
  const [editIdx,    setEditIdx]    = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [mesiAperti, setMesiAperti] = useState({});
  const [openSec,    setOpenSec]    = useState({ veicolo: true, preset: false, sheets: false, danger: false });
  const { toast, show: showToast }  = useToast();

  useEffect(() => {
    const s = document.createElement('style');
    s.textContent = 'input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}';
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  useEffect(() => { loadRicariche(); }, []);
  useEffect(() => { try { localStorage.setItem('mgs5_settings', JSON.stringify(settings)); } catch {} }, [settings]);

  async function loadRicariche() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ricariche')
        .select('*')
        .order('data', { ascending: true });
      if (error) throw error;
      const lista = (data || []).map(sanitizzaRicarica);
      setRicariche(ricalcolaKmParziali(lista));
      // salva anche in localStorage come backup
      localStorage.setItem('mgs5_ricariche', JSON.stringify(lista));
    } catch (e) {
      // fallback a localStorage se Supabase non risponde
      try {
        const local = localStorage.getItem('mgs5_ricariche');
        if (local) setRicariche(ricalcolaKmParziali(JSON.parse(local)));
      } catch {}
      showToast('⚠️ Usando dati locali', '#f59e0b');
    }
    setLoading(false);
  }

  async function salvaRicarica(record) {
    try {
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
        costo: record.costo > 0 ? record.costo : record.kwhEff * record.prezzoKwh,
        kwh_100: record.kwh100,
      };

      if (record.id) {
        const { error } = await supabase.from('ricariche').update(dbRecord).eq('id', record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ricariche').insert(dbRecord);
        if (error) throw error;
      }
      showToast(record.id ? '✅ Aggiornata!' : '✅ Salvata!');
      await loadRicariche();
    } catch (e) {
      showToast('❌ Errore salvataggio: ' + (e.message || ''), '#ef4444');
    }
    setEditIdx(null);
    setView('home');
  }

  async function cancellaRicarica(idx) {
    try {
      if (idx === 'all') {
        const { error } = await supabase.from('ricariche').delete().neq('id', 0);
        if (error) throw error;
        setRicariche([]);
        localStorage.removeItem('mgs5_ricariche');
        showToast('🗑 Dati resettati');
      } else {
        const r = ricariche[idx];
        if (r?.id) {
          const { error } = await supabase.from('ricariche').delete().eq('id', r.id);
          if (error) throw error;
        }
        const nuove = ricalcolaKmParziali(ricariche.filter((_, i) => i !== idx));
        setRicariche(nuove);
        localStorage.setItem('mgs5_ricariche', JSON.stringify(nuove));
        showToast('🗑 Ricarica rimossa');
      }
    } catch (e) {
      showToast('❌ Errore cancellazione', '#ef4444');
    }
    setConfirmIdx(null);
  }

  async function esportaSheets() {
    const url = localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL;
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ ricariche, settings }) });
      showToast('☁️ Esportato su Sheets!');
    } catch (e) {
      showToast('❌ Errore Sheets', '#ef4444');
    }
  }

  async function importaSheets() {
    const url = localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL;
    try {
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
    }
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
    raggruppatoPerMese[mKey].ricariche.sort((a,b) => (b.km||0) - (a.km||0));    raggruppatoPerMese[mKey].kwhTotali   += Number(r.kwhEff) || 0;
    raggruppatoPerMese[mKey].costoTotale += Number(r.costo) || 0;
    raggruppatoPerMese[mKey].kmTotali    += Number(r.kmParziali) || 0;
  });

  const graficiMesi    = Object.keys(raggruppatoPerMese).sort().slice(-6).map(m => ({ x: MESI_BREVI[parseInt(m.split('-')[1]) - 1], y: raggruppatoPerMese[m].costoTotale }));
  const graficiConsumi = ricariche.filter(r => r.kwh100 > 0).slice(-10).map((r, i) => ({ x: i + 1, y: r.kwh100 }));

  const toggleSec = (key) => setOpenSec(p => ({ ...p, [key]: !p[key] }));

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: theme.bg, color: theme.text, minHeight: '100vh', maxWidth: 480, margin: '0 auto', paddingBottom: 80, position: 'relative', boxSizing: 'border-box' }}>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 500, padding: '12px 24px', background: toast.color, color: '#fff', borderRadius: 30, fontWeight: 700, whiteSpace: 'nowrap' }}>{toast.msg}</div>}
      {confirmIdx !== null && <ConfirmDialog messaggio={confirmIdx === 'all' ? 'Vuoi cancellare tutto?' : 'Cancellare la ricarica?'} onConfirm={() => cancellaRicarica(confirmIdx)} onCancel={() => setConfirmIdx(null)} theme={theme} />}

      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: theme.headerBg, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${theme.border}`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>MG<span style={{ color: '#ef4444' }}>S5</span></div>
          <a href={localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', padding:'3px 9px', background:'rgba(0,229,255,0.08)', border:'1px solid rgba(0,229,255,0.25)', borderRadius:20, color:theme.accent, fontSize:'0.75rem', fontWeight:700, textDecoration:'none' }}>📊</a>
          <button onClick={() => { const n = themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'auto' : 'dark'; setThemeMode(n); localStorage.setItem('mgs5_theme', n); }} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${theme.border}`, borderRadius: 20, color: theme.text2, cursor: 'pointer', fontSize: '0.7rem' }}>
            {themeMode === 'auto' ? '🌓' : themeMode === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.accent }}>{totali.km > 0 ? totali.km.toLocaleString('it') : '—'}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.accent }}>€{totali.costo.toFixed(2)}</div>
          <div style={{ fontSize: '0.55rem', color: theme.text2, textTransform: 'uppercase' }}>KM TOTALI</div>
          <div style={{ fontSize: '0.55rem', color: theme.text2, textTransform: 'uppercase' }}>COSTO TOT.</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.accent }}>{totali.kwh.toFixed(1)}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.accent }}>{mediaKwh100 ? mediaKwh100.toFixed(2) : '—'}</div>
          <div style={{ fontSize: '0.55rem', color: theme.text2, textTransform: 'uppercase' }}>KWH TOTALI</div>
          <div style={{ fontSize: '0.55rem', color: theme.text2, textTransform: 'uppercase' }}>MEDIA /100KM</div>
        </div>
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
              <button onClick={() => setView('nuovo')} style={{ width: '100%', padding: 16, background: `linear-gradient(135deg,${theme.accent},${theme.accent2})`, border: 'none', borderRadius: 16, color: '#fff', fontWeight: 800, cursor: 'pointer', marginBottom: 16, fontSize: '1rem' }}>⚡ Nuova Ricarica</button>
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
                      <div style={{ fontWeight: 900, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', lineHeight: 1.2 }}>{MESI_NOMI[parseInt(mKey.split('-')[1]) - 1]}</div>
                      <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.06em', color: '#fff', lineHeight: 1.2 }}>{mKey.split('-')[0]}</div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: 8 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>{mData.ricariche.length} ric</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>tot</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>{mData.ricariche.filter(r => (r.luogo||'').toUpperCase()==='CASA').length} ric</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: theme.text2, lineHeight: 1.8 }}>casa</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.accent, lineHeight: 1.8 }}>€{mData.costoTotale.toFixed(2)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.accent, lineHeight: 1.8 }}>{mData.kwhTotali.toFixed(1)} kWh</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.green, lineHeight: 1.8 }}>€{mData.ricariche.filter(r=>(r.luogo||'').toUpperCase()==='CASA').reduce((s,r)=>s+r.costo,0).toFixed(2)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: theme.green, lineHeight: 1.8 }}>{mData.ricariche.filter(r=>(r.luogo||'').toUpperCase()==='CASA').reduce((s,r)=>s+r.kwhEff,0).toFixed(1)} kWh</div>
                    </div>
                  </div>
                  {aperto && (
                    <div style={{ padding: 8, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {mData.ricariche.map(r => {
                        const idx = ricariche.findIndex(x => x.id === r.id);
                        return (
                          <div key={r.id} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: theme.text2, fontWeight: 600 }}>{r.data.slice(8,10)}/{r.data.slice(5,7)}/{r.data.slice(0,4)}{r.luogo ? ' · '+r.luogo : ''}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: theme.text2 }}>{Math.round(r.pctPrima > 1 ? r.pctPrima : r.pctPrima * 100)}→{Math.round(r.pctDopo > 1 ? r.pctDopo : r.pctDopo * 100)}%</div>
                                <button onClick={() => { setEditIdx(idx); setView('home'); }} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', padding: '4px 6px', fontSize: '1rem' }}>✏️</button>
                                <button onClick={() => setConfirmIdx(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', fontSize: '1.1rem', fontWeight: 700 }}>✕</button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                              <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'monospace', color: theme.text }}>{(r.kwhEff||0).toFixed(2)} kWh</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#f59e0b' }}>{r.kwh100 ? r.kwh100.toFixed(2)+' kWh/100km' : '—'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontSize: '0.9rem', color: theme.text2, lineHeight: 1.6 }}>
                                {r.prezzoKwh ? '€'+r.prezzoKwh+'/kWh' : '—'}
                                {r.kmParziali ? '  ·  +'+r.kmParziali+' km' : ''}
                                {r.km ? '  ·  '+r.km.toLocaleString('it')+' km tot' : ''}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 700, color: theme.green }}>€{(r.costo||0).toFixed(2)}</div>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: '0.65rem', color: theme.text2, marginBottom: 12, textTransform: 'uppercase' }}>Spesa Mensile (€)</div>
              <BarChart data={graficiMesi} color={theme.green} />
            </div>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: '0.65rem', color: theme.text2, marginBottom: 12, textTransform: 'uppercase' }}>Andamento Consumi (kWh/100km)</div>
              <LineChart data={graficiConsumi} color={theme.accent} />
            </div>
            <div style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: '0.65rem', color: theme.text2, marginBottom: 8, textTransform: 'uppercase' }}>Riepilogo Totale</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: theme.green, fontFamily: 'monospace' }}>€{totali.costo.toFixed(0)}</div>
                  <div style={{ fontSize: '0.6rem', color: theme.text2 }}>Spesa totale</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: theme.accent, fontFamily: 'monospace' }}>{totali.kwh.toFixed(0)}</div>
                  <div style={{ fontSize: '0.6rem', color: theme.text2 }}>kWh totali</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: theme.accent2, fontFamily: 'monospace' }}>{totali.km.toFixed(0)}</div>
                  <div style={{ fontSize: '0.6rem', color: theme.text2 }}>KM totali</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'dati' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.65rem', color: theme.text2, textTransform: 'uppercase', marginBottom: 4 }}>Tutte le ricariche ({ricariche.length})</div>
            {ricariche.slice().reverse().map((r, i) => {
              const idx = ricariche.findIndex(x => x.id === r.id);
              return (
                <div key={r.id} style={{ background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: theme.text }}>{r.data} {r.luogo && <span style={{ color: theme.accent }}>• {r.luogo}</span>}</div>
                    <div style={{ fontSize: '0.65rem', color: theme.text2 }}>{r.pctPrima}%→{r.pctDopo}% | {r.kwhEff.toFixed(1)}kWh | €{r.costo.toFixed(2)}{r.kwh100 ? ` | ${r.kwh100.toFixed(1)}kWh/100` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setEditIdx(idx); setView('home'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✏️</button>
                    <button onClick={() => setConfirmIdx(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>🗑</button>
                  </div>
                </div>
              );
            })}
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
              <div onClick={() => toggleSec('preset')} style={{ padding: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: theme.text }}>
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
        {[
          { id: 'home',     l: 'HOME',    i: '🏠' },
          { id: 'nuovo',    l: 'AGGIUNGI', i: '➕' },
          { id: 'grafici',  l: 'GRAFICI',  i: '📊' },
          { id: 'dati',     l: 'DATI',     i: '📋' },
          { id: 'settings', l: 'CONFIG',   i: '⚙️' }
        ].map(t => {
          const active = view === t.id;
          return (
          <button key={t.id} onClick={() => { setView(t.id); setEditIdx(null); }} style={{ flex: 1, background: active ? 'rgba(0,229,255,0.1)' : 'transparent', border: 'none', borderTop: active ? `2px solid ${theme.accent}` : '2px solid transparent', color: active ? theme.accent : theme.text2, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 0', transition: 'all 0.2s' }}>
            <span style={{ fontSize: '1.1rem' }}>{t.i}</span>
            <span style={{ fontSize: '0.55rem', letterSpacing: '0.05em', fontWeight: active ? 800 : 400 }}>{t.l}</span>
          </button>
          );
        })
       })}
      </nav>
    </div>
  );
}
