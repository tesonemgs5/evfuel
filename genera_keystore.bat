@echo off
cd /d "%~dp0"
echo ===============================================
echo   Generazione Keystore Android (Release)
echo ===============================================
echo.

set KEYTOOL="C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"

if not exist %KEYTOOL% (
    if exist "C:\Program Files (x86)\Java\jre1.8.0_191\bin\keytool.exe" (
        set KEYTOOL="C:\Program Files (x86)\Java\jre1.8.0_191\bin\keytool.exe"
    ) else (
        set KEYTOOL=keytool
    )
)

%KEYTOOL% -genkey -v -keystore android\my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias

echo.
echo ===============================================
echo   Completato! Se la chiave e' stata generata,
echo   puoi ora lanciare aggiorna_e_pubblica_apk.bat
echo ===============================================
pause
