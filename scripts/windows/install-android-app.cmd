@echo off
setlocal

set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "ADB=%SDK%\platform-tools\adb.exe"

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

if not exist "%ADB%" (
  echo adb.exe not found at:
  echo %ADB%
  exit /b 1
)

cd /d "%ROOT%"

if not exist "node_modules" (
  echo node_modules is missing. Run npm install first.
  exit /b 1
)

echo Waiting for Android emulator...
"%ADB%" wait-for-device

echo Installing and launching Android development build...
call npx expo run:android
