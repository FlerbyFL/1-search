#!/bin/bash

# Unix/Linux/Mac setup script for Go backend

echo ""
echo "=================================="
echo "1Search Backend Setup Script"
echo "=================================="
echo ""

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "Error: Go is not installed or not in PATH"
    echo "Please install Go from https://golang.org/dl/"
    exit 1
fi

echo "✓ Go is installed"
go version

# Check if PostgreSQL is available (optional)
if ! command -v psql &> /dev/null; then
    echo "⚠ psql not found. Make sure PostgreSQL is installed and in PATH"
    echo "Note: You can still proceed if using Docker"
fi

cd "$(dirname "$0")" || exit 1

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✓ .env file created (please edit it with your settings)"
    else
        echo "Error: .env.example not found"
        exit 1
    fi
else
    echo "✓ .env file already exists"
fi

# Download Go modules
echo ""
echo "Downloading Go modules..."
if ! go mod tidy; then
    echo "Error: Failed to download modules"
    exit 1
fi
echo "✓ Modules downloaded"

# Read from .env or use defaults
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-e_catalog}

echo ""
echo "=================================="
echo "Database Setup"
echo "=================================="
echo ""
echo "Database settings:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
echo ""

read -p "Do you want to create the database now? (y/n): " SETUP_DB
if [[ "$SETUP_DB" == "y" || "$SETUP_DB" == "Y" ]]; then
    if command -v psql &> /dev/null; then
        # Source .env to get values
        export $(grep -v '^#' .env | xargs)
        
        echo "Checking database connection..."
        psql -h "$DB_HOST" -U "$DB_USER" -lqt | grep -w "$DB_NAME" > /dev/null
        
        if [ $? -eq 0 ]; then
            echo "✓ Database already exists"
        else
            echo "Creating database..."
            echo "CREATE DATABASE $DB_NAME;" | psql -h "$DB_HOST" -U "$DB_USER"
            if [ $? -eq 0 ]; then
                echo "✓ Database created successfully"
            else
                echo "Error: Failed to create database"
                echo "You may need to create it manually or check your PostgreSQL credentials"
            fi
        fi
    else
        echo "⚠ psql not found. Please create the database manually:"
        echo ""
        echo "  psql -h $DB_HOST -U $DB_USER -c \"CREATE DATABASE $DB_NAME;\""
        echo ""
    fi
fi

# Build the application
echo ""
echo "=================================="
echo "Building Application"
echo "=================================="
echo ""
echo "Building parser..."
if ! go build -o parser; then
    echo "Error: Build failed"
    exit 1
fi
echo "✓ Build successful"

# Ask if user wants to run the application
echo ""
read -p "Do you want to run the application now? (y/n): " RUN_APP
if [[ "$RUN_APP" == "y" || "$RUN_APP" == "Y" ]]; then
    echo ""
    echo "Starting application on port 8080..."
    echo "Press Ctrl+C to stop"
    echo ""
    ./parser
else
    echo ""
    echo "Setup complete! To run the application:"
    echo "  ./parser"
    echo "or"
    echo "  go run *.go"
    echo ""
fi
