# Launch script for PowerShell
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Starting Deepfake Detection Web Application (FastAPI)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

$pythonExe = "python"
if (Test-Path "..\Ai model\.venv\Scripts\python.exe") {
    $pythonExe = "..\Ai model\.venv\Scripts\python.exe"
} elseif (Test-Path ".venv\Scripts\python.exe") {
    $pythonExe = ".venv\Scripts\python.exe"
}

Write-Host "Using Python: $pythonExe" -ForegroundColor Yellow
Write-Host "Serving on: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "API Docs:   http://127.0.0.1:8000/docs" -ForegroundColor Cyan

& $pythonExe -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
