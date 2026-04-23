@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-preview-postgres-read-flags.ps1" %*
