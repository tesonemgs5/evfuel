@echo off
cd /d "%~dp0"
echo ===============================================
echo   Generazione AAB (Google Play Store) in corso...
echo ===============================================
echo.
python build_aab.py
pause >nul
