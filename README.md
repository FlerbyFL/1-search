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

## Быстрый старт (рекомендуемый)

### 1) Запустить backend (БД + API + parser)

```powershell
cd backend
docker compose up -d --build
```

Проверка API:

```powershell
Invoke-WebRequest http://localhost:8080/health -UseBasicParsing
```

Ожидается статус `200`.

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

## Частые проблемы

### 1) `port already in use`

Проверьте занятые порты `3000`, `8080`, `5431` и остановите конфликтующие процессы/контейнеры.

### 2) Frontend не видит backend

- убедитесь, что `http://localhost:8080/health` отвечает `200`;
- проверьте значение `VITE_API_BASE_URL` (если задавали);
- после изменения `.env.local` перезапустите `npm run dev`.

### 3) Кнопка "Перейти к магазину" ведет на 404 у старых данных Citilink

В проект уже добавлено исправление для новых и старых ссылок, но если у вас старая БД, можно принудительно обновить ссылки:

```powershell
docker exec -i priceparser_db psql -U postgres -d priceparser -c "WITH to_fix AS ( SELECT id, external_id, url, regexp_replace(url, '/+$', '') || '-' || regexp_replace(external_id, '^citilink_', '') || '/' AS new_url FROM products WHERE shop='citilink' AND external_id ~ '^citilink_[0-9]+$' AND url ~ '^https://www\\.citilink\\.ru/product/.+/$' AND regexp_replace(url, '/+$', '') !~ '-[0-9]+$' ) UPDATE products p SET url = f.new_url, updated_at = NOW() FROM to_fix f WHERE p.id = f.id;"
```

## Структура проекта

```text
1-search/
  App.tsx
  components/
  services/
  backend/
    api/
    parser/
    docker-compose.yml
```

## Production note

Текущая конфигурация ориентирована на локальную разработку. Перед production обязательно:
- вынести секреты из репозитория;
- настроить отдельные пароли и переменные окружения;
- ограничить CORS;
- добавить мониторинг и ротацию логов.
