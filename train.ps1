# PowerShell launcher for Deepfake Detection Fine-Tuning Pipeline
param (
    [string]$DataDir,
    [string]$TrainDir,
    [string]$ValDir,
    [int]$Epochs = 20,
    [int]$BatchSize = 32,
    [float]$Lr = 1e-4,
    [string]$Resume,
    [switch]$UnfreezeAll,
    [switch]$DummyRun,
    [switch]$Temporal
)

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "   Deepfake Detection Model Fine-Tuning Pipeline" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = $PSScriptRoot }
if (-not $scriptDir) { $scriptDir = "." }

$pythonExe = "python"
$candidatePath = Join-Path $scriptDir ".venv\Scripts\python.exe"
if (Test-Path $candidatePath) {
    $pythonExe = (Resolve-Path $candidatePath).Path
}

Write-Host "Using Python: $pythonExe" -ForegroundColor Yellow

$scriptToRun = if ($Temporal) { "train_temporal.py" } else { "train.py" }

$argsList = @()
if ($DummyRun) { $argsList += "--dummy_run" }
if ($DataDir) { $argsList += @("--data_dir", $DataDir) }
if ($TrainDir) { $argsList += @("--train_dir", $TrainDir) }
if ($ValDir) { $argsList += @("--val_dir", $ValDir) }
if ($Epochs) { $argsList += @("--epochs", $Epochs.ToString()) }
if ($BatchSize) { $argsList += @("--batch_size", $BatchSize.ToString()) }
if ($Lr) { $argsList += @("--lr", $Lr.ToString()) }
if ($Resume) { $argsList += @("--resume", $Resume) }
if ($UnfreezeAll) { $argsList += "--unfreeze_all" }

# If no specific flags passed, run interactive quick-prompt
if (-not $DummyRun -and -not $DataDir -and -not $TrainDir) {
    Write-Host ""
    Write-Host "No arguments provided. Choose an option:" -ForegroundColor White
    Write-Host "  1. Quick verification test (2 epochs with synthetic data)" -ForegroundColor White
    Write-Host "  2. Train on ./data directory" -ForegroundColor White
    Write-Host "  3. Resume training from ./checkpoints/best_model.pth" -ForegroundColor White
    Write-Host ""
    $choice = Read-Host "Enter option (1-3) [default: 1]"
    if ($choice -eq "2") {
        $argsList += @("--data_dir", "./data", "--epochs", "20", "--batch_size", "32")
    } elseif ($choice -eq "3") {
        $argsList += @("--data_dir", "./data", "--resume", "./checkpoints/best_model.pth", "--epochs", "15")
    } else {
        $argsList += @("--dummy_run", "--epochs", "2")
    }
}

Write-Host "Executing: & `"$pythonExe`" $scriptToRun $($argsList -join ' ')" -ForegroundColor DarkGray
& $pythonExe $scriptToRun @argsList
