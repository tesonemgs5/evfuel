#!/usr/bin/env python3
"""
Crea android/keystore.properties in modo sicuro e guidato.
Basta lanciarlo e rispondere alle domande: scrive lui il file,
senza rischio di errori di formattazione o di incollare comandi
nel terminale per sbaglio.

Uso (dalla cartella del progetto, quella con dentro "android"):
    python create_keystore_properties.py
"""

import os
import sys
import getpass


def find_project_root(start_path):
    candidates = [start_path]
    for c in candidates:
        if os.path.isdir(os.path.join(c, "android")):
            return c
    return None


def main():
    start_path = os.getcwd()
    project_root = find_project_root(start_path)

    if not project_root:
        print("ERRORE: non trovo la cartella 'android' partendo da:", start_path)
        print("Lancia lo script dalla cartella del progetto (quella con dentro 'android').")
        sys.exit(1)

    android_dir = os.path.join(project_root, "android")
    keystore_props_path = os.path.join(android_dir, "keystore.properties")

    if os.path.isfile(keystore_props_path):
        risposta = input(
            f"'{keystore_props_path}' esiste già. Sovrascrivere? (s/n): "
        ).strip().lower()
        if risposta != "s":
            print("Operazione annullata, file lasciato com'era.")
            return

    print("\nInserisci i dati del keystore (quelli usati con Android Studio).\n")

    default_store = os.path.join(os.path.dirname(project_root), "turni-release.jks")
    store_file = input(
        f"Percorso completo del file .jks [{default_store}]: "
    ).strip()
    if not store_file:
        store_file = default_store

    if not os.path.isfile(store_file):
        print(f"\nATTENZIONE: non trovo il file '{store_file}'.")
        conferma = input("Vuoi salvare comunque questo percorso? (s/n): ").strip().lower()
        if conferma != "s":
            print("Operazione annullata. Rilancia lo script con il percorso corretto.")
            sys.exit(1)

    store_password = getpass.getpass("Key store password: ")
    key_alias = input("Key alias (es. turni): ").strip()
    key_password = getpass.getpass("Key password (invio per usare la stessa dello store): ")
    if not key_password:
        key_password = store_password

    store_file_escaped = store_file.replace("\\", "\\\\")

    content = (
        f"storeFile={store_file_escaped}\n"
        f"storePassword={store_password}\n"
        f"keyAlias={key_alias}\n"
        f"keyPassword={key_password}\n"
    )

    with open(keystore_props_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"\nFatto. Creato: {keystore_props_path}")

    # Aggiorna anche .gitignore, per sicurezza
    gitignore_path = os.path.join(android_dir, ".gitignore")
    lines_to_add = ["keystore.properties", "*.jks"]
    existing = ""
    if os.path.isfile(gitignore_path):
        with open(gitignore_path, "r", encoding="utf-8") as f:
            existing = f.read()

    missing = [l for l in lines_to_add if l not in existing]
    if missing:
        with open(gitignore_path, "a", encoding="utf-8") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            for l in missing:
                f.write(l + "\n")
        print(f"Aggiunto a .gitignore: {', '.join(missing)}")

    print("\nOra puoi lanciare: python build_release.py")


if __name__ == "__main__":
    main()
