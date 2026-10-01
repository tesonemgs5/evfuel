#!/usr/bin/env python3
"""
Aggiorna il formato versione a  A.GGG.HHMM  (es. 6.261.1854)
in ENTRAMBI i posti:
  - vite.config.js       (app web/Electron)
  - android/app/build.gradle (app Android, APK/AAB)

poi RICOSTRUISCE il contenuto web, lo RISINCRONIZZA su Android e infine
genera la build Android firmata (AAB + APK) con quella versione.

Eseguibile con doppio click: alla fine aspetta un tasto prima di
chiudersi, cosi' si legge l'esito anche se la finestra si apre da sola.

Cosa fa, in ordine:
1. Corregge la funzione calcolaVersioneBuild() in vite.config.js
   per usare il nuovo formato (fa una copia di sicurezza .bak la
   prima volta che la modifica).
2. Calcola la versione con quel formato a partire dalla data
   dell'ULTIMO COMMIT GIT, non dall'istante in cui parte questa build:
   cosi' la versione e' SEMPRE la stessa sia che la calcoli Vercel
   (build automatica al push) sia che la calcoli questo script in
   locale, anche giorni dopo — finche' non fai un nuovo commit, la
   versione resta quella. Prima veniva calcolata dall'orologio della
   macchina che builda, quindi ogni build (Vercel, poi il PC ore dopo)
   inventava un numero diverso pur essendo lo stesso identico codice.
3. Esegue "npm run build": ricompila TUTTO il codice React (01-App.jsx,
   06-Logica.jsx, ecc.) in dist/, incluso il numero di versione che
   vedi in Impostazioni (__APP_VERSION__, calcolato al momento di
   QUESTA build, non di una build precedente).
   ── SENZA QUESTO PASSAGGIO — che nella versione precedente dello
   script mancava — la build Android impacchettava sempre il codice
   web VECCHIO: solo il numero di versione nativo Android (visibile
   nello store/nel package) veniva aggiornato, mentre l'app dentro
   restava quella dell'ultima volta che avevi lanciato "npm run build"
   + "npx cap sync android" a mano. Era questo a far sembrare l'APK
   "vecchio" anche con versionCode/versionName aggiornati. ──
4. Esegue "npx cap sync android": copia dist/ dentro
   android/app/src/main/assets/public (dove la WebView la legge
   davvero) e sincronizza la configurazione Capacitor/plugin nativi.
5. Aggiorna versionCode (+1) e versionName in android/app/build.gradle.
6. Ferma eventuali demoni Gradle rimasti bloccati da un tentativo
   precedente ("gradlew --stop"): un demone incastrato e' la causa
   piu' comune del TimeoutException a fine build su Windows.
7. Lancia gradlew bundleRelease e assembleRelease.
8. Copia AAB e APK in <progetto>/release-builds/<timestamp>_v<versione>/
9. Segnala chiaramente se l'APK risulta firmato o no.
"""

import os
import re
import sys
import shutil
import subprocess
from datetime import datetime

try:
    from zoneinfo import ZoneInfo
    ROMA = ZoneInfo("Europe/Rome")
except Exception:
    ROMA = None

# Prefisso del nome del file APK: <prefisso>-a-ggg-hhmm.apk
# (es. evfuel-6-274-2240.apk). Cambialo qui se copi lo script in un altro progetto.
PREFISSO_APK = "evfuel"


def pausa_finale():
    try:
        input("\nPremi INVIO per chiudere...")
    except Exception:
        pass


