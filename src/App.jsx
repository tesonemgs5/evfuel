import { useState, useEffect } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://svhvqgqnspwzlluvujhs.supabase.co";
const SUPABASE_KEY = "sb_publishable_O2M4R6Fd_VPyKQd5t-WsrA_CW4dBARG";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbyb70PcCzlVoACCdodeyJ2vmhg9v1_NaEAIlkj_jpBvE4RuFK0kO5d24zsKkAC2Ccwc/exec";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MESI_NOMI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const DEFAULT_SETTINGS = { batteria: 64, prezzo: 0.50, targa: 'MGS5', p1a: 20, p1b: 30, p2a: 80, p2b: 100 };

const S = {
  bg: '#0a0f1e', bg2: 'rgba(255,255,255,0.04)', border: 'rgba(0,229,255,0.15)', accent: '#00e5ff',
  accent2: '#7c3aed', green: '#10b981', text: '#e2e8f0', text2: '#94a3b8'
};

const THEMES = {
  dark: { bg:'#0a0f1e', bg2:'rgba(255,255,255,0.04)', border:'rgba(0,229,255,0.15)', accent:'#00e5ff', accent2:'#7c3aed', green:'#10b981', text:'#e2e8f0', text2:'#94a3b8', headerBg:'rgba(10,15,30,0.95)', navBg:'rgba(10,15,30,0.95)' },
  light: { bg:'#f0f4f8', bg2:'rgba(0,0,0,0.04)', border:'rgba(0,140,200,0.25)', accent:'#0070a8', accent2:'#5b21b6', green:'#047857', text:'#1e293b', text2:'#64748b', headerBg:'rgba(240,244,248,0.95)', navBg:'rgba(240,244,248,0.95)' }
};

