@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Unitive Form Automation - Project Keystone Setup
echo ===================================================
echo.

:: 1. Check Python installation
echo [*] Checking Python installation...
set PYTHON_CMD=python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    if exist ".venv\Scripts\python.exe" (
        set PYTHON_CMD=.venv\Scripts\python.exe
        echo [OK] Using Python from virtual environment: .venv\Scripts\python.exe
    ) else if exist "venv\Scripts\python.exe" (
        set PYTHON_CMD=venv\Scripts\python.exe
        echo [OK] Using Python from virtual environment: venv\Scripts\python.exe
    ) else (
        echo [ERROR] Python is not installed or not in the PATH.
        echo Please install Python 3.9+ and try again.
        pause
        exit /b 1
    )
)
%PYTHON_CMD% --version

:: 2. Check Node.js installation
echo [*] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in the PATH.
    echo Please install Node.js and try again.
    pause
    exit /b 1
)
node --version

:: 3. Setup Virtual Environment
if not exist ".venv" if not exist "venv" (
    echo [*] Creating virtual environment [.venv]...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
) else (
    echo [OK] Virtual environment folder exists.
)

:: 4. Activate venv and check python dependencies
echo [*] Checking Python dependencies...
if exist ".venv" (
    call .venv\Scripts\activate
) else (
    call venv\Scripts\activate
)
python -c "import fastapi, uvicorn, pydantic, sqlalchemy, cv2, numpy, easyocr, sentence_transformers, playwright, requests, psycopg2, torch, pydantic_settings, pypdfium2, docx, pandas, openpyxl" >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Installing python dependencies [this may take a few minutes]...
    python -m pip install -r backend\requirements.txt
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install Python dependencies.
        pause
        exit /b 1
    )
    echo [*] Installing Playwright browsers...
    playwright install
    if !errorlevel! neq 0 (
        echo [WARNING] Failed to install Playwright browser dependencies.
    )
) else (
    echo [OK] Python dependencies are already installed.
)

:: 5. Setup frontend dependencies
echo [*] Checking Frontend dependencies...
if not exist "frontend\node_modules" (
    echo [*] Installing frontend npm packages [this may take a minute]...
    cd frontend
    call npm install
    cd ..
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install Node.js dependencies.
        pause
        exit /b 1
    )
) else (
    echo [OK] Node.js dependencies are already installed.
)

echo.
echo ===================================================
echo   Starting Services...
echo ===================================================
echo [*] Launching Backend Server (Uvicorn on Port 8000)...
if exist ".venv" (
    start "Unitive Backend" cmd /k "call .venv\Scripts\activate && cd backend && uvicorn app.main:app --port 8000 --reload"
) else (
    start "Unitive Backend" cmd /k "call venv\Scripts\activate && cd backend && uvicorn app.main:app --port 8000 --reload"
)

echo [*] Launching Frontend Server (Vite on Port 5173)...
start "Unitive Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo [SUCCESS] Both servers are starting up.
echo - Backend:  http://localhost:8000
echo - Frontend: http://localhost:5173
echo.
echo You can close this window now. Keep the other two windows open.
pause
