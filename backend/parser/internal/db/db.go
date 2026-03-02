package db

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"go.uber.org/zap"

	"backend/parser/internal/models"
)

type DB struct {
	conn   *sql.DB
	logger *zap.Logger
}

type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

func New(cfg Config, logger *zap.Logger) (*DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s client_encoding=UTF8",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	conn.SetMaxOpenConns(25)
	conn.SetMaxIdleConns(5)
	conn.SetConnMaxLifetime(5 * time.Minute)

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	logger.Info("Connected to PostgreSQL", zap.String("host", cfg.Host), zap.Int("port", cfg.Port))
	return &DB{conn: conn, logger: logger}, nil
}

func (d *DB) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS products (
			id            BIGSERIAL PRIMARY KEY,
			external_id   TEXT,
			name          TEXT NOT NULL,
			price         NUMERIC(12,2) NOT NULL,
			old_price     NUMERIC(12,2) DEFAULT 0,
			currency      VARCHAR(10) DEFAULT 'RUB',
			shop          VARCHAR(50) NOT NULL,
			url           TEXT,
			category      TEXT,
			brand         TEXT,
			rating        NUMERIC(3,2) DEFAULT 0,
			review_count  INT DEFAULT 0,
			in_stock      BOOLEAN DEFAULT TRUE,
			created_at    TIMESTAMPTZ DEFAULT NOW(),
			updated_at    TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE (external_id, shop)
		)`,
		`CREATE TABLE IF NOT EXISTS product_images (
			id          BIGSERIAL PRIMARY KEY,
			product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
			url         TEXT NOT NULL,
			local_path  TEXT,
			is_primary  BOOLEAN DEFAULT FALSE,
			sort_order  INT DEFAULT 0,
			created_at  TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS price_history (
			id          BIGSERIAL PRIMARY KEY,
			product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
			price       NUMERIC(12,2) NOT NULL,
			shop        VARCHAR(50) NOT NULL,
			recorded_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector('russian', name))`,
		`CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop)`,
		`CREATE INDEX IF NOT EXISTS idx_products_price ON products(price)`,
		`CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, recorded_at DESC)`,
	}

	for _, q := range queries {
		if _, err := d.conn.Exec(q); err != nil {
			return fmt.Errorf("migrate query error: %w\nquery: %s", err, q[:min(80, len(q))])
		}
	}
	d.logger.Info("Database migrations applied successfully")
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// UpsertProduct inserts or updates a product, returns product ID
func (d *DB) UpsertProduct(p models.Product) (int64, error) {
	var id int64
	err := d.conn.QueryRow(`
		INSERT INTO products (external_id, name, price, old_price, currency, shop, url, category, brand, rating, review_count, in_stock, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
		ON CONFLICT (external_id, shop) DO UPDATE SET
			name         = EXCLUDED.name,
			price        = EXCLUDED.price,
			old_price    = EXCLUDED.old_price,
			category     = EXCLUDED.category,
			in_stock     = EXCLUDED.in_stock,
			rating       = EXCLUDED.rating,
			review_count = EXCLUDED.review_count,
			updated_at   = NOW()
		RETURNING id`,
		p.ExternalID, p.Name, p.Price, p.OldPrice, p.Currency,
		p.Shop, p.URL, p.Category, p.Brand, p.Rating, p.ReviewCount, p.InStock,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert product: %w", err)
	}

	// Record price history
	if _, err := d.conn.Exec(
		`INSERT INTO price_history (product_id, price, shop) VALUES ($1,$2,$3)`,
		id, p.Price, p.Shop,
	); err != nil {
		d.logger.Warn("Failed to record price history", zap.Error(err))
	}

	return id, nil
}

// SaveImages downloads and saves product images
func (d *DB) SaveImages(productID int64, imageURLs []string, imagesDir string) error {
	// Check if images already exist for this product
	var count int
	if err := d.conn.QueryRow(
		`SELECT COUNT(*) FROM product_images WHERE product_id=$1`, productID,
	).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil // images already saved
	}

	for i, imgURL := range imageURLs {
		if imgURL == "" {
			continue
		}
		localPath, err := downloadImage(imgURL, imagesDir, fmt.Sprintf("%d_%d", productID, i))
		if err != nil {
			d.logger.Warn("Failed to download image", zap.String("url", imgURL), zap.Error(err))
			localPath = ""
		}
		if _, err := d.conn.Exec(
			`INSERT INTO product_images (product_id, url, local_path, is_primary, sort_order) 
			 VALUES ($1,$2,$3,$4,$5)
			 ON CONFLICT DO NOTHING`,
			productID, imgURL, localPath, i == 0, i,
		); err != nil {
			d.logger.Warn("Failed to save image record", zap.Error(err))
		}
	}
	return nil
}

func downloadImage(url, dir, filename string) (string, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	ext := ".jpg"
	if strings.Contains(url, ".png") {
		ext = ".png"
	} else if strings.Contains(url, ".webp") {
		ext = ".webp"
	}

	localPath := filepath.Join(dir, filename+ext)
	if _, err := os.Stat(localPath); err == nil {
		return localPath, nil // already exists
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; PriceParser/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	f, err := os.Create(localPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return "", err
	}
	return localPath, nil
}

func (d *DB) Close() {
	d.conn.Close()
}

// GetProductsByName finds products across all shops by name for comparison
func (d *DB) GetProductsByName(name string) ([]models.Product, error) {
	rows, err := d.conn.Query(`
		SELECT id, external_id, name, price, old_price, currency, shop, url, 
		       COALESCE(category,''), COALESCE(brand,''), rating, review_count, in_stock
		FROM products 
		WHERE to_tsvector('russian', name) @@ plainto_tsquery('russian', $1)
		ORDER BY price ASC`, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(&p.ID, &p.ExternalID, &p.Name, &p.Price, &p.OldPrice,
			&p.Currency, &p.Shop, &p.URL, &p.Category, &p.Brand,
			&p.Rating, &p.ReviewCount, &p.InStock); err != nil {
			continue
		}
		products = append(products, p)
	}
	return products, nil
}
