// widget.js — Ponte verso il widget Android "EVFuel".
// Funziona solo dentro l'APK (Capacitor Android): altrove non fa nulla.

function leggiCapacitor() {
  return (typeof window !== 'undefined') ? window.Capacitor : null;
}

export function widgetDisponibile() {
  try {
    const C = leggiCapacitor();
    return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform()
      && typeof C.getPlatform === 'function' && C.getPlatform() === 'android'
      && (typeof C.nativePromise === 'function' || typeof C.registerPlugin === 'function'));
  } catch (e) { return false; }
}

let _plugin = null;
export async function inviaAlWidget(dati) {
  if (!widgetDisponibile()) return { ok: false, saltato: true };
  try {
    const C = leggiCapacitor();
    const opzioni = { json: JSON.stringify(dati) };
    if (typeof C.nativePromise === 'function') {
      await C.nativePromise('EvfuelWidget', 'aggiorna', opzioni);
    } else {
      if (!_plugin) _plugin = C.registerPlugin('EvfuelWidget');
      await _plugin.aggiorna(opzioni);
    }
    return { ok: true };
  } catch (e) {
    // Il widget non deve mai dare problemi all'app.
    return { ok: false, errore: (e && e.message) ? e.message : String(e) };
  }
}

// Riassume le ricariche per il widget: totali del mese corrente + ultima ricarica.
export function preparaDatiWidget(ricariche) {
  const lista = [...(ricariche || [])].filter(r => r && r.data).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const oggi = new Date();
  const meseKey = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0');
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const delMese = lista.filter(r => String(r.data).slice(0, 7) === meseKey);
  const kwhDi = r => Number((r.kwhEff !== null && r.kwhEff !== undefined) ? r.kwhEff : r.kwhTeor) || 0;
  const mese = {
    label: mesi[oggi.getMonth()] + ' ' + oggi.getFullYear(),
    n: delMese.length,
    kwh: delMese.reduce((a, r) => a + kwhDi(r), 0),
    costo: delMese.reduce((a, r) => a + (Number(r.costo) || 0), 0),
  };
  const u = lista[lista.length - 1];
  const ultima = u ? {
    data: String(u.data).slice(8, 10) + '/' + String(u.data).slice(5, 7),
    luogo: u.luogo || '',
    kwh: kwhDi(u),
    costo: Number(u.costo) || 0,
    kwh100: u.kwh100 != null ? Number(u.kwh100) : null,
    prima: Math.round(Number(u.pctPrima) > 1 ? Number(u.pctPrima) : Number(u.pctPrima) * 100) || 0,
    dopo: Math.round(Number(u.pctDopo) > 1 ? Number(u.pctDopo) : Number(u.pctDopo) * 100) || 0,
  } : null;
  return { v: 1, mese, ultima };
}
