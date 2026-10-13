@echo off
cd /d "%~dp0"
echo ===============================================
echo   Generazione APK Veloce (Telefono) in corso...
echo ===============================================
echo.
python aggiorna_versione_e_build.py
if errorlevel 1 (pause & exit /b 1)
call sincronizza.bat "Nuova versione APK" nopause
pause >nul
