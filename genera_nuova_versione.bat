@echo off
cd /d "%~dp0"
echo ===============================================
echo   Generazione Nuova Versione Sincronizzata
echo ===============================================
echo.
python nuova_versione.py
pause >nul
