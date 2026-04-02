@echo off
title Quick ADB WiFi Setup
color 0A

set ADB_PATH=E:\tablet-manager\adb\platform-tools-latest-windows\platform-tools\adb.exe

echo ==============================================
echo    Quick ADB over WiFi Setup
echo ==============================================
echo.

:: Step 1: Enable WiFi mode on USB-connected tablet
echo [1/3] Enabling ADB over WiFi...
for /f "skip=1 tokens=1" %%a in ('%ADB_PATH% devices') do (
    if not "%%a"=="" (
        if not "%%a"=="List" (
            echo   Enabling on: %%a
            %ADB_PATH% -s %%a tcpip 5555
        )
    )
)

echo.
echo [2/3] Disconnect USB cable from tablet NOW!
echo.
pause

:: Step 2: Ask for IP
echo.
echo [3/3] Enter tablet IP address
echo   (Find in: Settings ^> About ^> Status)
echo.
set /p ip="IP Address: "

:: Step 3: Connect
%ADB_PATH% connect %ip%:5555

echo.
echo ==============================================
echo [DONE] Tablet connected!
echo ==============================================
pause