@echo off
setlocal

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

cd /d "%ROOT%"

if not exist "node_modules" (
  echo node_modules is missing. Run npm install first.
  exit /b 1
)

echo Starting Expo dev client server from:
echo %ROOT%
call npm run start:dev-client -- -p 8089
