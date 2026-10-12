# Guida Completa Setup Capacitor, APK/AAB e Avvio Offline per Nuovi Progetti

Questa guida contiene tutte le istruzioni, il codice e i file di script da copiare nel tuo **nuovo progetto** (React/Vite/PWA) per abilitare:
1. **Configurazione di Capacitor (Supporto Android Nativo)**
2. **Avvio Offline Istantaneo (anche a telefono spento/senza internet)**
3. **Firmare l'app Android con Keystore (Release)**
4. **Generazione di Build Separati Veloci per APK (test) e AAB (Google Play Store)**

---

## 1. Installazione e Configurazione Capacitor

Nel terminale della root del tuo nuovo progetto, esegui i seguenti comandi:

```bash
# 1. Installazione pacchetti Capacitor
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

# 2. Inizializzazione Capacitor (Sostituisci "NomeApp" e "com.tuodominio.app")
npx cap init "NomeApp" "com.tuodominio.app"

# 3. Creazione cartella nativa Android
npx cap add android
```

---

## 2. Gestione Avvio Offline & Purga Cache JS (`src/App.jsx` o `src/index.jsx`)

Per garantire che l'APK si avvii **istantaneamente anche senza connessione internet** (offline da freddo) e che la cache del browser/WebView non blocchi l'aggiornamento dell'APK mantenendo i dati locali dell'utente, usa questa struttura nell'entry point dell'app:

```javascript
import { Capacitor } from '@capacitor/core';

// 1. Rilevamento se l'app sta girando in Capacitor (APK Android)
export const isNativeCapacitor = () => {
  return Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:';
};

// 2. Pulizia automatica CacheStorage/ServiceWorker al cambio versione (senza cancellare localStorage)
export const purgaCacheInutile = async () => {
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.log('CacheStorage svuotato con successo.');
    } catch (e) {
      console.warn('Impossibile svuotare caches:', e);
    }
  }
};

// 3. Gestione Cold Start Offline nel componente principale (App.jsx)
useEffect(() => {
  const inizializzaApp = async () => {
    const isOffline = !navigator.onLine;
    const haDatiLocali = !!localStorage.getItem('dati_salvati'); // inserisci la tua chiave principale

    // Se l'app è offline o nativa e ha dati locali, rimuovi subito lo spinner di caricamento
    if ((isOffline || isNativeCapacitor()) && haDatiLocali) {
      setLoading(false); // Rende l'interfaccia immediatamente visibile
    }

    try {
      // Inizializza Supabase/Firebase o i tuoi servizi di backend qui...
    } catch (err) {
      console.warn("Avvio offline con dati salvati in locale.");
    } finally {
      setLoading(false);
    }
  };

  inizializzaApp();
}, []);
```

---

## 3. Configurazione Keystore per Firmare l'App (`build.gradle`)

Per poter installare l'APK o pubblicare l'AAB sullo store, l'app Android deve essere firmata.

### Passaggio 3.1: Genera la tua Keystore (eseguire nel terminale)
```bash
keytool -genkey -v -keystore android/my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
```

### Passaggio 3.2: Crea il file `android/keystore.properties`
Crea un file chiamato `keystore.properties` nella cartella `android/` con questo contenuto:

```properties
storePassword=TuaPasswordKeyStore
keyPassword=TuaPasswordChiave
keyAlias=my-key-alias
storeFile=my-release-key.jks
```

### Passaggio 3.3: Configura `android/app/build.gradle`
Apri `android/app/build.gradle` e aggiungi la lettura del file `keystore.properties` e il blocco `signingConfigs`:

```groovy
import java.io.FileInputStream
import java.util.Properties

def keystorePropertiesFile = rootProject.file('keystore.properties')
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

---

## 4. Script di Build Separate per Dimezzare i Tempi (APK & AAB)

Per velocizzare la creazione dell'APK da 3 minuti a soli **20-30 secondi**, creiamo due script Python e due lanciatori `.bat`.

---

### File 1: `aggiorna_versione_e_build.py` (Script per SOLO APK veloce)
Crea questo file nella root del progetto:

```python
#!/usr/bin/env python3
"""
Script di build ultra-veloce per APK Android (Telefono).
Compila il codice web, sincronizza Capacitor ed esegue assembleRelease.
"""