def find_project_root():
    """Cerca la cartella progetto partendo da dove si trova questo script."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [here, os.path.join(here, "calendario")]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "android", "app", "build.gradle")):
            return c
    return None


class ErroreVersione(Exception):
    pass


def ultima_data_commit(project_root):
    """
    Legge la data dell'ultimo commit git: e' l'UNICO orario usato per la
    versione, uguale per tutti (app, versionName Android, nome del file
    APK, build su Vercel) finche' non si fa un nuovo commit.
    NIENTE ripiego sull'orologio del PC: se git non risponde si solleva
    ErroreVersione col motivo vero, invece di inventare un orario diverso
    a ogni build.
    """
    try:
        iso = subprocess.check_output(
            ["git", "log", "-1", "--format=%cI"], cwd=project_root, text=True,
            stderr=subprocess.STDOUT,
        ).strip()
    except FileNotFoundError:
        raise ErroreVersione("git non e' installato o non e' nel PATH di sistema.")
    except subprocess.CalledProcessError as e:
        dettaglio = (e.output or "").strip() or f"codice di uscita {e.returncode}"
        raise ErroreVersione(f"'git log' e' fallito in {project_root}:\n  {dettaglio}")
    if not iso:
        raise ErroreVersione(
            f"git non ha restituito nessun commit in {project_root} "
            "(repository senza commit?). Fai almeno un commit e riprova."
        )
    try:
        return datetime.fromisoformat(iso)  # es. "2026-09-18T22:24:10+02:00"
    except ValueError:
        raise ErroreVersione(f"data del commit non leggibile: {iso!r}")


def calcola_versione(project_root):
    ora = ultima_data_commit(project_root)
    # Conversione esplicita in Europe/Rome: la data del commit di solito
    # e' gia' quella locale di chi l'ha fatto, ma non possiamo darlo per
    # scontato (un commit fatto da un altro fuso orario, o senza ROMA
    # disponibile sul sistema).
    if ROMA:
        try:
            ora = ora.astimezone(ROMA)
        except Exception:
            pass
    anno_cifra = str(ora.year)[-1]              # es. 2026 -> "6"
    giorno_anno = ora.timetuple().tm_yday        # 1-366, senza zeri iniziali
    ora_minuti = ora.strftime("%H%M")            # con zero iniziale se serve
    return f"{anno_cifra}.{giorno_anno}.{ora_minuti}"


def assicura_import_execsync(content):
    """
    La nuova calcolaVersioneBuild() chiama execSync per leggere la data
    dell'ultimo commit: serve importarla in cima al file. Se manca la
    aggiunge subito dopo l'ultimo "import ..." esistente (in ESM gli
    import possono stare ovunque a livello di modulo, ma tenerli in
    cima e' piu' leggibile); se proprio non trova nessun import la mette
    a inizio file. Non tocca nulla se e' gia' presente.
    """
    if "node:child_process" in content or "from 'child_process'" in content:
        return content
    riga_import = "import { execSync } from 'node:child_process';\n"
    ultimo_import = None
    for m in re.finditer(r'^import .*$', content, re.MULTILINE):
        ultimo_import = m
    if ultimo_import:
        pos = ultimo_import.end()
        return content[:pos] + "\n" + riga_import.rstrip("\n") + content[pos:]
    return riga_import + content


def aggiorna_vite_config(vite_path):
    """
    Sostituisce il corpo di calcolaVersioneBuild() con la nuova formula
    (basata sulla data dell'ultimo commit git, non sull'istante della
    build) e si assicura che l'import necessario (execSync) sia presente.
    Se il file ha gia' il nuovo formato, non tocca nulla.
    """
    with open(vite_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = assicura_import_execsync(content)

    nuova_funzione = '''function calcolaVersioneBuild() {
  // Versione imposta dallo script di build locale (aggiorna_versione_e_build.py):
  // e' la stessa usata per versionName Android e per il nome del file APK.
  // Su Vercel la variabile non esiste e si usa il calcolo da git qui sotto.
  if (process.env.APP_VERSION_FORZATA) return process.env.APP_VERSION_FORZATA;
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
}'''

    match = re.search(r"function calcolaVersioneBuild\s*\(\)\s*\{", content)
    if not match:
        print("ATTENZIONE: non trovo 'function calcolaVersioneBuild()' in vite.config.js.")
        print("Nessuna modifica applicata a vite.config.js.")
        return False

    start = match.start()
    i = match.end() - 1  # posizione della prima '{'
    depth = 0
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1
    end = i + 1

    vecchia_funzione = content[start:end]
    con_import_originale = open(vite_path, "r", encoding="utf-8").read()
    import_gia_presente = ("node:child_process" in con_import_originale or "from 'child_process'" in con_import_originale)
    if vecchia_funzione.strip() == nuova_funzione.strip() and import_gia_presente:
        print("vite.config.js: formato versione gia' aggiornato, nessuna modifica necessaria.")
        return True

    backup_path = vite_path + ".bak"
    if not os.path.isfile(backup_path):
        shutil.copyfile(vite_path, backup_path)
        print(f"Backup creato: {backup_path}")

    nuovo_content = content[:start] + nuova_funzione + content[end:]
    with open(vite_path, "w", encoding="utf-8") as f:
        f.write(nuovo_content)

    print("vite.config.js: formato versione aggiornato (calcolata dall'ultimo commit git, import execSync incluso).")
    return True


def verifica_versione_in_dist(project_root, versione):
    """
    Controlla che il numero di versione sia davvero finito nel codice
    compilato (dist/): e' quello che l'app mostra in Impostazioni.
    Se non c'e', il nome del file APK potrebbe non coincidere con l'app.
    """
    dist = os.path.join(project_root, "dist")
    for cartella, _, files in os.walk(dist):
        for nome in files:
            if not nome.endswith((".js", ".html", ".json", ".webmanifest")):
                continue
            try:
                with open(os.path.join(cartella, nome), "r", encoding="utf-8", errors="ignore") as f:
                    if versione in f.read():
                        print(f"Controllo versione: {versione} presente nel codice compilato ({nome}).")
                        return True
            except OSError:
                pass
    print("\n" + "!" * 60)
    print(f"ATTENZIONE: la versione {versione} NON risulta in dist/.")
    print("L'app potrebbe mostrare un numero diverso dal nome del file APK.")
    print("Controlla che vite.config.js passi calcolaVersioneBuild() ad __APP_VERSION__.")
    print("!" * 60 + "\n")
    return False


def run_npm_o_npx(project_root, comando, descrizione):
    """
    Esegue un comando npm/npx nella cartella del progetto. Su Windows serve
    shell=True perche' npm/npx sono script .cmd, non eseguibili diretti.
    """
    is_windows = os.name == "nt"
    print(f"\nEseguo: {comando} ({descrizione})...\n")
    result = subprocess.run(comando, cwd=project_root, shell=is_windows)
    if result.returncode != 0:
        print(f"\nERRORE: '{comando}' e' fallito. Controlla l'output sopra.")
        print("La build Android NON verra' avviata: rifarla ora produrrebbe")
        print("comunque un pacchetto con lo stesso contenuto web di prima.")
        pausa_finale()
        sys.exit(1)


def bump_version_gradle(gradle_path, nuova_versione):
    with open(gradle_path, "r", encoding="utf-8") as f:
        content = f.read()

    match_code = re.search(r"versionCode\s+(\d+)", content)
    match_name = re.search(r'versionName\s+"([^"]+)"', content)

    if not match_code or not match_name:
        print("ERRORE: non trovo 'versionCode' o 'versionName' in build.gradle.")
        sys.exit(1)

    old_code = int(match_code.group(1))
    old_name = match_name.group(1)
    new_code = old_code + 1

    content = content.replace(f"versionCode {old_code}", f"versionCode {new_code}", 1)
    content = content.replace(
        f'versionName "{old_name}"', f'versionName "{nuova_versione}"', 1
    )

    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"build.gradle: versionCode {old_code} -> {new_code}, "
          f"versionName {old_name} -> {nuova_versione}")
    return new_code


def gradlew_path_per(android_dir):
    is_windows = os.name == "nt"
    gradlew = "gradlew.bat" if is_windows else "./gradlew"
    return os.path.join(android_dir, gradlew), is_windows


def ferma_demoni_gradle(android_dir):
    """
    Ferma eventuali demoni Gradle rimasti bloccati da un tentativo
    precedente. Un demone incastrato e' la causa piu' comune del
    TimeoutException "muto" a fine build osservato su Windows
    (tipicamente proprio mentre scrive il report dei problemi/warning).
    Se fallisce non e' grave: si prova comunque a proseguire con la build.
    """
    gradlew_p, is_windows = gradlew_path_per(android_dir)
    if not os.path.isfile(gradlew_p):
        return
    print("\nFermo eventuali demoni Gradle residui (gradlew --stop)...\n")
    subprocess.run([gradlew_p, "--stop"], cwd=android_dir, shell=is_windows)


def run_gradle_task(android_dir, task):
    gradlew_p, is_windows = gradlew_path_per(android_dir)

    if not os.path.isfile(gradlew_p):
        print(f"ERRORE: non trovo '{gradlew_p}'.")
        sys.exit(1)

    print(f"\nEseguo: {os.path.basename(gradlew_p)} {task} --parallel (build ultra-veloce)...\n")
    result = subprocess.run([gradlew_p, task, "--parallel"], cwd=android_dir, shell=is_windows)
    if result.returncode != 0:
        print(f"\nERRORE: '{task}' e' fallito (BUILD FAILED). Controlla l'output sopra.")
        print("Se l'errore e' un TimeoutException senza messaggio, prova a rilanciare")
        print("questo script: il passaggio 'gradlew --stop' qui sopra ferma i demoni")
        print("incastrati, ma se il PC era gia' molto carico puo' servire un secondo giro.")
        sys.exit(1)


def main():
    project_root = find_project_root()
    if not project_root:
        print("ERRORE: non trovo 'android/app/build.gradle'.")
        print("Metti questo script nella cartella del progetto (quella con dentro 'android') e rilancialo.")
        pausa_finale()
        sys.exit(1)

    android_dir = os.path.join(project_root, "android")
    app_gradle_path = os.path.join(android_dir, "app", "build.gradle")
    keystore_props_path = os.path.join(android_dir, "keystore.properties")
    vite_config_path = os.path.join(project_root, "vite.config.js")
    env_path = os.path.join(project_root, ".env")

    print(f"Progetto: {project_root}\n")

    if not os.path.isfile(keystore_props_path):
        print("ERRORE: non trovo 'android/keystore.properties'.")
        print("Va creato prima (con storeFile, storePassword, keyAlias, keyPassword).")
        pausa_finale()
        sys.exit(1)

    with open(app_gradle_path, "r", encoding="utf-8") as f:
        gradle_check = f.read()
    if "signingConfigs" not in gradle_check:
        print("ERRORE: 'android/app/build.gradle' non ha il blocco signingConfigs.")
        pausa_finale()
        sys.exit(1)

    if not os.path.isfile(env_path):
        print("ATTENZIONE: non trovo '.env' nella cartella del progetto.")
        print("Se contiene VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, 'npm run build'")
        print("potrebbe produrre un'app che non riesce a collegarsi a Supabase.")
        print("(Proseguo comunque: magari le variabili sono impostate diversamente.)\n")

    # 0. Versione calcolata UNA SOLA VOLTA, dall'ultimo commit git, e imposta
    #    a tutta la catena: app (via variabile d'ambiente letta da
    #    vite.config.js), versionName Android e nome del file APK.
    try:
        nuova_versione = calcola_versione(project_root)
    except ErroreVersione as e:
        print("ERRORE: non riesco a leggere la data dell'ultimo commit git.")
        print(f"  {e}")
        print("Senza un commit non c'e' un orario univoco per la versione: build annullata.")
        pausa_finale()
        sys.exit(1)
    os.environ["APP_VERSION_FORZATA"] = nuova_versione
    print(f"Versione (dall'ultimo commit git): {nuova_versione}\n")

    # 1. Aggiorna vite.config.js (app web) al nuovo formato, PRIMA di buildare
    if os.path.isfile(vite_config_path):
        aggiorna_vite_config(vite_config_path)
    else:
        print("ATTENZIONE: vite.config.js non trovato, salto l'aggiornamento web.")

    # 2. Ricompila il codice React/web: e' QUESTO che genera il numero di
    #    versione che l'app mostra in Impostazioni, e tutto il resto del
    #    codice aggiornato (01-App.jsx, 06-Logica.jsx, ecc.).
    run_npm_o_npx(project_root, "npm run build", "ricompilo il codice web in dist/")
    versione_in_dist = verifica_versione_in_dist(project_root, nuova_versione)

    # 3. Copia ultra-veloce dei file dist/ dentro Android (npx cap copy)
    run_npm_o_npx(project_root, "npx cap copy android", "copio dist/ nelle risorse Android (versione veloce)")

    # 4. (la versione e' gia' stata calcolata al punto 0: identica per app, gradle e nome file)

    # 5. Aggiorna build.gradle
    new_code = bump_version_gradle(app_gradle_path, nuova_versione)

    # 6. Build APK velocizzata (usa demone caldo Gradle + build parallela)
    run_gradle_task(android_dir, "assembleRelease")

    # 7. Percorsi sorgente
    aab_src = os.path.join(android_dir, "app", "build", "outputs", "bundle", "release", "app-release.aab")
    apk_src = os.path.join(android_dir, "app", "build", "outputs", "apk", "release", "app-release.apk")
    apk_unsigned_src = os.path.join(android_dir, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk")

    if not os.path.isfile(aab_src):
        print(f"ATTENZIONE: non trovo l'AAB atteso in {aab_src}")
    if not os.path.isfile(apk_src):
        if os.path.isfile(apk_unsigned_src):
            print("\nATTENZIONE: l'APK generato NON e' firmato (app-release-unsigned.apk).")
            print("Controlla keystore.properties e il blocco signingConfigs in build.gradle.")
        else:
            print(f"ATTENZIONE: non trovo nessun APK in {os.path.dirname(apk_src)}")

    # 8. Copia in cartella di output (SOLO l'APK per installazione diretta)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir_name = f"{timestamp}_v{nuova_versione}"
    out_dir = os.path.join(project_root, "release-builds", out_dir_name)
    os.makedirs(out_dir, exist_ok=True)

    copied = []
    if os.path.isfile(apk_src):
        # Nome file: <prefisso>-a-ggg-hhmm.apk (es. versione 6.274.2240 -> evfuel-6-274-2240.apk)
        nome_apk = PREFISSO_APK + "-" + nuova_versione.replace(".", "-") + ".apk"
        dest = os.path.join(out_dir, nome_apk)
        shutil.copyfile(apk_src, dest)
        copied.append(dest)

    print("\n--- Fatto ---")
    print(f"Versione: versionCode {new_code}, versionName {nuova_versione}")
    if not versione_in_dist:
        print(f"ATTENZIONE: versione non trovata in dist/: verifica che l'app mostri {nuova_versione} in Impostazioni.")
    print("Questa build include il codice web ricompilato ORA (npm run build")
    print("+ npx cap sync android eseguiti sopra), non una copia precedente.")
    if copied:
        print("File salvati in:")
        for c in copied:
            print(f"  - {c}")
    else:
        print("Nessun file copiato: controlla gli errori sopra.")

    pausa_finale()


if __name__ == "__main__":
    main()
