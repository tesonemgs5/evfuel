@echo off
rem ===========================================================
rem  Sincronizza: pull (rebase) + commit + push in automatico.
rem  Uso: doppio clic, oppure  sincronizza.bat "messaggio commit"
rem ===========================================================
cd /d "%~dp0"
set MSG=%~1
if "%MSG%"=="" set MSG=Aggiornamento %DATE% %TIME:~0,5%

echo [1/4] Scarico le novita da GitHub...
git pull --rebase --autostash
if errorlevel 1 (
    echo.
    echo ERRORE nel pull: risolvi il conflitto indicato sopra, poi rilancia.
    pause
    exit /b 1
)

echo [2/4] Preparo le modifiche...
git add -A

echo [3/4] Commit...
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "%MSG%"
) else (
    echo Nessuna modifica da committare.
)

echo [4/4] Push su GitHub (parte la build APK)...
git push
if errorlevel 1 (
    echo.
    echo ERRORE nel push.
    pause
    exit /b 1
)

echo.
echo Fatto: repository sincronizzato.
if "%~2"=="" pause
