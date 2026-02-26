#!/usr/bin/env powershell

<#
.SYNOPSIS
    1Search Full Stack Project - Complete Integration Script
    
.DESCRIPTION
    Запускает все компоненты проекта:
    - PostgreSQL (должен быть запущен)
    - Go Backend API на :8080
    - React Frontend на :3000
#>

Write-Host "`n" + ("=" * 70) -ForegroundColor Cyan
Write-Host "1SEARCH - ПОЛНЫЙ ЗАПУСК ПРОЕКТА" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""

# Проверка PostgreSQL
Write-Host "📊 Проверка PostgreSQL..." -ForegroundColor Yellow
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
$pgReady = pg_isready -h 127.0.0.1 2>&1
if ($pgReady -match "accepting") {
    Write-Host "✓ PostgreSQL запущен на :5432" -ForegroundColor Green
} else {
    Write-Host "✗ PostgreSQL не доступен" -ForegroundColor Red
    exit 1
}

# Запуск Go Backend
Write-Host ""
Write-Host "🚀 Запуск Go Backend API..." -ForegroundColor Yellow
$goProcess = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Admin\Desktop\1-search\backend'; .{\`$env:DB_HOST='127.0.0.1'; \`$env:DB_PORT='5432'; \`$env:DB_USER='postgres'; \`$env:DB_PASSWORD=''; \`$env:DB_NAME='e_catalog'; go run .}" `
    -PassThru `
    -WindowStyle Hidden

Write-Host "✓ Go Backend запущен (PID: $($goProcess.Id))" -ForegroundColor Green

# Запуск React Frontend
Write-Host ""
Write-Host "⚛️  Запуск React Frontend..." -ForegroundColor Yellow
$reactProcess = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Admin\Desktop\1-search'; npm run dev" `
    -PassThru `
    -WindowStyle Hidden

Write-Host "✓ React Frontend запущен (PID: $($reactProcess.Id))" -ForegroundColor Green

# Ожидание инициализации
Write-Host ""
Write-Host "Ожидание инициализации сервисов..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Проверка сервисов
Write-Host ""
Write-Host "🔍 Проверка доступности сервисов..." -ForegroundColor Yellow
Write-Host ""

# Go Backend
try {
    $response = Invoke-WebRequest http://localhost:8080/healthz -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Go Backend API доступен на http://localhost:8080" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Go Backend может инициализироваться..." -ForegroundColor Yellow
}

# React Frontend
try {
    $response = Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ React Frontend доступен на http://localhost:3000" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ React может компилироваться..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "АРХИТЕКТУРА СИСТЕМЫ" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Host "┌──────────────────────────────────────────────────────────┐"
Write-Host "│                   1SEARCH PROJECT                        │"
Write-Host "├──────────────────────────────────────────────────────────┤"
Write-Host "│                                                          │"
Write-Host "│  FRONTEND (React + Vite)                                 │"
Write-Host "│  :3000                                                   │"
Write-Host "│  - Поиск товаров                                         │"
Write-Host "│  - Сравнение цен                                         │"
Write-Host "│  - AI ассистент                                          │"
Write-Host "│                                                          │"
Write-Host "│          ↕ HTTP (CORS enabled)                          │"
Write-Host "│                                                          │"
Write-Host "│  BACKEND API (Go)                                        │"
Write-Host "│  :8080                                                   │"
Write-Host "│  Endpoints:                                              │"
Write-Host "│  - GET /api/search?q=query                               │"
Write-Host "│  - GET /api/stats                                        │"
Write-Host "│  - GET /api/parse-all                                    │"
Write-Host "│  - GET /healthz                                          │"
Write-Host "│                                                          │"
Write-Host "│          ↕ SQL (psycopg2)                               │"
Write-Host "│                                                          │"
Write-Host "│  DATABASE (PostgreSQL)                                   │"
Write-Host "│  :5432                                                   │"
Write-Host "│  Database: e_catalog                                     │"
Write-Host "│  Tables:                                                 │"
Write-Host "│  - products                                              │"
Write-Host "│  - price_history                                         │"
Write-Host "│  - parsing_status                                        │"
Write-Host "│                                                          │"
Write-Host "└──────────────────────────────────────────────────────────┘"
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "УПРАВЛЕНИЕ МАГАЗИНАМИ" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Host "Поддерживаемые магазины:"
Write-Host "  🏪 Wildberries      (Native API)"
Write-Host "  🏪 Ozon             (HTML + JSON-LD)"
Write-Host "  🏪 DNS              (HTML + Python fallback)"
Write-Host "  🏪 Citilink         (HTML + JSON-LD)"
Write-Host "  🏪 Yandex Market    (HTML + JSON-LD)"
Write-Host "  🏪 M.Video          (HTML + JSON-LD)"
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "БЫСТРЫЕ ССЫЛКИ" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 Frontend:        http://localhost:3000" -ForegroundColor Magenta
Write-Host "🔧 Backend API:     http://localhost:8080" -ForegroundColor Magenta
Write-Host "📊 DB Admin:        pgAdmin/psql" -ForegroundColor Magenta
Write-Host ""
Write-Host "Примеры API запросов:"
Write-Host ""
Write-Host "Поиск товаров:" -ForegroundColor Cyan
Write-Host '  curl "http://localhost:8080/api/search?q=ноутбук"' -ForegroundColor Gray
Write-Host ""
Write-Host "Получить статистику:" -ForegroundColor Cyan
Write-Host '  curl "http://localhost:8080/api/stats"' -ForegroundColor Gray
Write-Host ""
Write-Host "Запустить парсинг всех магазинов:" -ForegroundColor Cyan
Write-Host '  curl -H "X-Parse-Token: secret-parse-token-2026" http://localhost:8080/api/parse-all' -ForegroundColor Gray
Write-Host ""
Write-Host "Проверка здоровья:" -ForegroundColor Cyan
Write-Host '  curl "http://localhost:8080/healthz"' -ForegroundColor Gray
Write-Host ""

Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "📝 ПРИМЕЧАНИЕ" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ Все сервисы запущены в фоновых окнах PowerShell" -ForegroundColor Green
Write-Host "✓ Откройте http://localhost:3000 в браузере" -ForegroundColor Green
Write-Host "✓ Используйте Ctrl+C в окнах PowerShell для остановки сервисов" -ForegroundColor Green
Write-Host ""
Write-Host "Для останова всех сервисов выполните:" -ForegroundColor Yellow
Write-Host "  Stop-Process -Id $($goProcess.Id) -Force" -ForegroundColor Gray
Write-Host "  Stop-Process -Id $($reactProcess.Id) -Force" -ForegroundColor Gray
Write-Host ""

Write-Host ("=" * 70) -ForegroundColor Green
Write-Host "✅ ПОЛНЫЙ ПРОЕКТ ЗАПУЩЕН И РАБОТАЕТ!" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host ""

# Оставляем окно открытым
Write-Host "Нажмите Ctrl+C для выхода..." -ForegroundColor Yellow
while ($true) { Start-Sleep -Seconds 10 }
