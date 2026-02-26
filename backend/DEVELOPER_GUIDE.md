# Developer Guide - 1Search Backend

## 📂 Структура проекта

```
backend/
├── parser.go              # Основной파서с HTTP обработчиками
├── database.go            # Инициализация и управление БД
├── repository.go          # DAL слой (все операции с БД)
├── utils.go              # Вспомогательные функции
├── maintenance.go         # Функции обслуживания БД
├── Dockerfile            # Docker образ для Go приложения
├── go.mod                # Модули Go
├── go.sum               # Хеши модулей
├── .env.example          # Пример конфигурации
├── setup.bat            # Скрипт для Windows
├── setup.sh             # Скрипт для Unix/Linux/Mac
├── README_GO.md          # Полная документация
└── IMPLEMENTATION.md     # Описание реализации
```

## 🏗️ Архитектура

```
┌─────────────────────────────────────────┐
│         HTTP Layer (parser.go)          │
│  ┌──────────────────────────────────┐  │
│  │ handleSearch()                   │  │
│  │ handleParseAll()                 │  │
│  │ handleStats()                    │  │
│  └──────────────────────────────────┘  │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│  Business Logic Layer (parser.go)       │
│  ┌──────────────────────────────────┐  │
│  │ scrapeAllStoresAndSave()         │  │
│  │ searchGeneralAndSave()           │  │
│  │ searchWildberries()              │  │
│  └──────────────────────────────────┘  │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│  Data Access Layer (repository.go)      │
│  ┌──────────────────────────────────┐  │
│  │ SaveProducts()                   │  │
│  │ GetProductsByName()              │  │
│  │ GetCheapestProducts()            │  │
│  │ [+ 9 other database functions]   │  │
│  └──────────────────────────────────┘  │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴─────────┐
        │  PostgreSQL 16   │
        │  ┌─────────────┐ │
        │  │  products   │ │
        │  │  price_hisory│ │
        │  │  parsing_st. │ │
        │  └─────────────┘ │
        └──────────────────┘
```

## 🔧 Как добавить новый магазин

### 1. Добавьте в scrapeAllStoresAndSave()

```go
// 7. New Store
go func() {
    log.Println("🔍 Parsing New Store...")
    products := searchGeneralAndSave("New Store", "https://newstore.com/search?q=")
    resultsChan <- products
}()
```

### 2. Реализуйте поиск (выберите метод)

**Вариант 1: Использовать searchGeneral() (рекомендуется)**
```go
searchGeneralAndSave("New Store", "https://newstore.com/search?q=")
```

**Вариант 2: Добавить специфичный парсер**
```go
func searchNewStore(query string) []Product {
    // Ваша логика здесь
    return products
}
```

### 3. Обновите инициализацию парсинга

В `database.go`:
```go
shops := []string{"Store1", "Store2", ..., "New Store"}
```

## 📚 Основные функции

### Парсинг и сохранение

```go
// Сохранить один товар
SaveProduct(Product{
    Name: "iPhone 15",
    Price: 99999,
    ShopName: "Wildberries",
    // ...
})

// Сохранить много товаров (быстрее)
SaveProducts([]Product{...})
```

### Поиск продуктов

```go
// Основной поиск по названию
products, err := GetProductsByName("смартфон", 20)

// По магазину
products, err := GetProductsByShop("Wildberries", 50)

// Самые дешевые
products, err := GetCheapestProducts("ноутбук", 10)

// По названию и магазину
products, err := GetProductsByNameAndShop("смартфон", "Ozon")
```

### Управление данными

```go
// Удалить товары старше 7 дней
DeleteOldProducts(7)

// Очистить товары одного магазина
ClearProductsByShop("DNS")

// Обновить статус парсинга
UpdateParsingStatus("Wildberries", 250)

// Получить общую статистику
count, _ := GetProductCount()
count, _ := GetProductCountByShop("Wildberries")
shops, _ := GetAvailableShops()
```

### Обслуживание БД

```go
// Вывести статистику
PrintDatabaseStats()

// Оптимизировать БД
OptimizeDatabase()

// Экспортировать JSON
json := ExportProductsToJSON("WHERE shop_name = 'WB'")
```

## 🔍 Отладка

### Логирование

```go
log.Println("🔄 Starting parse...")  // Information
log.Printf("Error: %v", err)         // Error
log.Println("✓ Parse complete")      // Success
```

### Проверка подключения к БД

```bash
# Windows
psql -h localhost -U postgres -d e_catalog

# Проверка таблиц
\dt

# Проверка индексов
\di

# Количество товаров
SELECT COUNT(*) FROM products;
```

### Проверка API

```bash
# Поиск
curl "http://localhost:8080/api/search?q=смартфон"

# Статистика
curl http://localhost:8080/api/stats

# Парсинг (нужен токен)
curl -H "X-Parse-Token: token123" http://localhost:8080/api/parse-all
```

