@echo off
title Enable ADB over WiFi - ALL CONNECTED TABLETS
color 0A

echo ==============================================
echo    Enable ADB over WiFi on ALL Tablets
echo ==============================================
echo.

set ADB_PATH=%~dp0adb\platform-tools-latest-windows\platform-tools\adb.exe

echo [STEP 1] Checking for USB-connected tablets...
echo.
%ADB_PATH% devices
echo.

echo [STEP 2] Enabling ADB over WiFi on ALL tablets...
echo.

for /f "skip=1 tokens=1" %%a in ('%ADB_PATH% devices') do (
    if not "%%a"=="" (
        if not "%%a"=="List" (
            echo Enabling on: %%a
            %ADB_PATH% -s %%a tcpip 5555
            echo [OK] Done for %%a
            echo.
        )
    )
)

echo ==============================================
echo [COMPLETE] All tablets are now ready!
echo You can disconnect USB cables now.
echo Tablets will connect automatically over WiFi.
echo ==============================================
echo.
pause