@echo off
setlocal

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

echo Project root:
echo %ROOT%
echo.
echo 1. Opening backend in a new terminal window...
start "runningground-backend" cmd /k ""%~dp0start-backend.cmd""
echo.
echo 2. Launching Android emulator window...
call "%~dp0start-emulator.cmd" %1
echo.
echo 3. Opening Metro in a new terminal window...
start "runningground-metro" cmd /k ""%~dp0start-metro.cmd""
echo.
echo 4. After the emulator finishes booting, run this in another terminal:
echo    "%~dp0install-android-app.cmd"
