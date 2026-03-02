# 1Search

`1Search` - витрина сравнения товаров и цен:
- фронтенд: React + Vite + TypeScript;
- бэкенд: Go API + PostgreSQL;
- парсер: Go + Python Playwright (сбор данных магазинов).

## Архитектура

- `frontend` (этот корень проекта): `http://localhost:3000`
- `backend api` (Docker): `http://localhost:8080`
- `postgres` (Docker): `localhost:5431` -> контейнер `5432`
- `parser` (Docker): запущен как фоновый сервис и пишет данные в БД

## Требования

- Node.js `>=20`
- npm
- Docker Desktop (с Compose v2+)

Проверка:

```powershell
node -v
npm -v
docker --version
docker compose version
```

## Быстрый старт

### 1) Запустить backend (БД + API + parser)

```powershell
cd backend
docker compose up -d --build
```

Проверка API:

```powershell
Invoke-WebRequest http://localhost:8080/health -UseBasicParsing
```

Должно быть `200`.

### 2) Запустить frontend

В новом терминале из корня проекта:

```powershell
cd C:\Users\Admin\Desktop\1-search
npm install
npm run dev
```

### 3) Открыть сайт

- `http://localhost:3000`

## Остановка проекта

### Frontend

- Остановить в терминале через `Ctrl + C`.

### Backend

```powershell
cd backend
docker compose down
```

Если нужен полный сброс БД:

```powershell
docker compose down -v
```

## Полезные команды

### Статус контейнеров

```powershell
cd backend
docker compose ps
```

### Логи API

```powershell
cd backend
docker compose logs -f api
```

### Логи parser

```powershell
cd backend
docker compose logs -f parser
```

### Пересборка backend после изменений

```powershell
cd backend
docker compose up -d --build
```

## Настройки окружения frontend

Файл: `.env.local` (в корне проекта).

Пример:

```env
GEMINI_API_KEY=your_key_here
VITE_API_BASE_URL=http://localhost:8080
```

Примечания:
- `GEMINI_API_KEY` нужен для AI-ассистента в интерфейсе.
- если `VITE_API_BASE_URL` не задан, по умолчанию используется `http://localhost:8080`.

## API backend

Базовый URL: `http://localhost:8080`

### Health

- `GET /health`

```powershell
Invoke-RestMethod http://localhost:8080/health
```

### Поиск товаров

- `GET /api/v1/products/search?q=<query>&limit=<n>`

```powershell
Invoke-RestMethod "http://localhost:8080/api/v1/products/search?q=iphone&limit=5"
```

### Список товаров с фильтрами

- `GET /api/v1/products`
- параметры: `category`, `brand`, `shop`, `min_price`, `max_price`, `page`, `limit`

```powershell
Invoke-RestMethod "http://localhost:8080/api/v1/products?shop=citilink&page=1&limit=10"
```

### Категории

- `GET /api/v1/categories`

```powershell
Invoke-RestMethod "http://localhost:8080/api/v1/categories"
```

