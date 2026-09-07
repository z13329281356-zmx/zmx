@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AIGC 标注项目管理工具 - 局域网服务
node server.js
echo.
echo 服务已停止。按任意键关闭窗口。
pause >nul
