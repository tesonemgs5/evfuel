import os
import sys

# Percorso del file da modificare, relativo alla root del repo (dove sta questo script)
FILE_PATH = os.path.join("src", "App.jsx")

OLD_BLOCK = '''                <button onClick={importaSheets} style={{ padding:'16px 0', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:14, color:'#10b981', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📥 Importa Sheets</button>
                <button onClick={esportaSheets} style={{ padding:'16px 0', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.35)', borderRadius:14, color:'#f59e0b', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📤 Esporta Sheets</button>'''

NEW_BLOCK = '''                <button onClick={importaSheets} style={{ padding:'16px 0', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:14, color:'#10b981', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📥 Importa Sheets</button>
                <button onClick={esportaSheets} style={{ padding:'16px 0', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.35)', borderRadius:14, color:'#f59e0b', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📤 Esporta Sheets</button>
                <button onClick={()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.onchange=importaSupabaseBackup; inp.click(); }} style={{ padding:'16px 0', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:14, color:'#10b981', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📥 Importa Supabase</button>
                <button onClick={esportaSupabaseBackup} style={{ padding:'16px 0', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.35)', borderRadius:14, color:'#f59e0b', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer' }}>📤 Esporta Supabase</button>'''

# Funzioni esportaSupabaseBackup / importaSupabaseBackup: le aggiungiamo solo se non già presenti
# (idempotente: se lo script viene rilanciato non duplica nulla)
FUNZIONI_MARKER = "function esportaSupabaseBackup()"

FUNZIONI_BLOCK = '''  function esportaSupabaseBackup() {
    const blob = new Blob([JSON.stringify(ricariche, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup_supabase.json'; a.click();
    showToast('💾 Backup Supabase esportato!');
  }

  function importaSupabaseBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
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

  const isDark = themeMode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : themeMode === 'dark';'''

OLD_ISDARK_LINE = "  const isDark = themeMode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : themeMode === 'dark';"


def main():
    if not os.path.isfile(FILE_PATH):
        print(f"ERRORE: file non trovato: {FILE_PATH}")
        print("Assicurati di eseguire questo script dalla root del repo (dove c'e' la cartella 'src').")
        sys.exit(1)

    with open(FILE_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    changed = False

    # 1. Aggiungi le funzioni di backup Supabase, se non gia' presenti
    if FUNZIONI_MARKER not in content:
        if OLD_ISDARK_LINE not in content:
            print("ERRORE: punto di inserimento funzioni non trovato (riga isDark). File forse gia' modificato in modo diverso.")
            sys.exit(1)
        content = content.replace(OLD_ISDARK_LINE, FUNZIONI_BLOCK, 1)
        print("OK: funzioni esportaSupabaseBackup/importaSupabaseBackup aggiunte.")
        changed = True
    else:
        print("INFO: le funzioni di backup Supabase erano gia' presenti, nessuna modifica a quella parte.")

    # 2. Aggiungi i pulsanti nella griglia Archivio Dati, se non gia' presenti li'
    if NEW_BLOCK in content:
        print("INFO: i pulsanti Importa/Esporta Supabase erano gia' presenti nella griglia Archivio Dati, nessuna modifica a quella parte.")
    elif OLD_BLOCK in content:
        content = content.replace(OLD_BLOCK, NEW_BLOCK, 1)
        print("OK: pulsanti Importa/Esporta Supabase aggiunti nella griglia Archivio Dati.")
        changed = True
    else:
        print("ERRORE: blocco pulsanti Sheets non trovato nella griglia Archivio Dati. Impossibile inserire i nuovi pulsanti.")
        sys.exit(1)

    if changed:
        with open(FILE_PATH, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"OK: file salvato correttamente: {FILE_PATH}")
    else:
        print("INFO: nessuna modifica necessaria, il file era gia' aggiornato.")

    print("STATO FINALE: SUCCESSO, nessun errore.")


if __name__ == "__main__":
    main()
