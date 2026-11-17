@echo off
chcp 65001 >nul
cd /d "%~dp0"
title OpenKho - Cai dat
echo ============================================
echo   OpenKho - Cai dat thu vien (lan dau)
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo Chua co Node.js. Tai ban LTS tai https://nodejs.org roi chay lai file nay.
  pause
  exit /b 1
)
rem Dung thu muc cache tren o C (o D co the khong ton tai tren may nay)
set "npm_config_cache=%LOCALAPPDATA%\npm-cache"
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo Cai dat that bai. Xem thong bao loi o tren.
  pause
  exit /b 1
)
if not exist ".env.local" copy ".env.example" ".env.local" >nul
echo.
echo Xong! Buoc tiep theo:
echo   - 2_DONG_BO_DU_LIEU.bat : lay so lieu moi nhat tu GitHub
echo   - 3_MO_WEBSITE.bat      : xem website tren may
echo   - 4_QUAN_TRI.bat        : trang quan tri (them/sua repo, danh muc)
pause