import os
import re
import sys
import shutil
import subprocess
from datetime import datetime

def pausa_finale():
    try:
        input("\nPremi INVIO per chiudere...")
    except Exception:
        pass

def find_project_root():
    here = os.path.dirname(os.path.abspath(__file__))
    if os.path.isfile(os.path.join(here, "android", "app", "build.gradle")):
        return here
    return None

def calcola_versione():
    ora = datetime.now()
    anno_cifra = str(ora.year)[-1]
    giorno_anno = ora.timetuple().tm_yday
    ora_minuti = ora.strftime("%H%M")
    return f"{anno_cifra}.{giorno_anno}.{ora_minuti}"

def run_cmd(cmd, project_root, desc):
    is_win = os.name == "nt"
    print(f"\n[Eseguo] {cmd} ({desc})...\n")
    res = subprocess.run(cmd, cwd=project_root, shell=is_win)
    if res.returncode != 0:
        print(f"\nERRORE durante '{cmd}'. Build interrotta.")
        pausa_finale()
        sys.exit(1)

def bump_version_gradle(gradle_path, nuova_versione):
    with open(gradle_path, "r", encoding="utf-8") as f:
        content = f.read()

    match_code = re.search(r"versionCode\s+(\d+)", content)
    match_name = re.search(r'versionName\s+"([^"]+)"', content)

    if not match_code or not match_name:
        print("ERRORE: versionCode o versionName non trovati in build.gradle.")
        sys.exit(1)

    old_code = int(match_code.group(1))
    old_name = match_name.group(1)
    new_code = old_code + 1

    content = content.replace(f"versionCode {old_code}", f"versionCode {new_code}", 1)
    content = content.replace(f'versionName "{old_name}"', f'versionName "{nuova_versione}"', 1)

    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"build.gradle: versionCode {old_code} -> {new_code} | versionName {old_name} -> {nuova_versione}")
    return new_code

def main():
    root = find_project_root()
    if not root:
        print("ERRORE: Cartella android non trovata.")
        pausa_finale()
        sys.exit(1)

    android_dir = os.path.join(root, "android")
    gradle_path = os.path.join(android_dir, "app", "build.gradle")

    # 1. Compilazione Web React/Vite
    run_cmd("npm run build", root, "Compilazione bundle web dist/")

    # 2. Copia velocizzata Capacitor
    run_cmd("npx cap copy android", root, "Sincronizzazione risorse su Android")

    # 3. Bump Versione Gradle
    versione = calcola_versione()
    new_code = bump_version_gradle(gradle_path, versione)

    # 4. Build APK Nativa Android
    is_win = os.name == "nt"
    gradlew = os.path.join(android_dir, "gradlew.bat" if is_win else "./gradlew")
    
    print("\n[Eseguo] gradlew assembleRelease --parallel (Generazione APK veloce)...")
    res = subprocess.run([gradlew, "assembleRelease", "--parallel"], cwd=android_dir, shell=is_win)
    if res.returncode != 0:
        print("\nERRORE nella build Gradle dell'APK.")
        pausa_finale()
        sys.exit(1)

    # 5. Salva l'APK nella cartella release-builds/
    apk_src = os.path.join(android_dir, "app", "build", "outputs", "apk", "release", "app-release.apk")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir = os.path.join(root, "release-builds", f"{timestamp}_v{versione}")
    os.makedirs(out_dir, exist_ok=True)

    if os.path.isfile(apk_src):
        dest = os.path.join(out_dir, "app-release.apk")
        shutil.copyfile(apk_src, dest)
        print(f"\n✅ APK generato con successo:\n  - {dest}")
    else:
        print("\n❌ APK non trovato!")

    pausa_finale()

if __name__ == "__main__":
    main()
```

---

### File 2: `aggiorna_e_pubblica_apk.bat` (Lancia la build APK con doppio click)
Crea questo file nella root del progetto:

```bat
@echo off
cd /d "%~dp0"
echo ===============================================
echo   Generazione APK Veloce (Telefono) in corso...
echo ===============================================
echo.
python aggiorna_versione_e_build.py
pause >nul
```

---

### File 3: `build_aab.py` (Script per SOLO AAB Play Store)
Crea questo file nella root del progetto:

```python
#!/usr/bin/env python3
"""
Script di build dedicato per il pacchetto AAB per Google Play Store.
"""

