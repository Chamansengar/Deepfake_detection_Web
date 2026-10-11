@echo off
title Deepfake Detection AI - Model Fine-Tuning Pipeline
echo ====================================================================
echo   Deepfake Detection Model Fine-Tuning Pipeline (InceptionResnetV1)
echo ====================================================================
echo.

IF EXIST ".venv\Scripts\python.exe" (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
) ELSE (
    set "PYTHON_CMD=python"
)

echo Using Python: "%PYTHON_CMD%"
echo.

REM If arguments were passed, forward them directly to train.py
IF NOT "%~1"=="" (
    "%PYTHON_CMD%" train.py %*
    goto end
)

echo Select Training Mode:
echo   [1] Quick Test Run (Synthetic dummy verification - 2 epochs)
echo   [2] Fine-tune on data/ folder (auto 80/20 train/val split)
echo   [3] Resume fine-tuning from checkpoints/best_model.pth
echo   [4] Custom arguments
echo.
set /p choice="Enter option (1-4) [default: 1]: "

if "%choice%"=="2" (
    set /p datapath="Enter path to dataset directory containing real/ and fake/ [default: ./data]: "
    if "%datapath%"=="" set "datapath=./data"
    "%PYTHON_CMD%" train.py --data_dir "%datapath%" --epochs 20 --batch_size 32
) else if "%choice%"=="3" (
    set /p datapath="Enter path to dataset directory [default: ./data]: "
    if "%datapath%"=="" set "datapath=./data"
    "%PYTHON_CMD%" train.py --data_dir "%datapath%" --resume ./checkpoints/best_model.pth --epochs 15 --batch_size 32
) else if "%choice%"=="4" (
    set /p customargs="Enter python train.py arguments: "
    "%PYTHON_CMD%" train.py %customargs%
) else (
    echo Running verification dry-run...
    "%PYTHON_CMD%" train.py --dummy_run --epochs 2
)

:end
echo.
echo ====================================================================
echo Training execution finished.
pause
