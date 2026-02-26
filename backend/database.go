package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB
var dbMutex sync.Mutex

// InitDB инициализирует подключение к PostgreSQL и создает таблицы
func InitDB() error {
	dbMutex.Lock()
	defer dbMutex.Unlock()

	dsn := buildDSN()
	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Проверяем подключение
	ctx, cancel := defaultContext()
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// Настраиваем пул соединений
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Создаем таблицы
	if err := createTables(); err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}

	log.Println("✓ Database initialized successfully")
	return nil
}

// buildDSN строит строку подключения к PostgreSQL
func buildDSN() string {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5432"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "postgres"
	}
	password := os.Getenv("DB_PASSWORD")
	if password == "" {
		password = "postgres"
	}
	dbname := os.Getenv("DB_NAME")
	if dbname == "" {
		dbname = "e_catalog"
	}

	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname,
	)
}

// createTables создает необходимые таблицы в БД
func createTables() error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	ctx, cancel := defaultContext()
	defer cancel()

	// Таблица для хранения товаров со "снимками" цен в определенный момент времени
	createProductsTableSQL := `
	CREATE TABLE IF NOT EXISTS products (
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
	`

	// Индексы для оптимизации поисков
	createIndexesSQL := `
	CREATE INDEX IF NOT EXISTS idx_products_shop_name ON products(shop_name);
	CREATE INDEX IF NOT EXISTS idx_products_product_name ON products(product_name);
	CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
	CREATE INDEX IF NOT EXISTS idx_products_shop_product ON products(shop_name, product_name);
	`

	// Таблица для отслеживания истории цен (опционально, для аналитики)
	createPriceHistoryTableSQL := `
	CREATE TABLE IF NOT EXISTS price_history (
		id SERIAL PRIMARY KEY,
		product_id INT REFERENCES products(id) ON DELETE CASCADE,
		old_price DECIMAL(10, 2),
		new_price DECIMAL(10, 2),
		changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`

	// Таблица для отслеживания статуса последнего парсинга
	createParsingStatusTableSQL := `
	CREATE TABLE IF NOT EXISTS parsing_status (
		id SERIAL PRIMARY KEY,
		shop_name VARCHAR(100) UNIQUE,
		last_parsed_at TIMESTAMP,
		total_products INT DEFAULT 0,
		is_active BOOLEAN DEFAULT true
	);
	`

	// Выполняем все SQL запросы
	if _, err := db.ExecContext(ctx, createProductsTableSQL); err != nil {
		return fmt.Errorf("failed to create products table: %w", err)
	}

	if _, err := db.ExecContext(ctx, createIndexesSQL); err != nil {
		return fmt.Errorf("failed to create indexes: %w", err)
	}

	if _, err := db.ExecContext(ctx, createPriceHistoryTableSQL); err != nil {
		return fmt.Errorf("failed to create price_history table: %w", err)
	}

	if _, err := db.ExecContext(ctx, createParsingStatusTableSQL); err != nil {
		return fmt.Errorf("failed to create parsing_status table: %w", err)
	}

	// Инициализируем статусы для магазинов
	if err := initializeParsingStatus(); err != nil {
		return fmt.Errorf("failed to initialize parsing status: %w", err)
	}

	return nil
}

// initializeParsingStatus инициализирует таблицу со статусами парсинга
func initializeParsingStatus() error {
	ctx, cancel := defaultContext()
	defer cancel()

	shops := []string{"Wildberries", "Ozon", "DNS", "Citilink", "Yandex Market", "M.Video"}

	for _, shop := range shops {
		query := `
		INSERT INTO parsing_status (shop_name, last_parsed_at, is_active)
		VALUES ($1, NULL, true)
		ON CONFLICT (shop_name) DO NOTHING;
		`
		if _, err := db.ExecContext(ctx, query, shop); err != nil {
			log.Printf("Warning: failed to initialize status for %s: %v", shop, err)
		}
	}

	return nil
}

// CloseDB закрывает подключение к БД
func CloseDB() error {
	if db != nil {
		return db.Close()
	}
	return nil
}

// GetDB возвращает текущее подключение к БД
func GetDB() *sql.DB {
	return db
}
