@echo off
title REGISTRE DIARI EF — Auto-Sync GitHub
echo ========================================================
echo       REGISTRE DIARI EF - AUTO-SYNC GITHUB DAEMON
echo ========================================================
echo Monitorizando cambios en el proyecto...
echo Cada cambio se subira automaticamente a GitHub.
echo.
node scripts/auto_sync.js
pause
