@echo off
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
timeout /t 1 /nobreak >nul
start "" http://localhost:8791/
