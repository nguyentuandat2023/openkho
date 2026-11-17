@echo off
chcp 65001 >nul
cd /d "%~dp0"
title OpenKho - Website
set "npm_config_cache=%LOCALAPPDATA%\npm-cache"
set NEXT_TELEMETRY_DISABLED=1
echo Dang build website (khoang 30 giay)...
call npm run build
if errorlevel 1 (
  echo Build that bai. Xem thong bao loi o tren.
  pause
  exit /b 1
)
echo.
echo Mo trinh duyet tai http://localhost:3000 - dong cua so nay de tat website.
start "" http://localhost:3000
node scripts\serve.mjs --port 3000
