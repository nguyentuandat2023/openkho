@echo off
chcp 65001 >nul
cd /d "%~dp0"
title OpenKho - Dong bo du lieu GitHub
echo Dang lay so lieu that tu GitHub cho toan bo thu vien...
echo (Khong co GITHUB_TOKEN: mat khoang 4-5 phut; so nguoi dong gop duoc cap nhat dan theo han muc)
echo.
node scripts\sync.mjs
echo.
echo Xong. Chay 3_MO_WEBSITE.bat de xem website voi so lieu moi.
pause
