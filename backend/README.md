# Price Parser Backend

Этот бэкенд состоит из 3 сервисов:
- `db` (PostgreSQL 16)
- `parser` (Go worker + Python Playwright скрипт)
- `api` (Go + Gin HTTP API)

Парсер собирает товары (сейчас из Citilink), сохраняет данные в PostgreSQL, а API отдает их клиентам.

## Что реализовано

- Автомиграции БД при старте `parser`.
- Периодический парсинг категорий.
- Upsert товаров и сохранение истории цен.
- REST-эндпоинты:
- `GET /health`
- `GET /api/v1/products`
- `GET /api/v1/products/search`
- `GET /api/v1/categories`

## Быстрый старт (Docker)

Требования:
- Docker Desktop с Compose v2

Запуск:

```powershell
docker-compose up --build -d
```

Проверка контейнеров:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Проверка API:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/health
```

Остановка:

```powershell
docker-compose down
```

Остановка с удалением volume БД (полный сброс данных):

```powershell
docker-compose down -v
```

## API

Базовый URL: `http://localhost:8080`

### `GET /health`

```powershell
Invoke-RestMethod -Uri http://localhost:8080/health
```

### `GET /api/v1/products`

Параметры запроса:
- `category` (string, частичное совпадение по имени товара)
- `brand` (string, точное совпадение без учета регистра)
- `shop` (string)
- `min_price` (number)
- `max_price` (number)
- `page` (int, по умолчанию `1`)
- `limit` (int, по умолчанию `20`, максимум `100`)

Пример:

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/v1/products?shop=citilink&min_price=10000&max_price=200000&page=1&limit=5"
```

### `GET /api/v1/products/search`

Параметры запроса:
- `q` (string, обязательный)
- `limit` (int, по умолчанию `20`, максимум `100`)

Пример:

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/v1/products/search?q=iphone&limit=5"
```

### `GET /api/v1/categories`

Пример:

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/v1/categories"
```

## Формат ответа товаров

Сейчас поля товара возвращаются с именами Go-структуры (`ID`, `Name`, `Price` и т.д.), потому что в моделях нет `json`-тегов.

Пример фрагмента:

```json
{
  "data": [
    {
      "ID": 318,
      "ExternalID": "citilink_1981056",
      "Name": "Пример товара",
      "Price": 1990,
      "OldPrice": 1990,
      "Currency": "RUB",
      "Shop": "citilink",
      "URL": "https://www.citilink.ru/product/example/",
      "Category": "",
      "Brand": "EXAMPLE",
      "Rating": 0,
      "ReviewCount": 0,
      "InStock": true,
      "CreatedAt": "2026-03-02T18:57:02.504943Z",
      "UpdatedAt": "2026-03-02T20:01:27.140584Z"
    }
  ],
  "total": 53,
  "page": 1,
  "limit": 1
}
```