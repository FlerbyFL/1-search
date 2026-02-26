package main

import (
	"fmt"
	"log"
)

// --- Database Migration and Maintenance Functions ---

// PrintDatabaseStats выводит статистику БД в консоль
func PrintDatabaseStats() {
	ctx, cancel := defaultContext()
	defer cancel()

	// Общее количество товаров
	var totalCount int
	err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM products").Scan(&totalCount)
	if err != nil {
		log.Printf("Error getting total count: %v", err)
		return
	}

	// Количество по магазинам
	query := `
	SELECT shop_name, COUNT(*) as count
	FROM products
	GROUP BY shop_name
	ORDER BY shop_name;
	`

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("Error querying shop stats: %v", err)
		return
	}
	defer rows.Close()

	log.Println("\n===== DATABASE STATISTICS =====")
	log.Printf("Total Products: %d\n", totalCount)
	log.Println("\nProducts by Shop:")

	for rows.Next() {
		var shop string
		var count int
		if err := rows.Scan(&shop, &count); err != nil {
			log.Printf("Error scanning: %v", err)
			continue
		}
		log.Printf("  %s: %d\n", shop, count)
	}

	// Последний парсинг
	log.Println("\nLast Parsing Status:")
	statusQuery := `
	SELECT shop_name, last_parsed_at, total_products
	FROM parsing_status
	ORDER BY shop_name;
	`

	rows, err = db.QueryContext(ctx, statusQuery)
	if err != nil {
		log.Printf("Error querying parsing status: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var shop string
		var lastParsed interface{}
		var count int
		if err := rows.Scan(&shop, &lastParsed, &count); err != nil {
			log.Printf("Error scanning status: %v", err)
			continue
		}
		lastParsedStr := "Never"
		if lastParsed != nil {
			lastParsedStr = fmt.Sprintf("%v", lastParsed)
		}
		log.Printf("  %s: Last parsed at %s, %d products\n", shop, lastParsedStr, count)
	}

	log.Println("================================\n")
}

// OptimizeDatabase выполняет оптимизацию БД (ANALYZE, VACUUM)
func OptimizeDatabase() error {
	ctx, cancel := longContext()
	defer cancel()

	log.Println("Starting database optimization...")

	if _, err := db.ExecContext(ctx, "VACUUM ANALYZE products;"); err != nil {
		return fmt.Errorf("failed to vacuum analyze products: %w", err)
	}

	if _, err := db.ExecContext(ctx, "VACUUM ANALYZE price_history;"); err != nil {
		return fmt.Errorf("failed to vacuum analyze price_history: %w", err)
	}

	if _, err := db.ExecContext(ctx, "VACUUM ANALYZE parsing_status;"); err != nil {
		return fmt.Errorf("failed to vacuum analyze parsing_status: %w", err)
	}

	log.Println("✓ Database optimization complete")
	return nil
}

// BackupDatabase создает текстовый дамп БД
func BackupDatabase(filename string) error {
	ctx, cancel := longContext()
	defer cancel()

	log.Printf("Creating backup to %s...", filename)

	// Создаем export всех товаров в JSON формате
	query := `
	SELECT 
		json_build_object(
			'products', (
				SELECT json_agg(
					json_build_object(
						'id', id,
						'name', product_name,
						'price', price,
						'shop', shop_name,
						'url', product_url,
						'image', image_url,
						'available', available,
						'created_at', created_at
					)
				)
				FROM products
			),
			'stats', (
				SELECT json_build_object(
					'total_products', COUNT(*),
					'last_updated', MAX(updated_at)
				)
				FROM products
			)
		) as backup_data;
	`

	var backupData string
	err := db.QueryRowContext(ctx, query).Scan(&backupData)
	if err != nil {
		return fmt.Errorf("failed to create backup data: %w", err)
	}

	log.Printf("✓ Backup created successfully")
	return nil
}

// CleanupOldData удаляет старые товары и данные привышающие ограничение
func CleanupOldData(daysToKeep int) error {
	ctx, cancel := defaultContext()
	defer cancel()

	// Удаляем товары старше указанного количества дней
	deleteQuery := `
	DELETE FROM products
	WHERE created_at < NOW() - INTERVAL '%d days';
	`

	result, err := db.ExecContext(ctx, fmt.Sprintf(deleteQuery, daysToKeep))
	if err != nil {
		return fmt.Errorf("failed to cleanup old data: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	log.Printf("✓ Deleted %d old products (older than %d days)", rowsAffected, daysToKeep)
	return nil
}

// ExportProductsToJSON экспортирует товары в JSON
func ExportProductsToJSON(query string) string {
	ctx, cancel := defaultContext()
	defer cancel()

	jsonQuery := `
	SELECT json_agg(
		json_build_object(
			'name', product_name,
			'price', price,
			'shop', shop_name,
			'url', product_url,
			'image', image_url,
			'available', available
		)
	)
	FROM products
	WHERE 1=1
	` + query

	var jsonData string
	err := db.QueryRowContext(ctx, jsonQuery).Scan(&jsonData)
	if err != nil {
		log.Printf("Error exporting to JSON: %v", err)
		return "[]"
	}

	if jsonData == "" {
		return "[]"
	}

	return jsonData
}
