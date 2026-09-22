@echo off
cd /d "%~dp0"
echo ===============================================
echo   Generazione APK Veloce (Telefono) in corso...
echo ===============================================
echo.
python aggiorna_versione_e_build.py
pause >nul
