# Sincronizzazione automatica in background: pull (rebase) e push ogni 20 secondi
while ($true) {
    git pull --rebase --autostash 2>&1 | Out-Null
    if ((git status -sb) -match 'ahead') { git push 2>&1 | Out-Null }
    Start-Sleep -Seconds 20
}