import os
import re
import sys
import shutil
import subprocess
from datetime import datetime

def pausa_finale():
    try:
        input("\nPremi INVIO per chiudere...")
    except Exception:
        pass

def find_project_root():
    here = os.path.dirname(os.path.abspath(__file__))
    if os.path.isfile(os.path.join(here, "android", "app", "build.gradle")):
        return here
    return None

def calcola_versione():
    ora = datetime.now()
    anno_cifra = str(ora.year)[-1]
    giorno_anno = ora.timetuple().tm_yday
    ora_minuti = ora.strftime("%H%M")
    return f"{anno_cifra}.{giorno_anno}.{ora_minuti}"

def run_cmd(cmd, root, desc):
    is_win = os.name == "nt"
    print(f"\n[Eseguo] {cmd} ({desc})...\n")
    res = subprocess.run(cmd, cwd=root, shell=is_win)
    if res.returncode != 0:
        print(f"\nERRORE in '{cmd}'.")
        pausa_finale()
        sys.exit(1)

def bump_version_gradle(gradle_path, versione):
    with open(gradle_path, "r", encoding="utf-8") as f:
        content = f.read()
    match_code = re.search(r"versionCode\s+(\d+)", content)
    match_name = re.search(r'versionName\s+"([^"]+)"', content)
    if not match_code or not match_name:
        print("ERRORE: versionCode o versionName non trovati.")
        sys.exit(1)
    old_code = int(match_code.group(1))
    old_name = match_name.group(1)
    new_code = old_code + 1
    content = content.replace(f"versionCode {old_code}", f"versionCode {new_code}", 1)
    content = content.replace(f'versionName "{old_name}"', f'versionName "{versione}"', 1)
    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)
    return new_code

def main():
    root = find_project_root()
    if not root:
        print("ERRORE: Cartella android non trovata.")
        pausa_finale()
        sys.exit(1)

    android_dir = os.path.join(root, "android")
    gradle_path = os.path.join(android_dir, "app", "build.gradle")

    run_cmd("npm run build", root, "Compilazione Web dist/")
    run_cmd("npx cap copy android", root, "Sincronizzazione risorse Capacitor")

    versione = calcola_versione()
    new_code = bump_version_gradle(gradle_path, versione)

    is_win = os.name == "nt"
    gradlew = os.path.join(android_dir, "gradlew.bat" if is_win else "./gradlew")

    print("\n[Eseguo] gradlew bundleRelease --parallel (Generazione AAB Play Store)...")
    res = subprocess.run([gradlew, "bundleRelease", "--parallel"], cwd=android_dir, shell=is_win)
    if res.returncode != 0:
        print("\nERRORE nella build Gradle dell'AAB.")
        pausa_finale()
        sys.exit(1)

    aab_src = os.path.join(android_dir, "app", "build", "outputs", "bundle", "release", "app-release.aab")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir = os.path.join(root, "release-builds", f"{timestamp}_v{versione}")
    os.makedirs(out_dir, exist_ok=True)

    if os.path.isfile(aab_src):
        dest = os.path.join(out_dir, "app-release.aab")
        shutil.copyfile(aab_src, dest)
        print(f"\n✅ Pacchetto AAB (Google Play Store) creato in:\n  - {dest}")
    else:
        print("\n❌ File AAB non trovato!")

    pausa_finale()

if __name__ == "__main__":
    main()
```

---

### File 4: `aggiorna_e_pubblica_aab.bat` (Lancia la build AAB con doppio click)
Crea questo file nella root del progetto:

```bat
@echo off
cd /d "%~dp0"
echo ===============================================
echo   Generazione AAB (Google Play Store) in corso...
echo ===============================================
echo.
python build_aab.py
pause >nul
```

---

## Riassunto Utilità per la Nuova App

- **`aggiorna_e_pubblica_apk.bat`**: Fai doppio click per generare in **20 secondi** il file `.apk` installabile direttamente sul telefono per i test quotidiani.
- **`aggiorna_e_pubblica_aab.bat`**: Fai doppio click solo quando devi pubblicare un nuovo aggiornamento ufficiale su **Google Play Console**.
- **Avvio Offline**: L'interfaccia si avvia senza attendere la connessione di rete ed evita blocchi se il telefono è disconnesso.
