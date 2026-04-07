@echo off
setlocal

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

echo Project root:
echo %ROOT%
echo.
echo 1. Launching Android emulator window...
call "%~dp0start-emulator.cmd" %1
echo.
echo 2. Opening Metro in a new terminal window...
start "runnigapp-metro" cmd /k ""%~dp0start-metro.cmd""
echo.
echo 3. After the emulator finishes booting, run this in another terminal:
echo    "%~dp0install-android-app.cmd"