## 🧪 Тестирование

### Unit тесты для парсера

```go
func TestSearchWildberries(t *testing.T) {
    products := searchWildberriesSingle("смартфон")
    if len(products) == 0 {
        t.Error("Expected products from Wildberries")
    }
}
```

### Интеграционные тесты

```go
func TestDatabaseAndParsing(t *testing.T) {
    // Инициализируем БД
    InitDB()
    defer CloseDB()
    
    // Тестируем сохранение
    product := Product{Name: "Test", Price: 100, ShopName: "Test"}
    SaveProduct(product)
    
    // Тестируем поиск
    results, _ := GetProductsByName("Test", 10)
    if len(results) == 0 {
        t.Error("Product not found after save")
    }
}
```

## 📊 Оптимизация производительности

### 1. Индексирование

Убедитесь, что индексы созданы:
```sql
EXPLAIN ANALYZE
SELECT * FROM products WHERE product_name ILIKE '%смартфон%';
```

### 2. Батч операции

Используйте `SaveProducts()` вместо цикла `SaveProduct()`:
```go
// ✓ Хорошо (быстро)
SaveProducts(products)

// ✗ Плохо (медленно)
for _, p := range products {
    SaveProduct(p)
}
```

### 3. Пул соединений

Уже настроен в `database.go`:
- `SetMaxOpenConns(25)` - максимум 25 открытых соединений
- `SetMaxIdleConns(5)` - максимум 5 неиспользуемых соединений
- `SetConnMaxLifetime(5 * time.Minute)` - время жизни соединения

### 4. Кэширование

Рассмотрите добавление Redis кэша:
```go
// Не реализовано, но подумайте о:
// 1. Кэше популярных поисков
// 2. Кэше статистики (обновляется каждый час)
// 3. Кэше последних результатов парсинга
```

## 🚀 Заметки о развертывании

### Production

```bash
# Сборка оптимизированного бинарника
go build -ldflags="-s -w" -o parser

# Запуск с высокими лимитами файлов
ulimit -n 65535
./parser
```

### Мониторинг

```go
// Добавьте метрики в handleStats()
// Например, время последнего парсинга, кол-во ошибок и т.д.
```

### Резервные копии

```bash
# Полный дамп
pg_dump -h localhost -U postgres e_catalog > backup.sql

# Восстановление
psql -h localhost -U postgres e_catalog < backup.sql
```

## 🔔 Расширение функциональности

### 1. Добавить кэширование цен

```go
// price_history.go (новый файл)
func TrackPriceChange(productID int, oldPrice, newPrice float64) error {
    // Логика отслеживания изменений
}
```

### 2. Добавить WebSocket для real-time обновлений

```go
// websocket.go (новый файл)
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
    // Реализация WebSocket
}

// В main():
http.HandleFunc("/ws", handleWebSocket)
```

### 3. Добавить пагинацию для поиска

```go
// В repository.go
func GetProductsByNamePaginated(query string, page, pageSize int) ([]Product, int64, error) {
    offset := (page - 1) * pageSize
    // Логика пагинации
}
```

### 4. Добавить фильтры

```go
// Фильтр по цене
func GetProductsByPriceRange(minPrice, maxPrice float64) ([]Product, error) {
    // Логика фильтра
}

// Фильтр по доступности
func GetAvailableProducts(query string) ([]Product, error) {
    // Логика фильтра
}
```

## 📝 Checklist перед продакшеном

- [ ] Установлены все зависимости (`go mod tidy`)
- [ ] Настроены переменные окружения в `.env`
- [ ] БД инициализирована и доступна
- [ ] Все парсеры протестированы
- [ ] Индексы созданы в БД
- [ ] Настроена авторизация (PARSE_TOKEN)
- [ ] Настроены логи
- [ ] Добавлены health checks
- [ ] Настроен мониторинг
- [ ] Подготовлен план восстановления после сбоев

## 🆘 Частые вопросы

**Q: Как добавить новый тип поиска?**
A: Добавьте функцию в `repository.go` и используйте через API endpoint

**Q: Как оптимизировать медленные запросы?**
A: Используйте `EXPLAIN ANALYZE`, добавляйте индексы, кэшируйте результаты

**Q: Как масштабировать приложение?**
A: Используйте несколько инстансов Go за балансировщиком нагрузки, добавьте Redis

**Q: Как обновлять цены регулярно?**
A: Используйте `github.com/robfig/cron` для планировщика задач

## 📚 Полезные ссылки

- [PostgreSQL документация](https://www.postgresql.org/docs/)
- [Go документация](https://golang.org/doc/)
- [GitHub Colly](https://github.com/gocolly/colly) - парсинг
- [pq драйвер](https://github.com/lib/pq) - PostgreSQL для Go
