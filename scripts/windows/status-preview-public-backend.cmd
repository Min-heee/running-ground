@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0status-preview-public-backend.ps1" %*
