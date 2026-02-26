# 1Search Backend - Price Scraper with PostgreSQL

Полнофункциональная система парсинга цен на товары со всех крупных российских интернет-магазинов с сохранением данных в PostgreSQL.

## ✨ Возможности

- **Парсинг 6 магазинов**: Wildberries, Ozon, DNS, Citilink, Yandex Market, M.Video
- **PostgreSQL база данных** для персистентного хранения товаров
- **REST API** для поиска товаров
- **Автоматизированное парсинга** с поддержкой планирования
- **Статистика и мониторинг** парсинга
- **Docker поддержка** для простого развертывания

## 🚀 Быстрый старт

### Без Docker

#### 1. Установка зависимостей Go

```bash
cd backend
go mod tidy
go mod download
```

#### 2. Настройка PostgreSQL

Создайте базу данных и пользователя:

```sql
CREATE DATABASE e_catalog;
CREATE USER postgres WITH PASSWORD 'postgres';
ALTER ROLE postgres WITH CREATEDB;
```

#### 3. Конфигурация переменных окружения

Создайте файл `.env` в папке `backend/`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=e_catalog
PARSE_TOKEN=your-secret-parse-token
```

#### 4. Запуск приложения

```bash
go run *.go
```

Сервер запустится на `http://localhost:8080`

### С Docker (рекомендуется)

```bash
# 1. Создайте .env файл в корне проекта
cp backend/.env.example .env

# 2. Отредактируйте .env если нужно
# 3. Запустите контейнеры
docker-compose up -d

# 4. Проверьте статус
docker-compose ps
```

## 📡 API Endpoints

### 1. Поиск товаров

```
GET /api/search?q=смартфон
```

**Ответ:**
```json
{
  "query": "смартфон",
  "results": [
    {
      "name": "iPhone 15 Pro",
      "price": 99999,
      "shop_name": "Wildberries",
      "url": "https://...",
      "image_url": "https://...",
      "available": true
    }
  ]
}
```

### 2. Запуск полного парсинга (требует авторизации)

```
GET /api/parse-all
Headers: X-Parse-Token: your-secret-parse-token
```

**Ответ:**
```json
{
  "duration": "45.2s",
  "results": [...],
  "total_products": 1250
}
```

### 3. Статистика товаров

```
GET /api/stats
```

**Ответ:**
```json
{
  "total_products": 5432,
  "available_shops": [
    "Wildberries",
    "Ozon",
    "DNS",
    "Citilink",
    "Yandex Market",
    "M.Video"
  ],
  "shop_statistics": {
    "Wildberries": 892,
    "Ozon": 823,
    "DNS": 745,
    "Citilink": 768,
    "Yandex Market": 701,
    "M.Video": 503
  },
  "timestamp": "2024-02-26T10:30:00Z"
}
```

### 4. Health Check

```
GET /healthz
```

## 📊 Структура базы данных

### Таблица `products`

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  product_name VARCHAR(500) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  shop_name VARCHAR(100) NOT NULL,
  product_url TEXT,
  image_url TEXT,
  available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Индексы:**
- `idx_products_shop_name` - быстрый поиск по магазину
- `idx_products_product_name` - быстрый поиск по названию товара
- `idx_products_created_at` - сортировка по времени добавления
- `idx_products_shop_product` - комбинированный индекс для поиска в магазине

### Таблица `price_history` (для отслеживания изменения цен)

```sql
CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Таблица `parsing_status` (статус последнего парсинга)

```sql
CREATE TABLE parsing_status (
  id SERIAL PRIMARY KEY,
  shop_name VARCHAR(100) UNIQUE,
  last_parsed_at TIMESTAMP,
  total_products INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);
```

## 🔧 Конфигурация

### Переменные окружения

| Переменная | По умолчанию | Описание |
|-----------|-------------|---------|
| `DB_HOST` | localhost | Хост PostgreSQL |
| `DB_PORT` | 5432 | Порт PostgreSQL |
| `DB_USER` | postgres | Пользователь БД |
| `DB_PASSWORD` | postgres | Пароль БД |
| `DB_NAME` | e_catalog | Название БД |
| `PARSE_TOKEN` | - | Токен для защиты парсинга |

## 📝 Логирование

Приложение логирует все операции в консоль:

```
⚡ Features: PostgreSQL Storage, WB V5 API (Native), JSON-LD/OG extraction, CDN image mapping
📊 All data will be saved to PostgreSQL database for persistent storage
✓ Database initialized successfully
🔄 Starting full parse of all stores...
🔍 Parsing Wildberries...
🔍 Parsing Ozon...
✓ Parsing complete. Total products collected: 1250
```

## 🔍 Детали парсинга

### Wildberries
- **Метод**: Native API (WB V5)
- **Скорость**: Очень быстро
- **Надежность**: Высокая
- **Товаров за запрос**: 10

### Ozon, Citilink, Yandex Market, M.Video
- **Метод**: HTML парсинг + JSON-LD extraction
- **Альтернатива**: OpenGraph мета-теги
- **Товаров за запрос**: до 3

### DNS
- **Метод**: HTML парсинг + Python fallback (для JS-heavy страниц)
- **Скорость**: Средняя
- **Надежность**: Хорошая

## 🧪 Тестирование

### Проверка подключения к БД

```bash
curl http://localhost:8080/healthz
```

### Поиск товара

```bash
curl "http://localhost:8080/api/search?q=ноутбук"
```

### Парсинг всех магазинов

```bash
curl -H "X-Parse-Token: your-secret-token" http://localhost:8080/api/parse-all
```

### Статистика

```bash
curl http://localhost:8080/api/stats
```

## 📈 Оптимизация производительности

1. **Пул соединений**: Настроен на 25 открытых соединений
2. **Индексирование**: Все частые колонки для поиска индексированы
3. **Асинхронный парсинг**: Все магазины парсятся параллельно
4. **Таймауты**: Общий таймаут 60 сек для всего парсинга
5. **Batch insert**: Товары вставляются батчами для скорости

## 🛡️ Безопасность

- **CORS включен** для всех источников
- **Токен авторизации** для защиты парсинга
- **SQL параметризация** для всех запросов
- **User-Agent rotation** для избежания блокировок

## 🐛 Решение проблем

### Проблема: "Failed to connect to database"

**Решение:**
1. Проверьте, работает ли PostgreSQL: `psql -h localhost -U postgres`
2. Убедитесь в правильности переменных окружения в `.env`
3. Проверьте, что БД создана: `psql -h localhost -U postgres -c "SELECT 1;"`

### Проблема: "Parsing timeout"

**Решение:**
1. Увеличьте таймаут в коде (текущий: 60 сек)
2. Проверьте скорость интернета
3. Убедитесь, что магазины доступны

### Проблема: "403 Forbidden" при парсинге

**Решение:**
1. Попробуйте позже (дроссинг)
2. Смените User-Agent
3. Используйте прокси

## 📜 Лицензия

MIT

## 🤝 Поддержка

Если у вас есть вопросы или проблемы, пожалуйста, создайте issue.
