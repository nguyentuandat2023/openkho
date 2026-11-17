@echo off
chcp 65001 >nul
cd /d "%~dp0"
title OpenKho - Tu dong cap nhat
set "npm_config_cache=%LOCALAPPDATA%
pm-cache"
set NEXT_TELEMETRY_DISABLED=1
echo Bo lap lich tu dong: kham pha repo moi (3 gio), cap nhat so lieu (6 gio), xep hang (24 gio)...
echo Dong cua so nay de dung. Trang thai: npm run jobs -- status
echo.
node scripts\scheduler\daemon.mjs
pause
