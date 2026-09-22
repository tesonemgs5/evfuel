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

def main():
    root = find_project_root()
    if not root:
        print("ERRORE: Cartella android non trovata.")
        pausa_finale()
        sys.exit(1)

    android_dir = os.path.join(root, "android")
    gradle_path = os.path.join(android_dir, "app", "build.gradle")

    run_cmd("npm run build", root, "Compilazione bundle web dist/")
    run_cmd("npx cap copy android", root, "Sincronizzazione risorse su Android")

    versione = calcola_versione()
    new_code = bump_version_gradle(gradle_path, versione)

    is_win = os.name == "nt"
    gradlew = os.path.join(android_dir, "gradlew.bat" if is_win else "./gradlew")
    
    print("\n[Eseguo] gradlew assembleRelease --parallel (Generazione APK veloce)...")
    res = subprocess.run([gradlew, "assembleRelease", "--parallel"], cwd=android_dir, shell=is_win)
    if res.returncode != 0:
        print("\nERRORE nella build Gradle dell'APK.")
        pausa_finale()
        sys.exit(1)

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
