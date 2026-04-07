@echo off
setlocal

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

cd /d "%ROOT%"

if not exist "backend\src\server.mjs" (
  echo backend\src\server.mjs is missing.
  exit /b 1
)

echo Starting backend server from:
echo %ROOT%\backend
node --watch backend\src\server.mjs
