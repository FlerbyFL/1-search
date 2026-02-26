package main

import (
	"fmt"
	"log"
	"time"
)

// SaveProduct сохраняет или обновляет товар в БД
func SaveProduct(p Product) error {
	ctx, cancel := defaultContext()
	defer cancel()

	query := `
	INSERT INTO products (product_name, price, shop_name, product_url, image_url, available, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	ON CONFLICT DO NOTHING;
	`

	_, err := db.ExecContext(ctx, query,
		p.Name,
		p.Price,
		p.ShopName,
		p.URL,
		p.ImageURL,
		p.Available,
	)

	if err != nil {
		return fmt.Errorf("failed to save product: %w", err)
	}

	return nil
}

// SaveProducts сохраняет сразу несколько товаров в БД (более эффективно)
func SaveProducts(products []Product) error {
	if len(products) == 0 {
		return nil
	}

	ctx, cancel := longContext()
	defer cancel()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
	INSERT INTO products (product_name, price, shop_name, product_url, image_url, available, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	ON CONFLICT DO NOTHING;
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, p := range products {
		_, err := stmt.ExecContext(ctx, p.Name, p.Price, p.ShopName, p.URL, p.ImageURL, p.Available)
		if err != nil {
			log.Printf("Warning: failed to save product %s from %s: %v", p.Name, p.ShopName, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// GetProductsByName ищет товары по названию (может быть частичное совпадение)
func GetProductsByName(query string, limit int) ([]Product, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	searchPattern := "%" + query + "%"
	sqlQuery := `
	SELECT product_name, price, shop_name, product_url, image_url, available
	FROM products
	WHERE product_name ILIKE $1
	ORDER BY created_at DESC
	LIMIT $2;
	`

	rows, err := db.QueryContext(ctx, sqlQuery, searchPattern, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query products: %w", err)
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.Name, &p.Price, &p.ShopName, &p.URL, &p.ImageURL, &p.Available); err != nil {
			log.Printf("Warning: failed to scan product: %v", err)
			continue
		}
		products = append(products, p)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating products: %w", err)
	}

	return products, nil
}

// GetProductsByShop получает товары определенного магазина
func GetProductsByShop(shopName string, limit int) ([]Product, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	if limit <= 0 {
		limit = 100
	}

	sqlQuery := `
	SELECT product_name, price, shop_name, product_url, image_url, available
	FROM products
	WHERE shop_name = $1
	ORDER BY created_at DESC
	LIMIT $2;
	`

	rows, err := db.QueryContext(ctx, sqlQuery, shopName, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query products by shop: %w", err)
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.Name, &p.Price, &p.ShopName, &p.URL, &p.ImageURL, &p.Available); err != nil {
			log.Printf("Warning: failed to scan product: %v", err)
			continue
		}
		products = append(products, p)
	}

	return products, nil
}

// GetProductsByNameAndShop получает товары по названию и магазину
func GetProductsByNameAndShop(productName, shopName string) ([]Product, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	searchPattern := "%" + productName + "%"
	sqlQuery := `
	SELECT product_name, price, shop_name, product_url, image_url, available
	FROM products
	WHERE product_name ILIKE $1 AND shop_name = $2
	ORDER BY price ASC;
	`

	rows, err := db.QueryContext(ctx, sqlQuery, searchPattern, shopName)
	if err != nil {
		return nil, fmt.Errorf("failed to query products: %w", err)
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.Name, &p.Price, &p.ShopName, &p.URL, &p.ImageURL, &p.Available); err != nil {
			log.Printf("Warning: failed to scan product: %v", err)
			continue
		}
		products = append(products, p)
	}

	return products, nil
}

// DeleteOldProducts удаляет товары старше указанного количества дней
func DeleteOldProducts(daysOld int) (int64, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	deleteTime := time.Now().AddDate(0, 0, -daysOld)
	query := `
	DELETE FROM products
	WHERE created_at < $1;
	`

	result, err := db.ExecContext(ctx, query, deleteTime)
	if err != nil {
		return 0, fmt.Errorf("failed to delete old products: %w", err)
	}

	return result.RowsAffected()
}

// ClearProductsByShop удаляет все товары определенного магазина перед новым парсингом
func ClearProductsByShop(shopName string) error {
	ctx, cancel := defaultContext()
	defer cancel()

	query := `
	DELETE FROM products
	WHERE shop_name = $1;
	`

	_, err := db.ExecContext(ctx, query, shopName)
	if err != nil {
		return fmt.Errorf("failed to clear products for shop %s: %w", shopName, err)
	}

	return nil
}

// UpdateParsingStatus обновляет статус последнего парсинга магазина
func UpdateParsingStatus(shopName string, productCount int) error {
	ctx, cancel := defaultContext()
	defer cancel()

	query := `
	UPDATE parsing_status
	SET last_parsed_at = NOW(), total_products = $1
	WHERE shop_name = $2;
	`

	_, err := db.ExecContext(ctx, query, productCount, shopName)
	if err != nil {
		return fmt.Errorf("failed to update parsing status: %w", err)
	}

	return nil
}

// GetProductCount получает общее количество товаров в БД
func GetProductCount() (int, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	var count int
	err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM products").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get product count: %w", err)
	}

	return count, nil
}

// GetProductCountByShop получает количество товаров конкретного магазина
func GetProductCountByShop(shopName string) (int, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	var count int
	query := `SELECT COUNT(*) FROM products WHERE shop_name = $1;`
	err := db.QueryRowContext(ctx, query, shopName).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get product count for shop: %w", err)
	}

	return count, nil
}

// GetAvailableShops получает список всех магазинов в БД
func GetAvailableShops() ([]string, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	query := `
	SELECT DISTINCT shop_name
	FROM products
	ORDER BY shop_name;
	`

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get available shops: %w", err)
	}
	defer rows.Close()

	var shops []string
	for rows.Next() {
		var shop string
		if err := rows.Scan(&shop); err != nil {
			log.Printf("Warning: failed to scan shop: %v", err)
			continue
		}
		shops = append(shops, shop)
	}

	return shops, nil
}

// GetCheapestProducts получает самые дешевые товары по названию из всех магазинов
func GetCheapestProducts(productName string, limit int) ([]Product, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	if limit <= 0 {
		limit = 10
	}

	searchPattern := "%" + productName + "%"
	query := `
	SELECT product_name, price, shop_name, product_url, image_url, available
	FROM products
	WHERE product_name ILIKE $1
	ORDER BY price ASC
	LIMIT $2;
	`

	rows, err := db.QueryContext(ctx, query, searchPattern, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get cheapest products: %w", err)
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.Name, &p.Price, &p.ShopName, &p.URL, &p.ImageURL, &p.Available); err != nil {
			log.Printf("Warning: failed to scan product: %v", err)
			continue
		}
		products = append(products, p)
	}

	return products, nil
}
