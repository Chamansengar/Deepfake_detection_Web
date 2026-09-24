@echo off
title Deepfake Detection Web Application
echo ========================================================
echo Starting Deepfake Detection Web Application (FastAPI)
echo ========================================================

IF EXIST "..\Ai model\.venv\Scripts\python.exe" (
    set "PYTHON_CMD=..\Ai model\.venv\Scripts\python.exe"
) ELSE IF EXIST ".venv\Scripts\python.exe" (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
) ELSE (
    set "PYTHON_CMD=python"
)

echo Using Python: %PYTHON_CMD%
%PYTHON_CMD% -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
