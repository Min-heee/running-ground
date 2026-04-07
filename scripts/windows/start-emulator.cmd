@echo off
setlocal

set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "EMULATOR=%SDK%\emulator\emulator.exe"
set "AVD=%~1"

if "%AVD%"=="" set "AVD=Pixel_10_Pro"

if not exist "%EMULATOR%" (
  echo Android emulator.exe not found at:
  echo %EMULATOR%
  exit /b 1
)

echo Launching Android emulator: %AVD%
start "" "%EMULATOR%" -avd %AVD%
