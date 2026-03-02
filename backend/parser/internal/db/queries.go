package db

import (
	"fmt"
	"strings"

	"backend/parser/internal/models"
)

type ProductFilter struct {
	Category string
	Brand    string
	Shop     string
	MinPrice float64
	MaxPrice float64
	Page     int
	Limit    int
}

type CategoryInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func (d *DB) GetProducts(f ProductFilter) ([]models.Product, int, error) {
	where := []string{"1=1"}
	args := []interface{}{}
	n := 1

	if f.Category != "" {
		where = append(where, fmt.Sprintf("LOWER(name) LIKE LOWER($%d)", n))
		args = append(args, "%"+f.Category+"%")
		n++
	}
	if f.Brand != "" {
		where = append(where, fmt.Sprintf("LOWER(brand) = LOWER($%d)", n))
		args = append(args, f.Brand)
		n++
	}
	if f.Shop != "" {
		where = append(where, fmt.Sprintf("shop = $%d", n))
		args = append(args, f.Shop)
		n++
	}
	if f.MinPrice > 0 {
		where = append(where, fmt.Sprintf("price >= $%d", n))
		args = append(args, f.MinPrice)
		n++
	}
	if f.MaxPrice > 0 {
		where = append(where, fmt.Sprintf("price <= $%d", n))
		args = append(args, f.MaxPrice)
		n++
	}

	whereStr := strings.Join(where, " AND ")

	// Count total
	var total int
	countQ := fmt.Sprintf("SELECT COUNT(*) FROM products WHERE %s", whereStr)
	if err := d.conn.QueryRow(countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Fetch page
	offset := (f.Page - 1) * f.Limit
	args = append(args, f.Limit, offset)
	query := fmt.Sprintf(`
		SELECT p.id, p.external_id, p.name, p.price, p.old_price, p.currency, p.shop, p.url, p.brand, p.in_stock, p.created_at, p.updated_at, COALESCE(pi.url, '') AS image_url
		FROM products p
		LEFT JOIN LATERAL (
			SELECT url
			FROM product_images
			WHERE product_id = p.id
			ORDER BY is_primary DESC, sort_order ASC, id ASC
			LIMIT 1
		) pi ON TRUE
		WHERE %s
		ORDER BY p.price ASC
		LIMIT $%d OFFSET $%d
	`, whereStr, n, n+1)

	products, err := d.scanProducts(query, args...)
	return products, total, err
}

func (d *DB) SearchProducts(q string, limit int) ([]models.Product, error) {
	query := `
		SELECT p.id, p.external_id, p.name, p.price, p.old_price, p.currency, p.shop, p.url, p.brand, p.in_stock, p.created_at, p.updated_at, COALESCE(pi.url, '') AS image_url
		FROM products p
		LEFT JOIN LATERAL (
			SELECT url
			FROM product_images
			WHERE product_id = p.id
			ORDER BY is_primary DESC, sort_order ASC, id ASC
			LIMIT 1
		) pi ON TRUE
		WHERE LOWER(p.name) LIKE LOWER($1) OR LOWER(p.brand) LIKE LOWER($1)
		ORDER BY p.price ASC
		LIMIT $2
	`
	return d.scanProducts(query, "%"+q+"%", limit)
}

func (d *DB) GetCategories() ([]CategoryInfo, error) {
	query := `
		SELECT category, COUNT(*) AS count FROM (
			SELECT CASE
				WHEN LOWER(name) LIKE '%ноутбук%' THEN 'Ноутбуки'
				WHEN LOWER(name) LIKE '%смартфон%' OR LOWER(name) LIKE '%телефон%' THEN 'Смартфоны'
				WHEN LOWER(name) LIKE '%телевизор%' THEN 'Телевизоры'
				WHEN LOWER(name) LIKE '%планшет%' THEN 'Планшеты'
				WHEN LOWER(name) LIKE '%процессор%' THEN 'Процессоры'
				WHEN LOWER(name) LIKE '%видеокарт%' THEN 'Видеокарты'
				ELSE 'Другое'
			END AS category
			FROM products
		) sub
		GROUP BY category
		ORDER BY count DESC
	`
	rows, err := d.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CategoryInfo
	for rows.Next() {
		var c CategoryInfo
		if err := rows.Scan(&c.Name, &c.Count); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, nil
}

func (d *DB) scanProducts(query string, args ...interface{}) ([]models.Product, error) {
	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		err := rows.Scan(
			&p.ID, &p.ExternalID, &p.Name, &p.Price, &p.OldPrice,
			&p.Currency, &p.Shop, &p.URL, &p.Brand, &p.InStock,
			&p.CreatedAt, &p.UpdatedAt, &p.ImageURL,
		)
		if err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, nil
}
