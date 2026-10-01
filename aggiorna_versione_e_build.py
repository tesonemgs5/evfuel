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
    giorno_anno = f"{ora.timetuple().tm_yday:03d}"
    ora_minuti = ora.strftime("%H%M")
    return f"{anno_cifra}.{giorno_anno}.{ora_minuti}"

def run_cmd(cmd, root, desc):
    is_win = os.name == "nt"
    print(f"\n[Eseguo] {cmd} ({desc})...\n")
    res = subprocess.run(cmd, cwd=root, shell=is_win)
    if res.returncode != 0:
        print(f"\nERRORE durante '{cmd}'. Build interrotta.")
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

    print(f"build.gradle: versionCode {old_code} -> {new_code} | versionName {old_name} -> {versione}")
    return new_code

def update_version_js(root, versione):
    vjs_path = os.path.join(root, "src", "version.js")
    with open(vjs_path, "w", encoding="utf-8") as f:
        f.write(f'export const APP_VERSION = "{versione}";\n')
    print(f"src/version.js: APP_VERSION = \"{versione}\"")

def setup_java_home(android_dir):
    jdk21 = r"C:\Users\franc\.jdks\jbr-21.0.11"
    studio_jbr = r"C:\Program Files\Android\Android Studio\jbr"
    if os.path.exists(jdk21):
        os.environ["JAVA_HOME"] = jdk21
    elif os.path.exists(studio_jbr):
        os.environ["JAVA_HOME"] = studio_jbr

    local_props = os.path.join(android_dir, "local.properties")
    if not os.path.exists(local_props):
        sdk_path = os.path.expanduser(r"~\AppData\Local\Android\Sdk").replace("\\", "\\\\")
        with open(local_props, "w", encoding="utf-8") as f:
            f.write(f"sdk.dir={sdk_path}\n")

def check_keystore_properties(android_dir):
    props_path = os.path.join(android_dir, "keystore.properties")
    if os.path.exists(props_path):
        with open(props_path, "r", encoding="utf-8") as f:
            content = f.read()
        if "TuaPasswordKeyStore" in content or "TuaPasswordChiave" in content:
            print("\n⚠️ ATTENZIONE: Il file 'android/keystore.properties' contiene ancora la password di esempio!")
            print("  Sostituisci 'TuaPasswordKeyStore' con la password reale che hai scelto per il Keystore.")
            pausa_finale()
            sys.exit(1)

def get_version_or_create(root):
    vjs_path = os.path.join(root, "src", "version.js")
    if os.path.isfile(vjs_path):
        with open(vjs_path, "r", encoding="utf-8") as f:
            content = f.read()
        match = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', content)
        if match:
            v = match.group(1)
            print(f"Uso versione sincronizzata Web/APK: v{v}")
            return v
    v = calcola_versione()
    with open(vjs_path, "w", encoding="utf-8") as f:
        f.write(f'export const APP_VERSION = "{v}";\n')
    print(f"Creata versione sincronizzata: v{v}")
    return v

def main():
    root = find_project_root()
    if not root:
        print("ERRORE: Cartella android non trovata.")
        pausa_finale()
        sys.exit(1)

    android_dir = os.path.join(root, "android")
    setup_java_home(android_dir)
    gradle_path = os.path.join(android_dir, "app", "build.gradle")

    versione = calcola_versione()
    update_version_js(root, versione)
    new_code = bump_version_gradle(gradle_path, versione)

    run_cmd("npm run build", root, "Compilazione bundle web dist/")
    run_cmd("npx cap copy android", root, "Sincronizzazione risorse su Android")

    is_win = os.name == "nt"
    gradlew = os.path.join(android_dir, "gradlew.bat" if is_win else "./gradlew")
    
    print("\n[Eseguo] gradlew :app:assembleRelease --parallel (Generazione APK veloce)...")
    res = subprocess.run([gradlew, ":app:assembleRelease", "--parallel"], cwd=android_dir, shell=is_win)
    if res.returncode != 0:
        print("\nERRORE nella build Gradle dell'APK.")
        pausa_finale()
        sys.exit(1)

    apk_src = os.path.join(android_dir, "app", "build", "outputs", "apk", "release", "app-release.apk")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir = os.path.join(root, "release-builds", f"{timestamp}_v{versione}")
    os.makedirs(out_dir, exist_ok=True)

    if os.path.isfile(apk_src):
        dest = os.path.join(out_dir, f"evfuel-{versione.replace('.', '-')}.apk")
        shutil.copyfile(apk_src, dest)
        print(f"\n[OK] APK generato con successo:\n  - {dest}")
    else:
        print("\n[ERRORE] APK non trovato!")

    pausa_finale()

if __name__ == "__main__":
    main()
