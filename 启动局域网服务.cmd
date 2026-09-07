@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AIGC 标注项目管理工具 - 局域网服务
:restart
node server.js
echo.
echo 服务意外停止，3 秒后自动重启。关闭本窗口可停止服务。
timeout /t 3 /nobreak >nul
goto restart
