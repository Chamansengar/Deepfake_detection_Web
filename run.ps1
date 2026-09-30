# Launch script for PowerShell
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Starting Deepfake Detection Web Application (FastAPI)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = $PSScriptRoot }
if (-not $scriptDir) { $scriptDir = "." }

$pythonExe = "python"
$candidatePaths = @(
    (Join-Path $scriptDir "..\Ai model\.venv\Scripts\python.exe"),
    (Join-Path $scriptDir ".venv\Scripts\python.exe"),
    "..\Ai model\.venv\Scripts\python.exe",
    ".venv\Scripts\python.exe"
)

foreach ($path in $candidatePaths) {
    if (Test-Path $path) {
        $pythonExe = (Resolve-Path $path).Path
        break
    }
}

Write-Host "Using Python: $pythonExe" -ForegroundColor Yellow
Write-Host "Serving on: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "API Docs:   http://127.0.0.1:8000/docs" -ForegroundColor Cyan

& $pythonExe -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
