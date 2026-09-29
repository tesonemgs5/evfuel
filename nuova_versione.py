#!/usr/bin/env python3
"""
Aggiorna il timestamp di versione a.ggg.hhmm in src/version.js per sincronizzare Web e APK.
"""
import os
from datetime import datetime

def calcola_versione():
    ora = datetime.now()
    anno_cifra = str(ora.year)[-1]
    giorno_anno = ora.timetuple().tm_yday
    ora_minuti = ora.strftime("%H%M")
    return f"{anno_cifra}.{giorno_anno}.{ora_minuti}"

def main():
    root = os.path.dirname(os.path.abspath(__file__))
    versione = calcola_versione()
    vjs_path = os.path.join(root, "src", "version.js")
    with open(vjs_path, "w", encoding="utf-8") as f:
        f.write(f'export const APP_VERSION = "{versione}";\n')
    print(f"\n[OK] Nuova versione sincronizzata creata: v{versione}")
    print("Ora sia la versione Web (Vercel) che l'APK utilizzeranno questo esatto numero di versione.\n")

if __name__ == "__main__":
    main()
