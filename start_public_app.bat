@echo off
title Deepfake Detection AI - Public Cloudflare Live Host
echo ====================================================================
echo   Starting Deepfake Detection AI Web App + Cloudflare Public Tunnel
echo ====================================================================
echo.

IF EXIST "..\Ai model\.venv\Scripts\python.exe" (
    set "PYTHON_CMD=..\Ai model\.venv\Scripts\python.exe"
) ELSE IF EXIST ".venv\Scripts\python.exe" (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
) ELSE (
    set "PYTHON_CMD=python"
)

echo [1/2] Launching Local AI Server on http://127.0.0.1:8000 ...
start "Deepfake Detection Backend" "%PYTHON_CMD%" -m uvicorn app:app --host 127.0.0.1 --port 8000

echo [2/2] Waiting 4 seconds for server initialization...
timeout /t 4 /nobreak >nul

echo.
echo ====================================================================
echo   Creating Global Public HTTPS URL (Powered by Cloudflare)
echo   Look below for your public link ending in: .trycloudflare.com
echo ====================================================================
echo.

IF EXIST "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8000
) ELSE IF EXIST "C:\Program Files\cloudflared\cloudflared.exe" (
    "C:\Program Files\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8000
) ELSE (
    cloudflared tunnel --url http://127.0.0.1:8000
)

pause
