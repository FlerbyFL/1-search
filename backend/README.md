# Backend (API + Parser)

Backend состоит из трех сервисов:
- `db` — PostgreSQL 16.
- `api` — Go + Gin (REST API).
- `parser` — Go scheduler + Python Playwright (Citilink).

**Порты**
- API: `8081` на хосте, `8080` внутри контейнера.
- PostgreSQL: `5431` на хосте, `5432` внутри контейнера.

**Запуск через Docker (рекомендуется)**
```powershell
cd backend
docker compose up -d --build
```

Проверка API:
```powershell
Invoke-WebRequest http://localhost:8081/health -UseBasicParsing
```

Остановка:
```powershell
cd backend
docker compose down
```

Полный сброс БД:
```powershell
cd backend
docker compose down -v
```

**Переменные окружения (API)**
Используются в `parser/apiserver/server.go`.

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `DB_HOST` | `localhost` | Хост PostgreSQL. |
| `DB_PORT` | `5431` | Порт PostgreSQL на хосте. |
| `DB_USER` | `postgres` | Пользователь БД. |
| `DB_PASSWORD` | пусто | Пароль БД. |
| `DB_NAME` | `priceparser` | Имя базы. |
| `PORT` | `8080` | Порт API сервера. |
| `DEBUG` | `false` | Подробные логи. |
| `AVATAR_DIR` | `storage/avatars` | Каталог для аватаров. |

**Переменные окружения (Parser)**
Используются в `parser/cmd/main.go` и `parser/browser.py`.

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `DB_HOST` | `localhost` | Хост PostgreSQL. |
| `DB_PORT` | `5431` | Порт PostgreSQL на хосте. |
| `DB_USER` | `postgres` | Пользователь БД. |
| `DB_PASSWORD` | пусто | Пароль БД. |
| `DB_NAME` | `priceparser` | Имя базы. |
| `IMAGES_DIR` | `./images` | Каталог для картинок. |
| `CONCURRENCY` | `1` | Одновременные парсеры. |
| `ONCE` | `false` | Один цикл и выход. |
| `DEBUG` | `false` | Подробные логи. |
| `SCRIPT_PATH` | `browser.py` | Путь к Playwright-скрипту. |
| `CITILINK_SPACE` | пусто | Пространство Citilink (по умолчанию `msk_cl`). |
| `CITILINK_CITY` | пусто | Город для подбора `space`. |
| `CITILINK_CITY_REGION` | пусто | Регион для уточнения города. |
| `CITILINK_REVIEWS_PRODUCTS` | `30` | Сколько товаров дополнять отзывами. |
| `CITILINK_REVIEWS_LIMIT` | `10` | Лимит отзывов на товар. |

**API кратко**
Базовый URL (Docker): `http://localhost:8081`.

- `GET /health`
- `GET /api/v1/products`
- `GET /api/v1/products/search`
- `GET /api/v1/categories`
- `GET /api/v1/products/:id/reviews`
- `GET /api/v1/images/proxy?url=...`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id`
- `PATCH /api/v1/users/:id/profile`
- `POST /api/v1/users/:id/avatar`

Полное описание параметров и форматов в `README.md`.

**Схема БД**
Создается автоматически при старте (`parser/internal/db/db.go`).

Таблицы:
- `products`
- `product_images`
- `price_history`
- `product_specs`
- `product_reviews`
- `users`

**Парсер**
Парсер запускается по расписанию (по умолчанию каждые 6 часов). Список категорий находится в `parser/internal/scheduler/scheduler.go`.

Запуск одного цикла в контейнере:
```powershell
cd backend
docker compose exec parser /app/parser -once
```

**Локальный запуск без Docker (опционально)**
1. Поднять PostgreSQL локально.
2. Запустить API:
```powershell
cd backend
go run ./api/cmd/api
```
3. Запустить парсер:
```powershell
cd backend
go run ./parser/cmd
```

Если API работает на `8080`, не забудьте указать `VITE_API_BASE_URL=http://localhost:8080` во фронтенде.
