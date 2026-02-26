@echo off
REM Windows batch script to set up and run the Go backend
setlocal enabledelayedexpansion

echo.
echo ==================================
echo 1Search Backend Setup Script
echo ==================================
echo.

cd /d "%~dp0"

REM Check if Go is installed
go version >nul 2>&1
if errorlevel 1 (
    echo Error: Go is not installed or not in PATH
    echo Please install Go from https://golang.org/dl/
    exit /b 1
)

echo ✓ Go is installed

REM Check if PostgreSQL tools are available (optional)
where psql >nul 2>&1
if errorlevel 1 (
    echo ⚠ psql not found. Make sure PostgreSQL is installed and psql is in PATH
    echo Note: You can still proceed if using Docker
)

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo.
    echo Creating .env file...
    copy ".env.example" ".env" >nul 2>&1
    if errorlevel 1 (
        echo Error creating .env file
        exit /b 1
    )
    echo ✓ .env file created (please edit it with your settings)
) else (
    echo ✓ .env file already exists
)

REM Download Go modules
echo.
echo Downloading Go modules...
call go mod tidy
if errorlevel 1 (
    echo Error: Failed to download modules
    exit /b 1
)
echo ✓ Modules downloaded

REM Offer to test database connection
echo.
echo ==================================
echo Database Setup
echo ==================================
echo.
setlocal enabledelayedexpansion

REM Read from .env or use defaults
for /f "tokens=1,2 delims==" %%A in (.env) do (
    if "%%A"=="DB_HOST" set DB_HOST=%%B
    if "%%A"=="DB_PORT" set DB_PORT=%%B
    if "%%A"=="DB_USER" set DB_USER=%%B
    if "%%A"=="DB_PASSWORD" set DB_PASSWORD=%%B
    if "%%A"=="DB_NAME" set DB_NAME=%%B
)

REM Set defaults if not found in .env
if "!DB_HOST!"=="" set DB_HOST=localhost
if "!DB_PORT!"=="" set DB_PORT=5432
if "!DB_USER!"=="" set DB_USER=postgres
if "!DB_NAME!"=="" set DB_NAME=e_catalog

echo Database settings:
echo  Host: !DB_HOST!
echo  Port: !DB_PORT!
echo  User: !DB_USER!
echo  Database: !DB_NAME!
echo.

set /p SETUP_DB="Do you want to create the database now? (y/n): "
if /i "!SETUP_DB!"=="y" (
    if not "!DB_PASSWORD!"=="" (
        REM Try to create database if psql is available
        where psql >nul 2>&1
        if not errorlevel 1 (
            echo Creating database...
            echo Database is created automatically when the Go app first connects
            echo You need to ensure PostgreSQL is running and the user has permissions
        ) else (
            echo ⚠ psql not found. Please create the database manually:
            echo.
            echo   psql -h !DB_HOST! -U !DB_USER! -c "CREATE DATABASE !DB_NAME!;"
            echo.
        )
    )
)

REM Build the application
echo.
echo ==================================
echo Building Application
echo ==================================
echo.
echo Building parser...
call go build -o parser.exe
if errorlevel 1 (
    echo Error: Build failed
    exit /b 1
)
echo ✓ Build successful

REM Ask if user wants to run the application
echo.
set /p RUN_APP="Do you want to run the application now? (y/n): "
if /i "!RUN_APP!"=="y" (
    echo.
    echo Starting application on port 8080...
    echo Press Ctrl+C to stop
    echo.
    call parser.exe
) else (
    echo.
    echo Setup complete! To run the application:
    echo   parser.exe
    echo or
    echo   go run *.go
    echo.
)

endlocal
