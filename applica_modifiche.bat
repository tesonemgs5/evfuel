@echo off
setlocal

echo ============================================
echo  Applico modifiche a src\App.jsx
echo ============================================
echo.

cd /d "%~dp0"

python fix_pulsanti_supabase.py
set PYEXIT=%ERRORLEVEL%

echo.
echo ============================================
if %PYEXIT% EQU 0 (
    echo  RISULTATO: NESSUN ERRORE
) else (
    echo  RISULTATO: ERRORE - controlla il messaggio sopra
)
echo ============================================
echo.

pause
