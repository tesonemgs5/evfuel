@echo off
cd /d "%~dp0"
if not exist ".git\hooks" (
  echo ERRORE: cartella .git non trovata. Metti questo file nella cartella del progetto.
  pause
  exit /b 1
)
powershell -NoProfile -Command "[IO.File]::WriteAllBytes('.git\hooks\pre-commit',[Convert]::FromBase64String('IyEvYmluL3NoCnNldCAtLSAkKGRhdGUgKyIlWSAlaiAlSCVNIikKeT0kKGVjaG8gIiQxIiB8IGN1dCAtYzQpCnY9IiR5LiQyLiQzIgplY2hvICJleHBvcnQgY29uc3QgQVBQX1ZFUlNJT04gPSBcIiR2XCI7IiA+IHNyYy92ZXJzaW9uLmpzCmdpdCBhZGQgc3JjL3ZlcnNpb24uanMK'))"
if exist ".git\hooks\pre-commit" (echo OK: hook installato.) else (echo ERRORE: installazione non riuscita.)
pause
