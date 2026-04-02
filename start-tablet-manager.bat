@echo off
title Tablet Manager Server
color 0A
echo ==============================================
echo    Tablet Manager Server v2.0
echo ==============================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "E:\tablet-manager"

where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js not found!
    pause
    exit /b
)

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

if not exist "uploads\" mkdir uploads
if not exist "public\images\" mkdir public\images

echo.
echo ==============================================
echo    Server starting...
echo    Open: http://localhost:3000
echo ==============================================
echo.

node server.js

pause