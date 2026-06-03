import { useState, useEffect } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ SICUREZZA: Rimossi i valori in chiaro. Ora l'applicazione legge solo dalle variabili d'ambiente protette
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const MESI_NOMI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// ✅ PULIZIA: Aggiornato il prefisso del LocalStorage coerentemente con il nuovo progetto EVFUEL
function getSheetsUrl() { return localStorage.getItem('evfuel_sheetsUrl') || SHEETS_URL; }
const DEFAULT_SETTINGS = { batteria: 64, prezzo: 0.50, targa: 'EVFUEL', p1a: 20, p1b: 30, p2a: 80, p2b: 100 };

const S = {
  bg:'#0a0f1e', bg2:'rgba(255,255,255,0.04)',
  border:'rgba(0,229,255,0.15)', accent:'#00e5ff',
  accent2:'#7c3aed', green:'#10b981', text:'#e2e8f0', text2:'#94a3b8'
};

const inputSt = (S) => ({
  background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border}`, borderRadius:10,
  color:S.text, fontFamily:'monospace', fontSize:'1rem', padding:'10px 12px',
  width:'100%', outline:'none', boxSizing:'border-box',
  MozAppearance:'textfield', appearance:'textfield'
});

const chipSt = {
  padding:'4px 10px', background:'rgba(0,229,255,0.08)',
  border:'1px solid rgba(0,229,255,0.2)', borderRadius:20,
  color:S.accent, fontFamily:'monospace', fontSize:'0.75rem', cursor:'pointer'
};

const noSpinnerStyle = document.createElement('style');
noSpinnerStyle.textContent = 'input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}';
document.head.appendChild(noSpinnerStyle);

function today() { return new Date().toISOString().split('T')[0]; }
function toNum(x, def = 0) { const n = Number(x); return Number.isFinite(n) ? n : def; }

function normalizzaData(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0,10);
  const dt = new Date(d);
  if (!isNaN(dt)) return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  return String(d).slice(0,10);
}

function sanitizzaRicarica(r) {
  const pctPrima = toNum(r?.pct_prima ?? r?.pctPrima, 0);
  const pctDopo  = toNum(r?.pct_dopo  ?? r?.pctDopo,  0);
  const kwhEff   = toNum(r?.kwh_eff   ?? r?.kwhEff,   0);
  const prezzoKwh= toNum(r?.prezzo_kwh?? r?.prezzoKwh,0);
  const costo    = toNum(r?.costo, 0);
  const luogo = ((r?.luogo||'').toString().trim().toUpperCase()) || '';
  return {
    id: r?.id || null,
    luogo,
    data: normalizzaData(r?.data),
    kwhEff,
    kwhTeor: toNum(r?.kwh_teor ?? r?.kwhTeor, 0),
    costo, prezzoKwh, pctPrima, pctDopo,
    kwh100: r?.kwh_100 != null ? toNum(r.kwh_100, null) : (r?.kwh100 != null ? toNum(r.kwh100, null) : null),
    km: r?.km != null ? toNum(r.km, null) : null,
    kmParziali: r?.km_parziali != null ? toNum(r.km_parziali, null) : (r?.kmParziali != null ? toNum(r.kmParziali, null) : null),
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
    user_id: userId,
    data: r.data, luogo: r.luogo || null,
    km: r.km, km_parziali: r.kmParziali,
    pct_prima: r.pctPrima, pct_dopo: r.pctDopo,
    kwh_eff: r.kwhEff, kwh_teor: r.kwhTeor,
    prezzo_kwh: r.prezzoKwh,
    costo: (r.costo && r.costo > 0) ? r.costo : r.kwhEff * r.prezzoKwh,
    kwh_100: r.kwh100,
  };
}

function ConfigSheet({ showToast, inputSt: cInputSt }) {
  const inputSt = cInputSt || {
    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(0,229,255,0.15)', borderRadius:10,
    color:'#e2e8f0', fontFamily:'monospace', fontSize:'1rem', padding:'10px 12px',
    width:'100%', outline:'none', boxSizing:'border-box'
  };
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState(getSheetsUrl());
  
  useEffect(()=>{ 
    setEmail(localStorage.getItem('evfuel_adminEmail')||''); 
    setUrl(localStorage.getItem('evfuel_sheetsUrl')||getSheetsUrl()); 
  },[]);

  function salva() {
    localStorage.setItem('evfuel_adminEmail', email.trim());
    localStorage.setItem('evfuel_sheetsUrl', url.trim());
    setEditing(false);
    showToast('✅ Impostazioni salvate!');
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div>
        <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2, display:'block', marginBottom:6 }}>Email admin</label>
        {editing ? <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tua@email.com" style={inputSt}/> : <div style={{ fontFamily:'monospace', fontSize:'0.85rem', color:S.text, padding:'10px 12px', background:'rgba(255,255,255,0.04)', border:`1px solid ${S.border}`, borderRadius:10 }}>{email||'—'}</div>}
      </div>
      <div>
        <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2, display:'block', marginBottom:6 }}>URL Google Apps Script</label>
        {editing ? <input type="text" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..." style={{...inputSt, fontSize:'0.7rem'}}/> : <div style={{ fontFamily:'monospace', fontSize:'0.65rem', color:S.text2, padding:'10px 12px', background:'rgba(255,255,255,0.04)', border:`1px solid ${S.border}`, borderRadius:10, wordBreak:'break-all' }}>{url}</div>}
      </div>
      {editing ? (
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setEditing(false)} style={{ flex:1, padding:'10px 0', background:'transparent', border:`1px solid ${S.border}`, borderRadius:10, color:S.text2, fontSize:'0.8rem', cursor:'pointer' }}>Annulla</button>
          <button onClick={salva} style={{ flex:2, padding:'10px 0', background:`linear-gradient(135deg,${S.accent},${S.accent2})`, border:'none', borderRadius:10, color:'#fff', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>✅ Salva</button>
        </div>
      ) : (
        <button onClick={()=>setEditing(true)} style={{ padding:'10px 0', background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:10, color:S.text2, fontSize:'0.8rem', cursor:'pointer' }}>✏️ Modifica impostazioni</button>
      )}
      <div style={{ fontSize:'0.65rem', color:S.accent, lineHeight:1.6 }}>⚡ Il backup si attiva automaticamente solo per l'email admin</div>
    </div>
  );
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
  if (!data.length) return <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:'0.75rem' }}>Nessun dato</div>;
  const max = Math.max(...data.map(d => d.y));
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:160, padding:'8px 0' }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end' }}>
          <div style={{ width:'100%', background:color+'99', borderRadius:4, height:max?`${(d.y/max)*120}px`:0, minHeight:d.y?4:0, transition:'height 0.4s' }}/>
          <div style={{ fontSize:'0.5rem', color:'#94a3b8', textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', maxWidth:'100%' }}>{d.x}</div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, color = '#7c3aed' }) {
  if (data.length < 2) return <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:'0.75rem' }}>Servono almeno 2 punti</div>;
  const w=300, h=120;
  const ys=data.map(d=>d.y), minY=Math.min(...ys), maxY=Math.max(...ys);
  const px=i=>(i/(data.length-1))*w;
  const py=y=>h-((y-minY)/(maxY-minY||1))*(h-10)-5;
  const pts=data.map((d,i)=>`${px(i)},${py(d.y)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height:160 }}>
      <defs>
        <linearGradient id={`g${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#g${color.replace('#','')})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      {data.map((d,i)=><circle key={i} cx={px(i)} cy={py(d.y)} r="3" fill={color}/>)}
    </svg>
  );
}

function ConfirmDialog({ messaggio, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(239,68,68,0.4)', borderRadius:20, padding:28, maxWidth:320, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:'2rem', marginBottom:12 }}>🗑</div>
        <div style={{ fontSize:'1rem', fontWeight:700, marginBottom:8 }}>{messaggio}</div>
        <div style={{ fontSize:'0.8rem', color:S.text2, marginBottom:24 }}>Questa azione non può essere annullata.</div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel} style={{ flex:1, padding:'12px 0', background:'transparent', border:`1px solid ${S.border}`, borderRadius:12, color:S.text2, fontSize:'0.9rem', cursor:'pointer' }}>Annulla</button>
          <button onClick={onConfirm} style={{ flex:1, padding:'12px 0', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.5)', borderRadius:12, color:'#ef4444', fontSize:'0.9rem', fontWeight:700, cursor:'pointer' }}>Conferma</button>
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
        setMsg({ text:'✅ Registrato! Controlla la tua email per confermare.', color:'#10b981' });
        setMode('login'); setLoading(false); return;
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setMsg({ text:'✅ Email inviata! Controlla la casella.', color:'#10b981' });
        setLoading(false); return;
      }
    } catch(e) {
      setMsg({ text: '❌ ' + (e.message || 'Errore'), color:'#ef4444' });
    }
    setLoading(false);
  }

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', background:S.bg, color:S.text, minHeight:'100vh', maxWidth:480, margin:'0 auto', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:360 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:'2.5rem', fontWeight:900, letterSpacing:'0.05em', marginBottom:8 }}>
            EV<span style={{color:S.accent}}>FUEL</span>
          </div>
          <div style={{ fontSize:'0.8rem', color:S.text2, textTransform:'uppercase', letterSpacing:'0.12em' }}>
            Gestione Ricariche EV
          </div>
        </div>
        <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:20, padding:24 }}>
          <div style={{ display:'flex', gap:8, marginBottom:24 }}>
            ={['login','register'].map(m => (
              <button key={m} onClick={()=>{setMode(m);setMsg(null);}} style={{ flex:1, padding:'10px 0', background: mode===m ? `linear-gradient(135deg,${S.accent},${S.accent2})` : 'transparent', border: mode===m ? 'none' : `1px solid ${S.border}`, borderRadius:10, color: mode===m ? '#fff' : S.text2, fontSize:'0.8rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', cursor:'pointer' }}>
                {m === 'login' ? 'Accedi' : 'Registrati'}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2, display:'block', marginBottom:6 }}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tua@email.com" style={inputSt(S)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()}/>
            </div>
            {mode !== 'reset' && (
              <div>
                <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2, display:'block', marginBottom:6 }}>Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={inputSt(S)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()}/>
              </div>
            )}
          </div>
          {msg && <div style={{ marginTop:14, padding:'10px 14px', background: msg.color+'22', border:`1px solid ${msg.color}44`, borderRadius:10, color:msg.color, fontSize:'0.8rem' }}>{msg.text}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ width:'100%', marginTop:20, padding:'14px 0', background:`linear-gradient(135deg,${S.accent},${S.accent2})`, border:'none', borderRadius:12, color:'#fff', fontSize:'0.9rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em', cursor:'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? '...' : mode === 'login' ? '⚡ Accedi' : mode === 'register' ? '🚀 Registrati' : '📧 Invia email'}
          </button>
          {mode === 'login' && (
            <button onClick={()=>{setMode('reset');setMsg(null);}} style={{ width:'100%', marginTop:10, padding:'10px 0', background:'transparent', border:'none', color:S.text2, fontSize:'0.75rem', cursor:'pointer' }}>
              Password dimenticata?
            </button>
          )}
          {mode === 'reset' && (
            <button onClick={()=>{setMode('login');setMsg(null);}} style={{ width:'100%', marginTop:10, padding:'10px 0', background:'transparent', border:'none', color:S.text2, fontSize:'0.75rem', cursor:'pointer' }}>
              ← Torna al login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FormRicarica({ settings, ricariche, editIdx, onSave, onCancel, showToast, inputSt: fInputSt }) {
  const inputSt = fInputSt || { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(0,229,255,0.15)', borderRadius:10, color:'#e2e8f0', fontFamily:'monospace', fontSize:'1rem', padding:'10px 12px', width:'100%', outline:'none', boxSizing:'border-box', MozAppearance:'textfield', appearance:'textfield' };
  const ex = editIdx !== null ? ricariche[editIdx] : null;
  const [fData,   setFData]   = useState(ex ? ex.data : today());
  const [fLuogo,  setFLuogo]  = useState(ex ? (ex.luogo||'') : '');
  const [fKm,     setFKm]     = useState(ex && ex.km !== null ? String(ex.km) : '');
  const [fKmParz, setFKmParz] = useState(ex && ex.kmParziali !== null ? String(ex.kmParziali) : '');
  const [fPrima,  setFPrima]  = useState(ex ? String(ex.pctPrima > 1 ? ex.pctPrima : ex.pctPrima * 100) : '');
  const [fDopo,   setFDopo]   = useState(ex ? String(ex.pctDopo > 1 ? ex.pctDopo : ex.pctDopo * 100) : '');
  const [fKwh,     setFKwh]    = useState(ex ? String(ex.kwhEff) : '');
  const [fPrezzo, setFPrezzo] = useState(ex ? String(ex.prezzoKwh) : String(settings.prezzo));
  
  useEffect(()=>{
    const v = parseFloat(fPrezzo);
    if (Math.abs(v - 0.2) < 0.001 && fLuogo !== 'CASA') setFLuogo('CASA');
  }, [fPrezzo]);

  const prima=parseFloat(fPrima)||0, dopo=parseFloat(fDopo)||0;
  const diff=dopo-prima, kwhTeor=settings.batteria*(diff/100);
  const kwhEff=parseFloat(fKwh)||kwhTeor;
  const prezzo=parseFloat(fPrezzo)||settings.prezzo;
  const costo=kwhEff*prezzo;
  const kmParzN=parseFloat(fKmParz);
  const kmN=parseFloat(fKm);

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
      id: ex?.id || null,
      data:fData, luogo:fLuogo||null, km:parseFloat(fKm)||null,
      pctPrima:prima, pctDopo:dopo, kwhEff, kwhTeor, prezzoKwh:prezzo, costo,
      kmParziali:kmParzEff||null, kwh100:kmParzEff?(kwhEff/kmParzEff)*100:null
    });
  }

  return (
    <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.12em', color:S.text2, marginBottom:12 }}>
        {editIdx!==null?'✏️ Modifica Ricarica':'Nuova Ricarica'}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>Data</label>
          <input type="date" value={fData} onChange={e=>setFData(e.target.value)} style={inputSt}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>Dove si ricarica</label>
          <input type="text" value={fLuogo} onChange={e=>setFLuogo(e.target.value.toUpperCase())} placeholder="CASA..." style={inputSt}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>KM Totali</label>
          <input type="number" value={fKm} onChange={e=>setFKm(e.target.value)} placeholder="0" style={inputSt}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>KM Parziali</label>
          <input type="number" value={fKmParz} onChange={e=>setFKmParz(e.target.value)} placeholder={kmParzAuto?String(kmParzAuto):''} style={inputSt}/>
          {kmParzAuto&&!(kmParzN>0)&&<div style={{ fontSize:'0.6rem', color:S.accent, marginTop:2 }}>⚡ calcolato automaticamente</div>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>% Prima</label>
          <input type="number" value={fPrima} onChange={e=>setFPrima(e.target.value)} placeholder="0" style={inputSt}/>
          <div style={{ display:'flex', gap:6 }}>
            ={[settings.p1a,settings.p1b].map(v=><button key={v} onClick={()=>setFPrima(String(v))} style={chipSt}>{v}%</button>)}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>% Dopo</label>
          <input type="number" value={fDopo} onChange={e=>setFDopo(e.target.value)} placeholder="100" style={inputSt}/>
          <div style={{ display:'flex', gap:6 }}>
            ={[settings.p2a,settings.p2b].map(v=><button key={v} onClick={()=>setFDopo(String(v))} style={chipSt}>{v}%</button>)}
          </div>
        </div>
        <div style={{ gridColumn:'1/-1', background:'rgba(0,229,255,0.04)', border:`1px solid ${S.border}`, borderRadius:10, padding:10, display:'flex', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'0.65rem', color:S.text2, textTransform:'uppercase' }}>Differenza %</div>
            <div style={{ fontFamily:'monospace', fontSize:'1rem', color:S.accent }}>{diff>0?diff.toFixed(0)+' %':'—'}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'0.65rem', color:S.text2, textTransform:'uppercase' }}>kWh teorici</div>
            <div style={{ fontFamily:'monospace', fontSize:'1rem', color:S.accent }}>{kwhTeor>0?kwhTeor.toFixed(2)+' kWh':'—'}</div>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>Prezzo €/kWh</label>
          <input type="number" value={fPrezzo} onChange={e=>setFPrezzo(e.target.value)} step="0.001" style={inputSt}/>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={()=>{setFPrezzo('0.2');setFLuogo('CASA');}} style={chipSt}>€0.20</button>
            <button onClick={()=>setFPrezzo('0.5')} style={chipSt}>€0.50</button>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>Costo €</label>
          <div style={{ fontFamily:'monospace', fontSize:'1.2rem', color:S.green, padding:'10px 12px', background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border}`, borderRadius:10 }}>
            {costo>0?'€ '+costo.toFixed(2):'—'}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>kWh effettivi</label>
          <input type="number" value={fKwh} onChange={e=>setFKwh(e.target.value)} placeholder="dal display" step="0.01" style={inputSt}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.62rem', textTransform:'uppercase', color:S.text2 }}>kWh / 100km</label>
          <div style={{ fontFamily:'monospace', fontSize:'1.2rem', color:S.accent2, padding:'10px 12px', background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border}`, borderRadius:10 }}>
            {kwh100?kwh100.toFixed(2):'—'}
          </div>
        </div>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        {onCancel&&<button onClick={onCancel} style={{ flex:1, padding:16, background:'transparent', border:`1px solid ${S.border}`, borderRadius:12, color:S.text2, fontSize:'0.85rem', cursor:'pointer' }}>Annulla</button>}
        <button onClick={salva} style={{ flex:2, padding:16, background:`linear-gradient(135deg,${S.accent},${S.accent2})`, border:'none', borderRadius:12, color:'#fff', fontSize:'0.9rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>
          {editIdx!==null?'✏️ Aggiorna':'⚡ Salva Ricarica'}
        </button>
      </div>
    </div>
  );
}

const THEMES = {
  dark:  { bg:'#0a0f1e', bg2:'rgba(255,255,255,0.04)', border:'rgba(0,229,255,0.15)', accent:'#00e5ff', accent2:'#7c3aed', green:'#10b981', text:'#e2e8f0', text2:'#94a3b8', headerBg:'rgba(10,15,30,0.95)', navBg:'rgba(10,15,30,0.95)' },
  light: { bg:'#f0f4f8', bg2:'rgba(0,0,0,0.04)', border:'rgba(0,140,200,0.25)', accent:'#0070a8', accent2:'#5b21b6', green:'#047857', text:'#1e293b', text2:'#64748b', headerBg:'rgba(240,244,248,0.95)', navBg:'rgba(240,244,248,0.95)' },
};
function getSystemTheme() { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }

function SettingsVeicoloFields({ settings, setSettings, inputSt, S }) {
  return <>
    {[{label:'Capacità batteria (kWh)',key:'batteria',type:'number',step:1},{label:'Prezzo default €/kWh',key:'prezzo',type:'number',step:0.001},{label:'Targa / Nome veicolo',key:'targa',type:'text'}].map(f=>(
      <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
        <div style={{ fontSize:'0.85rem' }}>{f.label}</div>
        <input type={f.type} step={f.step} value={settings[f.key]} onChange={e=>setSettings({...settings,[f.key]:f.type==='number'?parseFloat(e.target.value)||0:e.target.value})} style={{...inputSt,width:100,textAlign:'right'}}/>
      </div>
    ))}
  </>;
}

function SettingsPresetFields({ settings, setSettings, inputSt, S }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
    {[{label:'% Prima — op.1',key:'p1a'},{label:'% Prima — op.2',key:'p1b'},{label:'% Dopo — op.1',key:'p2a'},{label:'% Dopo — op.2',key:'p2b'}].map(f=>(
      <div key={f.key}>
        <div style={{ fontSize:'0.65rem', color:S.text2, textTransform:'uppercase', marginBottom:6 }}>{f.label}</div>
        <input type="number" value={settings[f.key]} onChange={e=>setSettings({...settings,[f.key]:parseFloat(e.target.value)||0})} style={{...inputSt,textAlign:'right'}}/>
      </div>
    ))}
  </div>;
}

function SettingsView({ settings, setSettings, session, S, openSec, setOpenSec, showToast, esportaSheets, setConfirmIdx, inputSt }) {
  const toggle = k => setOpenSec(p=>({...p,[k]:!p[k]}));
  const SecHeader = ({k,label})=>(
    <div onClick={()=>toggle(k)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', userSelect:'none', marginBottom: openSec[k]?12:0 }}>
      <div style={{ fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.12em', color:S.text2 }}>{label}</div>
      <span style={{ color:S.text2, fontSize:'0.8rem' }}>{openSec[k]?'▲':'▼'}</span>
    </div>
  );
  const Card=({children,style={}})=><div style={{background:S.bg2,border:`1px solid ${S.border}`,borderRadius:16,padding:16,marginBottom:12,...style}}>{children}</div>;
  return <>
    <Card>
      <SecHeader k="veicolo" label="Impostazioni veicolo"/>
      {openSec.veicolo && <SettingsVeicoloFields settings={settings} setSettings={setSettings} inputSt={inputSt} S={S}/>}
    </Card>
    <Card>
      <SecHeader k="preset" label="Preset % batteria"/>
      {openSec.preset && <SettingsPresetFields settings={settings} setSettings={setSettings} inputSt={inputSt} S={S}/>}
    </Card>
    <Card>
      <SecHeader k="account" label="Account"/>
      {openSec.account && <>
        <div style={{ fontSize:'0.8rem', color:S.text2, marginBottom:16 }}>Connesso come: <span style={{ color:S.text }}>{session.user.email}</span></div>
        <button onClick={()=>supabase.auth.signOut()} style={{ width:'100%', padding:12, background:'transparent', border:`1px solid ${S.border}`, borderRadius:10, color:S.text2, fontSize:'0.85rem', cursor:'pointer' }}>🚪 Esci dall'account</button>
      </>}
    </Card>
    <Card>
      <SecHeader k="sheets" label="☁️ Backup Google Sheets"/>
      {openSec.sheets && <>
        <div style={{ fontSize:'0.75rem', color:S.text2, marginBottom:12, lineHeight:1.6 }}>Inserisci la tua email per attivare il backup automatico su Google Sheets ad ogni salvataggio.</div>
        <ConfigSheet showToast={showToast} />
        <button onClick={async()=>{ const adminEmail=localStorage.getItem('evfuel_adminEmail')||''; if(!adminEmail||session.user.email!==adminEmail){showToast('❌ Email non corrisponde','#ef4444');return;} await esportaSheets(); showToast('☁️ Backup inviato a Sheets!'); }} style={{ width:'100%', marginTop:10, padding:12, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:10, color:'#10b981', fontSize:'0.85rem', fontWeight:700, cursor:'pointer' }}>☁️ Invia backup a Google Sheets</button>
      </>}
    </Card>
    <Card style={{ borderColor:'rgba(239,68,68,0.3)' }}>
      <SecHeader k="danger" label="⚠️ Zona pericolosa"/>
      {openSec.danger && <button onClick={()=>setConfirmIdx('all')} style={{ width:'100%', padding:12, background:'transparent', border:'1px solid rgba(239,68,68,0.4)', borderRadius:10, color:'#ef4444', fontSize:'0.85rem', cursor:'pointer' }}>🗑 Cancella tutti i dati</button>}
    </Card>
  </>;
}

export default function App() {
  const [session,    setSession]    = useState(undefined);
  const [view,       setView]       = useState('home');
  const [themeMode,  setThemeMode]  = useState(()=>localStorage.getItem('evfuel_theme')||'auto');
  const [ricariche,  setRicariche]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [settings,   setSettings]   = useState(() => {
    try { const s = localStorage.getItem('evfuel_settings'); return s ? {...DEFAULT_SETTINGS,...JSON.parse(s)} : {...DEFAULT_SETTINGS}; } catch { return {...DEFAULT_SETTINGS}; }
  });
  const [editIdx,    setEditIdx]    = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [mesiAperti, setMesiAperti] = useState({});
  const [openSec,    setOpenSec]    = useState({veicolo:true,preset:false,account:false,sheets:false,danger:false});
  const { toast, show: showToast }  = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadRicariche(); }, [session]);
  useEffect(() => { try { localStorage.setItem('evfuel_settings', JSON.stringify(settings)); } catch {} }, [settings]);

  async function loadRicariche() {
    setLoading(true);
    const { data, error } = await supabase.from('ricariche').select('*').order('km', { ascending: true, nullsFirst: false });
    setLoading(false);
    if (error) { showToast('❌ Errore caricamento', '#ef4444'); return; }
    setRicariche(ricalcolaKmParziali((data||[]).map(sanitizzaRicarica)));
  }

  async function sincronizzaRicariche(lista) {
    await supabase.from('ricariche').delete().eq('user_id', session.user.id);
    for (const r of lista) {
      await supabase.from('ricariche').insert(toDbRecord(r, session.user.id));
    }
  }

  async function salvaRicarica(record) {
    const dbRecord = {
      user_id: session.user.id,
      data: record.data, luogo: record.luogo || null,
      km: record.km, km_parziali: record.kmParziali,
      pct_prima: record.pctPrima, pct_dopo: record.pctDopo,
      kwh_eff: record.kwhEff, kwh_teor: record.kwhTeor,
      prezzo_kwh: record.prezzoKwh, costo: record.costo, kwh_100: record.kwh100,
    };
    if (record.id) {
      const { error } = await supabase.from('ricariche').update(dbRecord).eq('id', record.id);
      if (error) { showToast('❌ Errore', '#ef4444'); return; }
      showToast('✅ Aggiornata!');
    } else {
      const { error } = await supabase.from('ricariche').insert(dbRecord);
      if (error) { showToast('❌ Errore', '#ef4444'); return; }
      showToast('✅ Salvata!');
    }
    await loadRicariche();
  }

  // ✅ ANTIFLICKERING: Se lo stato di session non è ancora determinato (undefined), l'interfaccia mostra una schermata neutra di caricamento senza esporre nulla
  if (session === undefined) {
    return (
      <div style={{ background: S.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.text, fontFamily: 'monospace' }}>
        Caricamento sessione sicura...
      </div>
    );
  }

  // Se l'utente non è autenticato, mostra direttamente la schermata di login/registrazione
  if (!session) {
    return <AuthScreen />;
  }

  // Ritorno temporaneo per evitare errori di sintassi a causa del troncamento della funzione originale
  return (
    <div style={{ color: S.text, background: S.bg, minHeight: '100vh', padding: 20 }}>
      {/* Il resto del rendering della tua dashboard prosegue qui regolarmente */}
      Dashboard attiva per {session.user.email}
    </div>
  );
}