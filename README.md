# 1Search

1Search — витрина сравнения цен и товаров. Фронтенд на React + Vite + TypeScript, backend на Go + Gin, база на PostgreSQL, парсер на Go + Python Playwright (сейчас реализован Citilink).

**Обзор**
- Поиск товаров по названию и по категориям.
- Фильтры по цене, бренду, магазину, рейтингу, наличию и скидкам.
- Группировка предложений по одному товару и сравнение цен.
- История цен (таблица `price_history`).
- Отзывы (таблица `product_reviews`).
- Профиль пользователя: регистрация, логин, корзина, избранное, история, аватар.
- AI-ассистент с рекомендациями на базе Gemini (при наличии ключа).

**Стек**
- Frontend: React 19, Vite 6, TypeScript.
- Backend API: Go 1.21+ (Gin), REST.
- Parser: Go scheduler + Python 3.11 Playwright.
- Database: PostgreSQL 16.

**Архитектура**
```text
Browser (http://localhost:3000)
  -> Frontend (Vite/React)
  -> API (Go/Gin) http://localhost:8081 (host) -> :8080 (container)
  -> PostgreSQL http://localhost:5431 (host) -> :5432 (container)
  <- Images via /api/v1/images/proxy (Citilink only)

Parser (Go + Python Playwright)
  -> PostgreSQL (upsert products, price_history, product_images, product_specs, product_reviews)
```

**Порты**
- Frontend (Vite): `3000`.
- Backend API (Docker): `8081` на хосте, `8080` внутри контейнера.
- PostgreSQL (Docker): `5431` на хосте, `5432` внутри контейнера.

**Структура репозитория**
- `backend/` — Go API + Go parser + Docker для backend.
- `components/` — UI-компоненты.
- `services/` — клиентские сервисы для API и AI.
- `App.tsx` — корневая логика UI.
- `types.ts` — типы фронтенда.
- `start-full-project.ps1` — устаревший скрипт запуска, не отражает текущие порты.
- `docker-compose.yml` — устаревший compose, ссылается на отсутствующий `pars-python`.

**Требования**
- Node.js `>=20` и npm.
- Docker Desktop (для backend в контейнерах).
- Go `>=1.21` и Python `>=3.11` нужны только для локального запуска backend без Docker.

**Быстрый старт**
1. Backend (Docker, рекомендуется):
```powershell
cd backend
docker compose up -d --build
```
Проверка API:
```powershell
Invoke-WebRequest http://localhost:8081/health -UseBasicParsing
```
Ожидается статус `200` и `{"status":"ok"}`.

2. Frontend:
```powershell
cd C:\Users\Admin\Desktop\1-search
npm install
npm run dev
```

3. Открыть в браузере `http://localhost:3000`.

Если API запущен не на `8081`, задайте `VITE_API_BASE_URL` в `.env.local` и перезапустите Vite.

**Переменные окружения (Frontend)**
Файл: `.env.local` в корне проекта.

```env
GEMINI_API_KEY=your_key_here
VITE_API_BASE_URL=http://localhost:8081
```

- `GEMINI_API_KEY` нужен для AI-ассистента (Google GenAI).
- `VITE_API_BASE_URL` — базовый URL API. По умолчанию `http://localhost:8081`.

**Переменные окружения (Backend API)**
Используются в `backend/parser/apiserver/server.go`.

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `DB_HOST` | `localhost` | Хост PostgreSQL. |
| `DB_PORT` | `5431` | Порт PostgreSQL на хосте. |
| `DB_USER` | `postgres` | Пользователь БД. |
| `DB_PASSWORD` | пусто | Пароль БД. |
| `DB_NAME` | `priceparser` | Имя базы. |
| `PORT` | `8080` | Порт API сервера. |
| `DEBUG` | `false` | Расширенное логирование. |
| `AVATAR_DIR` | `storage/avatars` | Папка для аватаров. |

**Переменные окружения (Parser)**
Используются в `backend/parser/cmd/main.go` и `backend/parser/browser.py`.

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `DB_HOST` | `localhost` | Хост PostgreSQL. |
| `DB_PORT` | `5431` | Порт PostgreSQL на хосте. |
| `DB_USER` | `postgres` | Пользователь БД. |
| `DB_PASSWORD` | пусто | Пароль БД. |
| `DB_NAME` | `priceparser` | Имя базы. |
| `IMAGES_DIR` | `./images` | Каталог для скачанных картинок. |
| `CONCURRENCY` | `1` | Количество одновременных парсеров. |
| `ONCE` | `false` | Запустить один цикл и завершить. |
| `DEBUG` | `false` | Подробные логи. |
| `SCRIPT_PATH` | `browser.py` | Путь к Playwright-скрипту. |
| `CITILINK_SPACE` | пусто | Пространство Citilink (по умолчанию `msk_cl`). |
| `CITILINK_CITY` | пусто | Город для подбора `space`.
| `CITILINK_CITY_REGION` | пусто | Регион для уточнения города.
| `CITILINK_REVIEWS_PRODUCTS` | `30` | Сколько товаров дополнять отзывами.
| `CITILINK_REVIEWS_LIMIT` | `10` | Лимит отзывов на товар.

**API**
Базовый URL (Docker): `http://localhost:8081`.

`GET /health`
- Проверка живости API.

`GET /api/v1/products`
- Фильтрация, сортировка и пагинация.

