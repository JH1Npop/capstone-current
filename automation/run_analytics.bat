@echo off
REM Daily Analytics Generation Script for Windows Task Scheduler
REM This script runs analytics generation daily

setlocal enabledelayedexpansion

set PROJECT_ROOT=D:\Caps - Copy
set BACKEND_DIR=%PROJECT_ROOT%\backend
set VENV_PYTHON=%PROJECT_ROOT%\venv\Scripts\python.exe
set LOG_DIR=%PROJECT_ROOT%\logs
set ACTION=%1

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Generate timestamp for log file
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a-%%b)

set LOG_FILE=%LOG_DIR%\analytics_%mydate%.log

REM Set default action to daily if not specified
if "%ACTION%"=="" set ACTION=daily

echo. >> "%LOG_FILE%"
echo ==================== Analytics Generation Started ==================== >> "%LOG_FILE%"
echo Date: %date% Time: %time% >> "%LOG_FILE%"
echo Action: %ACTION% >> "%LOG_FILE%"
echo ======================================================================== >> "%LOG_FILE%"

cd /d "%BACKEND_DIR%"

if "%ACTION%"=="daily" (
    echo Running daily analytics generation... >> "%LOG_FILE%"
    %VENV_PYTHON% manage.py generate_daily_analytics >> "%LOG_FILE%" 2>&1
    echo Running technician performance generation... >> "%LOG_FILE%"
    %VENV_PYTHON% manage.py generate_technician_performance >> "%LOG_FILE%" 2>&1
) else if "%ACTION%"=="backfill" (
    echo Running backfill for last 90 days... >> "%LOG_FILE%"
    %VENV_PYTHON% manage.py generate_daily_analytics --backfill 90 >> "%LOG_FILE%" 2>&1
    %VENV_PYTHON% manage.py generate_technician_performance --backfill 90 >> "%LOG_FILE%" 2>&1
) else if "%ACTION%"=="force" (
    echo Running force regeneration... >> "%LOG_FILE%"
    %VENV_PYTHON% manage.py generate_daily_analytics --force >> "%LOG_FILE%" 2>&1
    %VENV_PYTHON% manage.py generate_technician_performance --force >> "%LOG_FILE%" 2>&1
)

if %ERRORLEVEL% equ 0 (
    echo SUCCESS: Analytics generation completed >> "%LOG_FILE%"
    echo Completed at: %date% %time% >> "%LOG_FILE%"
) else (
    echo ERROR: Analytics generation failed with code %ERRORLEVEL% >> "%LOG_FILE%"
)

echo ======================================================================== >> "%LOG_FILE%"

cd /d "%PROJECT_ROOT%"
exit /b %ERRORLEVEL%
