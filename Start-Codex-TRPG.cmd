@echo off
cd /d "%~dp0"
node scripts/doctor.mjs
if errorlevel 1 goto end
echo Open http://127.0.0.1:4317 in your browser.
node local/server.mjs
:end
pause