Параметры запроса:
| Параметр | Тип | Описание | По умолчанию |
| --- | --- | --- | --- |
| `category` | string | Категория или часть названия. | — |
| `brand` | string | Точный бренд (без учета регистра). | — |
| `shop` | string | Магазин (например `citilink`). | — |
| `q` | string | Поисковая строка по названию. | — |
| `min_price` | number | Минимальная цена. | — |
| `max_price` | number | Максимальная цена. | — |
| `min_rating` | number | Минимальный рейтинг. | — |
| `in_stock` | boolean | Только в наличии. | — |
| `has_discount` | boolean | Только со скидкой. | — |
| `sort_by` | string | `price`, `rating`, `name`, `updated_at`. | `price` |
| `sort_order` | string | `asc` или `desc`. | `asc` |
| `page` | int | Страница. | `1` |
| `limit` | int | Лимит (1..100). | `20` |

Пример:
```powershell
Invoke-RestMethod "http://localhost:8081/api/v1/products?category=smartphone&min_price=10000&max_price=90000&sort_by=rating&sort_order=desc&page=1&limit=10"
```

`GET /api/v1/products/search`
- Быстрый поиск по строке.

Параметры:
| Параметр | Тип | Описание | По умолчанию |
| --- | --- | --- | --- |
| `q` | string | Строка поиска (обязательный). | — |
| `limit` | int | Лимит (1..100). | `20` |

Пример:
```powershell
Invoke-RestMethod "http://localhost:8081/api/v1/products/search?q=iphone&limit=5"
```

`GET /api/v1/categories`
- Возвращает список канонических категорий и количество товаров в каждой.

Пример:
```powershell
Invoke-RestMethod "http://localhost:8081/api/v1/categories"
```

`GET /api/v1/products/:id/reviews`
- Отзывы товара.

Параметры:
| Параметр | Тип | Описание | По умолчанию |
| --- | --- | --- | --- |
| `limit` | int | Лимит (1..1000). | `200` |
| `offset` | int | Смещение. | `0` |

Пример:
```powershell
Invoke-RestMethod "http://localhost:8081/api/v1/products/123/reviews?limit=20"
```

`GET /api/v1/images/proxy?url=<image_url>`
- Прокси для картинок Citilink. Разрешены только домены `citilink.ru` и поддомены.

`POST /api/v1/auth/register`
- Регистрация пользователя.

Тело запроса:
```json
{ "name": "Ivan", "email": "ivan@example.com", "password": "secret123" }
```

`POST /api/v1/auth/login`
- Вход пользователя.

Тело запроса:
```json
{ "email": "ivan@example.com", "password": "secret123" }
```

`GET /api/v1/users/:id`
`PATCH /api/v1/users/:id`
`PATCH /api/v1/users/:id/profile`
`POST /api/v1/users/:id/avatar`
- Профиль пользователя. Идентификатор можно передавать как `u-<id>` или числом (backend удалит префикс `u-`).

**Формат товара в ответах**
Ответы формируются из Go-структур, поэтому используются поля в стиле `ID`, `Name`, `Price`. Исключения:
- `image_urls` — массив URLs (json tag).
- `Specs` — карта характеристик.

Пример (укороченно):
```json
{
  "data": [
    {
      "ID": 1,
      "ExternalID": "citilink_123",
      "Name": "Example",
      "Price": 19990,
      "OldPrice": 21990,
      "Currency": "RUB",
      "Shop": "citilink",
      "URL": "https://www.citilink.ru/product/example-123/",
      "Category": "smartphone",
      "Brand": "Xiaomi",
      "Rating": 4.6,
      "ReviewCount": 12,
      "InStock": true,
      "ImageURL": "https://...",
      "image_urls": ["https://..."],
      "Specs": { "Экран": "6.5\"" }
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

**База данных**
Миграции запускаются автоматически при старте API и парсера (`backend/parser/internal/db/db.go`).

Основные таблицы:
- `products` — товары.
- `product_images` — изображения (до 4 на товар).
- `price_history` — история цен.
- `product_specs` — характеристики.
- `product_reviews` — отзывы.
- `users` — пользователи.

**Парсер**
Сейчас реализован парсер Citilink. Источник URL-ов — `backend/parser/internal/scheduler/scheduler.go`.

Категории по умолчанию:
- `https://www.citilink.ru/catalog/smartfony/`
- `https://www.citilink.ru/catalog/noutbuki/`
- `https://www.citilink.ru/catalog/televizory/`
- `https://www.citilink.ru/catalog/planshetnyj-kompyuter-i-aksessuary/planshety/`
- `https://www.citilink.ru/catalog/processory/`
- `https://www.citilink.ru/catalog/videokarty/`
- `https://www.citilink.ru/catalog/naushniki/`

Запуск одного цикла в контейнере:
```powershell
cd backend
docker compose exec parser /app/parser -once
```

Запуск Playwright-скрипта вручную:
```powershell
python backend\parser\browser.py "https://www.citilink.ru/catalog/smartfony/"
```

**Логи и диагностика**
- Статус контейнеров:
```powershell
cd backend
docker compose ps
```
- Логи API:
```powershell
cd backend
docker compose logs -f api
```
- Логи парсера:
```powershell
cd backend
docker compose logs -f parser
```

**Частые проблемы**
- Пустые результаты поиска: проверьте, что парсер отработал и в БД есть товары.
- API недоступен: убедитесь, что контейнер `api` запущен и порт `8081` свободен.
- Картинки не отображаются: `/api/v1/images/proxy` разрешает только `citilink.ru`.
- AI-ассистент отвечает, что нет ключа: задайте `GEMINI_API_KEY` и перезапустите Vite.

**Дополнительно**
- `backend/README.md` содержит backend-специфику и переменные окружения.
- `start-full-project.ps1` и корневой `docker-compose.yml` считаются устаревшими и могут не работать.

