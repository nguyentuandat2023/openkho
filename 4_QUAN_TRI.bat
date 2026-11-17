@echo off
chcp 65001 >nul
cd /d "%~dp0"
title OpenKho - Quan tri
set "npm_config_cache=%LOCALAPPDATA%\npm-cache"
echo Trang quan tri chay tai http://localhost:4321 (chi truy cap duoc tu may nay).
echo Dong cua so nay de tat trang quan tri.
start "" http://localhost:4321
node scripts\admin\server.mjs
