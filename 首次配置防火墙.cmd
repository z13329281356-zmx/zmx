@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 即将请求管理员权限，只放行本地子网访问 TCP 8088。
powershell -NoProfile -Command "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%CD%\设置防火墙.ps1""'"
echo.
echo 配置完成。按任意键关闭窗口。
pause >nul