const inputSt = (theme) => ({
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${theme.border}`, borderRadius: 10,
  color: theme.text, fontFamily: 'monospace', fontSize: '1rem', padding: '10px 12px',
  width: '100%', outline: 'none', boxSizing: 'border-box'
});

const chipSt = {
  padding: '4px 10px', background: 'rgba(0,229,255,0.08)',
  border: '1px solid rgba(0,229,255,0.2)', borderRadius: 20, color: S.accent, fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'pointer'
};

function today() { return new Date().toISOString().split('T')[0]; }
function toNum(x, def = 0) { const n = Number(x); return Number.isFinite(n) ? n : def; }

function normalizzaData(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0,10);
  const dt = new Date(d);
  return !isNaN(dt) ? dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0') : String(d).slice(0,10);
}

function sanitizzaRicarica(r) {
  return {
    id: r?.id || null, luogo: ((r?.luogo||'').toString().trim().toUpperCase()) || '', data: normalizzaData(r?.data),
    kwhEff: toNum(r?.kwh_eff ?? r?.kwhEff, 0), kwhTeor: toNum(r?.kwh_teor ?? r?.kwhTeor, 0), costo: toNum(r?.costo, 0), prezzoKwh: toNum(r?.prezzo_kwh ?? r?.prezzoKwh, 0),
    pctPrima: toNum(r?.pct_prima ?? r?.pctPrima, 0), pctDopo: toNum(r?.pct_dopo ?? r?.pctDopo, 0),
    kwh100: r?.kwh_100 != null ? toNum(r.kwh_100, null) : (r?.kwh100 != null ? toNum(r.kwh100, null) : null),
    km: r?.km != null ? toNum(r.km, null) : null,
    kmParziali: r?.km_parziali != null ? toNum(r.km_parziali, null) : (r?.kmParziali != null ? toNum(r.kmParziali, null) : null)
  };
}

function ricalcolaKmParziali(lista) {
  return lista.map((r, i) => {
    if (r.km && r.km > 0) {
      const prev = lista.slice(0, i).filter(x => x.km && x.km > 0).pop();
      const kmParziali = prev ? r.km - prev.km : r.kmParziali;
      const kwh100 = kmParziali && kmParziali > 0 ? (r.kwhEff / kmParziali) * 100 : r.kwh100;
      return { ...r, kmParziali: kmParziali || r.kmParziali, kwh100 };
    }
    return r;
  });
}

function toDbRecord(r, userId) {
  return {
    user_id: userId, data: r.data, luogo: r.luogo || null, km: r.km, km_parziali: r.kmParziali,
    pct_prima: r.pctPrima, pct_dopo: r.pctDopo, kwh_eff: r.kwhEff, kwh_teor: r.kwhTeor, prezzo_kwh: r.prezzoKwh,
    costo: (r.costo && r.costo > 0) ? r.costo : r.kwhEff * r.prezzoKwh, kwh_100: r.kwh100
  };
}

function BarChart({ data, color = '#00e5ff' }) {
  if (!data.length) return <div style={{ height:140, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:'0.75rem' }}>Nessun dato</div>;
  const max = Math.max(...data.map(d => d.y));
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:140, padding:'8px 0' }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end' }}>
          <div style={{ width:'100%', background:color+'99', borderRadius:4, height:max?`${(d.y/max)*100}px`:0, minHeight:d.y?4:0 }}/>
          <div style={{ fontSize:'0.55rem', color:'#94a3b8' }}>{d.x}</div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, color = '#7c3aed' }) {
  if (data.length < 2) return <div style={{ height:140, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:'0.75rem' }}>Servono almeno 2 punti</div>;
  const w=300, h=100;
  const ys=data.map(d=>d.y), minY=Math.min(...ys), maxY=Math.max(...ys);
  const px=i=>(i/(data.length-1))*w;
  const py=y=>h-((y-minY)/(maxY-minY||1))*(h-10)-5;
  const pts=data.map((d,i)=>`${px(i)},${py(d.y)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height:140 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      {data.map((d,i)=><circle key={i} cx={px(i)} cy={py(d.y)} r="3" fill={color}/>)}
    </svg>
  );
}

function ConfirmDialog({ messaggio, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(239,68,68,0.4)', borderRadius:20, padding:24, maxWidth:320, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:'1rem', fontWeight:700, marginBottom:20 }}>{messaggio}</div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel} style={{ flex:1, padding:'10px 0', background:'transparent', border:`1px solid ${S.border}`, borderRadius:10, color:S.text2, cursor:'pointer' }}>Annulla</button>
          <button onClick={onConfirm} style={{ flex:1, padding:'10px 0', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.5)', borderRadius:10, color:'#ef4444', fontWeight:700, cursor:'pointer' }}>Conferma</button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleSubmit() {
    if (!email || (!password && mode !== 'reset')) { setMsg({ text:'Compila tutti i campi', color:'#f59e0b' }); return; }
    setLoading(true); setMsg(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({ text:'✅ Registrato! Controlla la tua email.', color:'#10b981' });
        setMode('login'); setLoading(false); return;
      }
    } catch(e) { setMsg({ text: '❌ ' + (e.message || 'Errore'), color:'#ef4444' }); }
    setLoading(false);
  }

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', background:S.bg, color:S.text, minHeight:'100vh', maxWidth:480, margin:'0 auto', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:360 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:'2.5rem', fontWeight:900, marginBottom:8 }}>MG<span style={{color:'#ef4444'}}>S5</span></div>
          <div style={{ fontSize:'0.8rem', color:S.text2, textTransform:'uppercase' }}>Gestione Ricariche EV</div>
        </div>
        <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:20, padding:24 }}>
          <div style={{ display:'flex', gap:8, marginBottom:24 }}>
            <button onClick={()=>setMode('login')} style={{ flex:1, padding:'10px 0', background: mode==='login' ? `linear-gradient(135deg,${S.accent},${S.accent2})` : 'transparent', border: mode==='login' ? 'none' : `1px solid ${S.border}`, borderRadius:10, color:'#fff', fontWeight:700, cursor:'pointer' }}>Accedi</button>
            <button onClick={()=>setMode('register')} style={{ flex:1, padding:'10px 0', background: mode==='register' ? `linear-gradient(135deg,${S.accent},${S.accent2})` : 'transparent', border: mode==='register' ? 'none' : `1px solid ${S.border}`, borderRadius:10, color:'#fff', fontWeight:700, cursor:'pointer' }}>Registrati</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inputSt(S)}/>
            </div>
            <div>
              <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={inputSt(S)}/>
            </div>
          </div>
          {msg && <div style={{ marginTop:14, color:msg.color, fontSize:'0.8rem' }}>{msg.text}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ width:'100%', marginTop:20, padding:'14px 0', background:`linear-gradient(135deg,${S.accent},${S.accent2})`, border:'none', borderRadius:12, color:'#fff', fontWeight:800, cursor:'pointer' }}>
            {loading ? '...' : mode === 'login' ? '⚡ Accedi' : '🚀 Registrati'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormRicarica({ settings, ricariche, editIdx, onSave, onCancel, showToast, theme }) {
  const ex = editIdx !== null ? ricariche[editIdx] : null;
  const [fData, setFData] = useState(ex ? ex.data : today());
  const [fLuogo, setFLuogo] = useState(ex ? (ex.luogo||'') : '');
  const [fKm, setFKm] = useState(ex && ex.km !== null ? String(ex.km) : '');
  const [fKmParz, setFKmParz] = useState(ex && ex.kmParziali !== null ? String(ex.kmParziali) : '');
  const [fPrima, setFPrima] = useState(ex ? String(ex.pctPrima > 1 ? ex.pctPrima : ex.pctPrima * 100) : '');
  const [fDopo, setFDopo] = useState(ex ? String(ex.pctDopo > 1 ? ex.pctDopo : ex.pctDopo * 100) : '');
  const [fKwh, setFKwh] = useState(ex ? String(ex.kwhEff) : '');
  const [fPrezzo, setFPrezzo] = useState(ex ? String(ex.prezzoKwh) : String(settings.prezzo));

  useEffect(() => {
    const v = parseFloat(fPrezzo);
    if (Math.abs(v - 0.2) < 0.001 && fLuogo !== 'CASA') setFLuogo('CASA');
  }, [fPrezzo]);

  const prima=parseFloat(fPrima)||0, dopo=parseFloat(fDopo)||0;
  const diff=dopo-prima, kwhTeor=settings.batteria*(diff/100);
  const kwhEff=parseFloat(fKwh)||kwhTeor;
  const prezzo=parseFloat(fPrezzo)||settings.prezzo;
  const costo=kwhEff*prezzo;
  const kmParzN=parseFloat(fKmParz), kmN=parseFloat(fKm);

  let kmParzAuto=null;
  if (!isNaN(kmN)&&kmN>0&&!(kmParzN>0)) {
    const altri=editIdx!==null?ricariche.filter((_,i)=>i!==editIdx):ricariche;
    const prev=[...altri].filter(r=>r.km&&r.km<kmN).sort((a,b)=>b.km-a.km)[0];
    if (prev) kmParzAuto=kmN-prev.km;
  }
  const kmParzEff=(kmParzN>0)?kmParzN:kmParzAuto;
  const kwh100=kmParzEff?(kwhEff/kmParzEff)*100:null;

  function salva() {
    if (!fData||prima<=0||dopo<=0){showToast('⚠️ Compila data e %','#f59e0b');return;}
    if (dopo<=prima){showToast('⚠️ % dopo > % prima','#f59e0b');return;}
    onSave({
      id: ex?.id || null, data:fData, luogo:fLuogo||null, km:parseFloat(fKm)||null,
      pctPrima:prima, pctDopo:dopo, kwhEff, kwhTeor, prezzoKwh:prezzo, costo,
      kmParziali:kmParzEff||null, kwh100
    });
  }

  return (
    <div style={{ background:theme.bg2, border:`1px solid ${theme.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>Data</label><input type="date" value={fData} onChange={e=>setFData(e.target.value)} style={inputSt(theme)}/></div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>Dove</label><input type="text" value={fLuogo} onChange={e=>setFLuogo(e.target.value.toUpperCase())} placeholder="CASA..." style={inputSt(theme)}/></div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>KM Totali</label><input type="number" value={fKm} onChange={e=>setFKm(e.target.value)} style={inputSt(theme)}/></div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>KM Parziali</label><input type="number" value={fKmParz} onChange={e=>setFKmParz(e.target.value)} placeholder={kmParzAuto?String(kmParzAuto):''} style={inputSt(theme)}/></div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>% Prima</label><input type="number" value={fPrima} onChange={e=>setFPrima(e.target.value)} style={inputSt(theme)}/><div style={{ display:'flex', gap:4, marginTop:4 }}>{[settings.p1a,settings.p1b].map(v=><button key={v} onClick={()=>setFPrima(String(v))} style={chipSt}>{v}%</button>)}</div></div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>% Dopo</label><input type="number" value={fDopo} onChange={e=>setFDopo(e.target.value)} style={inputSt(theme)}/><div style={{ display:'flex', gap:4, marginTop:4 }}>{[settings.p2a,settings.p2b].map(v=><button key={v} onClick={()=>setFDopo(String(v))} style={chipSt}>{v}%</button>)}</div></div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>Prezzo €/kWh</label><input type="number" value={fPrezzo} onChange={e=>setFPrezzo(e.target.value)} step="0.001" style={inputSt(theme)}/><div style={{ display:'flex', gap:4, marginTop:4 }}><button onClick={()=>{setFPrezzo('0.2');setFLuogo('CASA');}} style={chipSt}>€0.20</button><button onClick={()=>setFPrezzo('0.5')} style={chipSt}>€0.50</button></div></div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}><label style={{ fontSize:'0.62rem', color:theme.text2 }}>kWh effettivi</label><input type="number" value={fKwh} onChange={e=>setFKwh(e.target.value)} placeholder="Display" step="0.01" style={inputSt(theme)}/></div>
      </div>
      
      <div style={{ margin:'14px 0', padding:10, background:'rgba(255,255,255,0.02)', borderRadius:10, fontSize:'0.8rem', display:'flex', justifyContent:'space-between' }}>
        <div>Spesa: <strong style={{color:S.green}}>€{costo.toFixed(2)}</strong></div>
        <div>Consumo: <strong>{kwh100?kwh100.toFixed(1):'—'} kWh/100</strong></div>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        {onCancel&&<button onClick={onCancel} style={{ flex:1, padding:12, background:'transparent', border:`1px solid ${theme.border}`, borderRadius:10, color:theme.text2, cursor:'pointer' }}>Annulla</button>}
        <button onClick={salva} style={{ flex:2, padding:12, background:`linear-gradient(135deg,${theme.accent},${theme.accent2})`, border:'none', borderRadius:10, color:'#fff', fontWeight:800, cursor:'pointer' }}>Conferma</button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [view, setView] = useState('home');
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('mgs5_theme') || 'auto');
  const [ricariche, setRicariche] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(() => { try { const s = localStorage.getItem('mgs5_settings'); return s ? {...DEFAULT_SETTINGS,...JSON.parse(s)} : {...DEFAULT_SETTINGS}; } catch { return {...DEFAULT_SETTINGS}; } });
  const [editIdx, setEditIdx] = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [mesiAperti, setMesiAperti] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, color = '#10b981') => { setToast({ msg, color }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadRicariche(); }, [session]);
  useEffect(() => { try { localStorage.setItem('mgs5_settings', JSON.stringify(settings)); } catch {} }, [settings]);

  async function loadRicariche() {
    setLoading(true);
    const { data, error } = await supabase.from('ricariche').select('*').order('km', { ascending: true, nullsFirst: false });
    setLoading(false);
    if (error) { showToast('❌ Errore caricamento', '#ef4444'); return; }
    setRicariche(ricalcolaKmParziali((data||[]).map(sanitizzaRicarica)));
  }

  async function esportaSheets() {
    const url = localStorage.getItem('mgs5_sheetsUrl') || SHEETS_URL;
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ricariche) });
  }

  async function salvaRicarica(record) {
    const dbRecord = toDbRecord(record, session.user.id);
    const { error } = record.id ? await supabase.from('ricariche').update(dbRecord).eq('id', record.id) : await supabase.from('ricariche').insert(dbRecord);
    if (error) { showToast('❌ Errore', '#ef4444'); return; }
    showToast('✅ Salvato!');
    const adminEmail = localStorage.getItem('mgs5_adminEmail') || '';
    if (adminEmail && session.user.email === adminEmail) { await esportaSheets(); }
    setEditIdx(null); setView('home'); await loadRicariche();
  }

  async function cancellaRicarica(idx) {
    if (idx === 'all') {
      await supabase.from('ricariche').delete().eq('user_id', session.user.id);
      showToast('🗑 Dati resettati');
    } else {
      const r = ricariche[idx];
      if (r.id) await supabase.from('ricariche').delete().eq('id', r.id);
      showToast('🗑 Ricarica rimossa');
    }
    setConfirmIdx(null); await loadRicariche();
  }

  if (session === undefined) return null;
  if (!session) return <AuthScreen />;

  const isDark = themeMode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : themeMode === 'dark';
  const theme = isDark ? THEMES.dark : THEMES.light;

  const totali = ricariche.reduce((acc, r) => {
    acc.costo += Number(r.costo) || 0;
    acc.kwh += Number(r.kwhEff) || 0;
    acc.km += Number(r.kmParziali) || 0;
    return acc;
  }, { costo: 0, kwh: 0, km: 0 });

  const mediaKwh100 = totali.km > 0 ? (totali.kwh / totali.km) * 100 : 0;

  const raggruppatoPerMese = {};
  ricariche.forEach(r => {
    if (!r.data) return;
    const mKey = r.data.slice(0, 7);
    if (!raggruppatoPerMese[mKey]) raggruppatoPerMese[mKey] = { ricariche: [], kwhTotali: 0, costoTotale: 0, kmTotali: 0 };
    raggruppatoPerMese[mKey].ricariche.push(r);
    raggruppatoPerMese[mKey].kwhTotali += Number(r.kwhEff) || 0;
    raggruppatoPerMese[mKey].costoTotale += Number(r.costo) || 0;
    raggruppatoPerMese[mKey].kmTotali += Number(r.kmParziali) || 0;
  });

  const graficiMesi = Object.keys(raggruppatoPerMese).sort().slice(-6).map(m => ({ x: MESI_BREVI[parseInt(m.split('-')[1]) - 1], y: raggruppatoPerMese[m].costoTotale }));
  const graficiConsumi = ricariche.filter(r => r.kwh100 > 0).slice(-10).map((r, i) => ({ x: i + 1, y: r.kwh100 }));

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', background:theme.bg, color:theme.text, minHeight:'100vh', maxWidth:480, margin:'0 auto', paddingBottom:80, position:'relative', boxSizing:'border-box' }}>
      {toast && <div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', zIndex:500, padding:'12px 24px', background:toast.color, color:'#fff', borderRadius:30, fontWeight:700 }}>{toast.msg}</div>}
      {confirmIdx !== null && <ConfirmDialog messaggio={confirmIdx === 'all' ? 'Vuoi cancellare tutto?' : 'Cancellare la ricarica?'} onConfirm={()=>cancellaRicarica(confirmIdx)} onCancel={()=>setConfirmIdx(null)} />}
      
      <header style={{ position:'sticky', top:0, zIndex:100, background:theme.headerBg, backdropFilter:'blur(12px)', borderBottom:`1px solid ${theme.border}`, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:'1.3rem', fontWeight:900 }}>MG<span style={{color:'#ef4444'}}>S5</span></div>
          <div style={{ fontSize:'0.65rem', color:theme.text2 }}>{settings.targa} • {ricariche.length} ricariche</div>
        </div>
        <button onClick={()=>{ const n=themeMode==='dark'?'light':themeMode==='light'?'auto':'dark'; setThemeMode(n); localStorage.setItem('mgs5_theme',n); }} style={{ padding:8, background:'rgba(255,255,255,0.05)', border:`1px solid ${theme.border}`, borderRadius:10, color:theme.text, cursor:'pointer' }}>{themeMode==='auto'?'🌓 Auto':themeMode==='dark'?'🌙 Dark':'☀️ Light'}</button>
      </header>

      <main style={{ padding:'20px 16px' }}>
        {view === 'home' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <div style={{ background:theme.bg2, border:`1px solid ${theme.border}`, borderRadius:16, padding:14 }}>
                <div style={{ fontSize:'0.62rem', color:theme.text2, textTransform:'uppercase' }}>Spesa Totale</div>
                <div style={{ fontSize:'1.4rem', fontWeight:800, color:theme.green, fontFamily:'monospace' }}>€ {totali.costo.toFixed(2)}</div>
              </div>
              <div style={{ background:theme.bg2, border:`1px solid ${theme.border}`, borderRadius:16, padding:14 }}>
                <div style={{ fontSize:'0.62rem', color:theme.text2, textTransform:'uppercase' }}>Media Consumo</div>
                <div style={{ fontSize:'1.4rem', fontWeight:800, color:theme.text, fontFamily:'monospace' }}>{mediaKwh100?mediaKwh100.toFixed(2):'—'}</div>
                <div style={{ fontSize:'0.55rem', color:theme.text2 }}>kWh / 100km</div>
              </div>
            </div>

            {editIdx !== null ? (
              <FormRicarica settings={settings} ricariche={ricariche} editIdx={editIdx} onSave={salvaRicarica} onCancel={()=>setEditIdx(null)} showToast={showToast} theme={theme}/>
            ) : (
              <button onClick={()=>setView('nuovo')} style={{ width:'100%', padding:16, background:`linear-gradient(135deg,${theme.accent},${theme.accent2})`, border:'none', borderRadius:16, color:'#fff', fontWeight:800, cursor:'pointer', marginBottom:16 }}>⚡ Nuova Ricarica</button>
            )}

            {loading && <div style={{ textAlign:'center', color:theme.text2 }}>Caricamento...</div>}

            {Object.keys(raggruppatoPerMese).sort((a,b)=>b.localeCompare(a)).map(mKey => {
              const mData = raggruppatoPerMese[mKey];
              const nomeMese = MESI_NOMI[parseInt(mKey.split('-')[1])-1] + ' ' + mKey.split('-')[0];
              const aperto = mesiAperti[mKey] ?? false;
              return (
                <div key={mKey} style={{ background:theme.bg2, border:`1px solid ${theme.border}`, borderRadius:16, marginBottom:10, overflow:'hidden' }}>
                  <div onClick={()=>setMesiAperti(p=>({...p,[mKey]:!aperto}))} style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', cursor:'pointer', alignItems:'center' }}>
                    <div><strong>{nomeMese}</strong><div style={{ fontSize:'0.65rem', color:theme.text2 }}>{mData.ricariche.length} ricariche • {mData.kmTotali} KM</div></div>
                    <div style={{ color:theme.green, fontFamily:'monospace', fontWeight:800 }}>€ {mData.costoTotale.toFixed(2)}</div>
                  </div>
                  {aperto && (
                    <div style={{ padding:8, background:'rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', gap:6 }}>
                      {mData.ricariche.map(r => {
                        const idx = ricariche.findIndex(x => x.id === r.id);
                        return (
                          <div key={r.id} style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div>
                              <div>{r.data.slice(8,10)}/{r.data.slice(5,7)} {r.luogo && `• ${r.luogo}`}</div>
                              <div style={{ fontSize:'0.65rem', color:theme.text2 }}>{r.pctPrima}% → {r.pctDopo}% | {r.kwhEff.toFixed(1)} kWh</div>
                            </div>
                            <div style={{ display:'flex', gap:10 }}>
                              <button onClick={()=>setEditIdx(idx)} style={{ background:'transparent', border:'none', cursor:'pointer' }}>✏️</button>
                              <button onClick={()=>setConfirmIdx(idx)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'#ef4444' }}>🗑</button>
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

        {view === 'nuovo' && <FormRicarica settings={settings} ricariche={ricariche} editIdx={null} onSave={salvaRicarica} onCancel={()=>setView('home')} showToast={showToast} theme={theme}/>}
        
        {view === 'grafici' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:theme.bg2, border:`1px solid ${theme.border}`, borderRadius:16, padding:16 }}>
              <div style={{ fontSize:'0.65rem', color:theme.text2, marginBottom:12, textTransform:'uppercase' }}>Spesa Mensile (€)</div>
              <BarChart data={graficiMesi} color={theme.green} />
            </div>
            <div style={{ background:theme.bg2, border:`1px solid ${theme.border}`, borderRadius:16, padding:16 }}>
              <div style={{ fontSize:'0.65rem', color:theme.text2, marginBottom:12, textTransform:'uppercase' }}>Andamento Consumi (kWh/100km)</div>
              <LineChart data={graficiConsumi} color={theme.accent} />
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:theme.bg2, padding:16, borderRadius:16, border:`1px solid ${theme.border}` }}>
              <label style={{ fontSize:'0.7rem', color:theme.text2 }}>TARGA / NOME VEICOLO</label>
              <input type="text" value={settings.targa} onChange={e=>setSettings({...settings, targa:e.target.value})} style={inputSt(theme)}/>
            </div>
            <div style={{ background:theme.bg2, padding:16, borderRadius:16, border:`1px solid ${theme.border}` }}>
              <label style={{ fontSize:'0.7rem', color:theme.text2 }}>CAPACITÀ BATTERIA (kWh)</label>
              <input type="number" value={settings.batteria} onChange={e=>setSettings({...settings, batteria:parseFloat(e.target.value)||64})} style={inputSt(theme)}/>
            </div>
            <button onClick={()=>supabase.auth.signOut()} style={{ width:'100%', padding:12, background:'transparent', border:`1px solid ${theme.border}`, color:'#ef4444', borderRadius:10, cursor:'pointer' }}>🚪 Esci dall'account</button>
          </div>
        )}
      </main>

      <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:theme.navBg, borderTop:`1px solid ${theme.border}`, display:'flex', padding:'8px 0', zIndex:200 }}>
        {[{id:'home',l:'Home',i:'🏠'},{id:'grafici',l:'Grafici',i:'📊'},{id:'settings',l:'Impostazioni',i:'⚙️'}].map(t => (
          <button key={t.id} onClick={()=>{setView(t.id);setEditIdx(null);}} style={{ flex:1, background:'transparent', border:'none', color: view===t.id ? theme.accent : theme.text2, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center' }}>
            <span>{t.i}</span><span style={{ fontSize:'0.65rem' }}>{t.l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}