package db

import (
	"fmt"
	"sort"
	"strings"

	"backend/parser/internal/models"
	"github.com/lib/pq"
)

type ProductFilter struct {
	Category    string
	Brand       string
	Shop        string
	Search      string
	MinPrice    float64
	MaxPrice    float64
	MinRating   float64
	InStock     *bool
	HasDiscount *bool
	SortBy      string
	SortOrder   string
	Page        int
	Limit       int
}

type CategoryInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func (d *DB) GetProducts(f ProductFilter) ([]models.Product, int, error) {
	where := []string{"1=1"}
	args := []interface{}{}
	n := 1

	if f.Search != "" {
		where = append(where, fmt.Sprintf("LOWER(p.name) LIKE LOWER($%d)", n))
		args = append(args, "%"+f.Search+"%")
		n++
	}

	if f.Category != "" {
		if canonical := canonicalCategory(f.Category); canonical != "" {
			where = append(where, fmt.Sprintf("(LOWER(p.category) = $%d OR LOWER(p.name) LIKE ANY($%d))", n, n+1))
			args = append(args, canonical, pq.Array(categoryNamePatterns(canonical)))
			n += 2
		} else {
			where = append(where, fmt.Sprintf("(LOWER(p.category) LIKE LOWER($%d) OR LOWER(p.name) LIKE LOWER($%d))", n, n))
			args = append(args, "%"+f.Category+"%")
			n++
		}
	}

	if f.Brand != "" {
		where = append(where, fmt.Sprintf("LOWER(p.brand) = LOWER($%d)", n))
		args = append(args, f.Brand)
		n++
	}
	if f.Shop != "" {
		where = append(where, fmt.Sprintf("LOWER(p.shop) = LOWER($%d)", n))
		args = append(args, f.Shop)
		n++
	}
	if f.MinPrice > 0 {
		where = append(where, fmt.Sprintf("p.price >= $%d", n))
		args = append(args, f.MinPrice)
		n++
	}
	if f.MaxPrice > 0 {
		where = append(where, fmt.Sprintf("p.price <= $%d", n))
		args = append(args, f.MaxPrice)
		n++
	}
	if f.MinRating > 0 {
		where = append(where, fmt.Sprintf("p.rating >= $%d", n))
		args = append(args, f.MinRating)
		n++
	}
	if f.InStock != nil {
		where = append(where, fmt.Sprintf("p.in_stock = $%d", n))
		args = append(args, *f.InStock)
		n++
	}
	if f.HasDiscount != nil {
		if *f.HasDiscount {
			where = append(where, "p.old_price > p.price")
		} else {
			where = append(where, "p.old_price <= p.price")
		}
	}

	whereStr := strings.Join(where, " AND ")

	var total int
	countQ := fmt.Sprintf("SELECT COUNT(*) FROM products p WHERE %s", whereStr)
	if err := d.conn.QueryRow(countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	orderBy := "p.price ASC"
	sortBy := strings.ToLower(strings.TrimSpace(f.SortBy))
	sortOrder := strings.ToUpper(strings.TrimSpace(f.SortOrder))
	if sortOrder != "DESC" {
		sortOrder = "ASC"
	}
	switch sortBy {
	case "rating":
		orderBy = "p.rating " + sortOrder
	case "name":
		orderBy = "p.name " + sortOrder
	case "updated_at":
		orderBy = "p.updated_at " + sortOrder
	case "price":
		orderBy = "p.price " + sortOrder
	}

	offset := (f.Page - 1) * f.Limit
	args = append(args, f.Limit, offset)
	query := fmt.Sprintf(`
		SELECT p.id, p.external_id, p.name, p.price, p.old_price, p.currency, p.shop, p.url, p.category, p.brand, p.rating, p.review_count, p.in_stock, p.created_at, p.updated_at, COALESCE(pi.url, '') AS image_url
		FROM products p
		LEFT JOIN LATERAL (
			SELECT url
			FROM product_images
			WHERE product_id = p.id
			ORDER BY is_primary DESC, sort_order ASC, id ASC
			LIMIT 1
		) pi ON TRUE
		WHERE %s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, whereStr, orderBy, n, n+1)

	products, err := d.scanProducts(query, args...)
	return products, total, err
}

func (d *DB) SearchProducts(q string, limit int) ([]models.Product, error) {
	query := `
		SELECT p.id, p.external_id, p.name, p.price, p.old_price, p.currency, p.shop, p.url, p.category, p.brand, p.rating, p.review_count, p.in_stock, p.created_at, p.updated_at, COALESCE(pi.url, '') AS image_url
		FROM products p
		LEFT JOIN LATERAL (
			SELECT url
			FROM product_images
			WHERE product_id = p.id
			ORDER BY is_primary DESC, sort_order ASC, id ASC
			LIMIT 1
		) pi ON TRUE
		WHERE LOWER(p.name) LIKE LOWER($1)
		   OR LOWER(p.brand) LIKE LOWER($1)
		   OR LOWER(p.category) LIKE LOWER($1)
		ORDER BY p.price ASC
		LIMIT $2
	`
	return d.scanProducts(query, "%"+q+"%", limit)
}

func (d *DB) GetCategories() ([]CategoryInfo, error) {
	rows, err := d.conn.Query(`SELECT COALESCE(category, ''), COALESCE(name, '') FROM products`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for rows.Next() {
		var category, name string
		if err := rows.Scan(&category, &name); err != nil {
			return nil, err
		}

		canonical := canonicalCategory(category)
		if canonical == "" {
			canonical = canonicalCategory(name)
		}
		if canonical == "" {
			continue
		}
		counts[canonical]++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]CategoryInfo, 0, len(counts))
	for name, count := range counts {
		result = append(result, CategoryInfo{Name: name, Count: count})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Count == result[j].Count {
			return result[i].Name < result[j].Name
		}
		return result[i].Count > result[j].Count
	})
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
			&p.Currency, &p.Shop, &p.URL, &p.Category, &p.Brand, &p.Rating,
			&p.ReviewCount, &p.InStock, &p.CreatedAt, &p.UpdatedAt, &p.ImageURL,
		)
		if err != nil {
			return nil, err
		}
		products = append(products, p)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := d.attachImages(products); err != nil {
		return nil, err
	}
	if err := d.attachSpecs(products); err != nil {
		return nil, err
	}
	return products, nil
}

func (d *DB) attachImages(products []models.Product) error {
	if len(products) == 0 {
		return nil
	}

	ids := make([]int64, 0, len(products))
	for _, p := range products {
		ids = append(ids, p.ID)
	}

	rows, err := d.conn.Query(
		`SELECT product_id, url
		 FROM product_images
		 WHERE product_id = ANY($1)
		 ORDER BY product_id, is_primary DESC, sort_order ASC, id ASC`,
		pq.Array(ids),
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	imageByProduct := make(map[int64][]string, len(products))
	for rows.Next() {
		var productID int64
		var url string
		if err := rows.Scan(&productID, &url); err != nil {
			return err
		}
		url = strings.TrimSpace(url)
		if url == "" {
			continue
		}
		current := imageByProduct[productID]
		if len(current) >= 4 {
			continue
		}
		alreadyExists := false
		for _, existing := range current {
			if existing == url {
				alreadyExists = true
				break
			}
		}
		if alreadyExists {
			continue
		}
		imageByProduct[productID] = append(current, url)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for i := range products {
		images := imageByProduct[products[i].ID]
		if products[i].ImageURL != "" {
			images = prependUnique(products[i].ImageURL, images, 4)
		}
		products[i].ImageURLs = images
		if products[i].ImageURL == "" && len(images) > 0 {
			products[i].ImageURL = images[0]
		}
	}
	return nil
}

func (d *DB) attachSpecs(products []models.Product) error {
	if len(products) == 0 {
		return nil
	}

	ids := make([]int64, 0, len(products))
	for _, p := range products {
		ids = append(ids, p.ID)
	}

	rows, err := d.conn.Query(
		`SELECT product_id, spec_name, spec_value FROM product_specs WHERE product_id = ANY($1) ORDER BY id ASC`,
		pq.Array(ids),
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	specByProduct := make(map[int64]map[string]string, len(products))
	for rows.Next() {
		var productID int64
		var name, value string
		if err := rows.Scan(&productID, &name, &value); err != nil {
			return err
		}
		if _, exists := specByProduct[productID]; !exists {
			specByProduct[productID] = map[string]string{}
		}
		specByProduct[productID][name] = value
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for i := range products {
		if specs, exists := specByProduct[products[i].ID]; exists {
			products[i].Specs = specs
		} else {
			products[i].Specs = map[string]string{}
		}
	}

	return nil
}

func containsAny(text string, needles []string) bool {
	for _, needle := range needles {
		if strings.Contains(text, needle) {
			return true
		}
	}
	return false
}

func canonicalCategory(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" {
		return ""
	}

	switch value {
	case "smartphone", "laptop", "tv", "tablet", "cpu", "gpu", "headphones", "smartwatch", "camera":
		return value
	}

	switch {
	case containsAny(value, []string{"televizory", "телевизор", "tv", "qled", "oled", "android tv", "smart tv"}):
		return "tv"
	case containsAny(value, []string{"noutbuki", "ноутбук", "laptop", "notebook", "macbook"}):
		return "laptop"
	case containsAny(value, []string{"smartfony", "смартфон", "телефон", "smartphone", "mobile phone", "iphone"}):
		return "smartphone"
	case containsAny(value, []string{"planshet", "планшет", "tablet", "ipad", "galaxy tab"}):
		return "tablet"
	case containsAny(value, []string{"processory", "процессор", "cpu", "ryzen", "intel core"}):
		return "cpu"
	case containsAny(value, []string{"videokarty", "видеокарт", "gpu", "rtx", "gtx", "radeon"}):
		return "gpu"
	case containsAny(value, []string{"naushnik", "наушник", "headphone", "earbud", "airpods"}):
		return "headphones"
	case containsAny(value, []string{"smartwatch", "смарт", "часы", "watch", "amazfit", "apple watch"}):
		return "smartwatch"
	case containsAny(value, []string{"камера", "фотоаппарат", "camera", "canon", "nikon", "fujifilm"}):
		return "camera"
	default:
		return ""
	}
}
func categoryNamePatterns(canonical string) []string {
	switch canonical {
	case "smartphone":
		return []string{"%смартфон%", "%телефон%", "%smartphone%", "%iphone%"}
	case "laptop":
		return []string{"%ноутбук%", "%laptop%", "%notebook%", "%macbook%"}
	case "tv":
		return []string{"%телевизор%", "%tv%", "%oled%", "%qled%"}
	case "tablet":
		return []string{"%планшет%", "%tablet%", "%ipad%"}
	case "cpu":
		return []string{"%процессор%", "%cpu%", "%ryzen%", "%intel core%"}
	case "gpu":
		return []string{"%видеокарт%", "%gpu%", "%rtx%", "%radeon%"}
	case "headphones":
		return []string{"%наушник%", "%headphone%", "%airpods%", "%earbud%"}
	case "smartwatch":
		return []string{"%смарт%", "%часы%", "%smartwatch%", "%watch%"}
	case "camera":
		return []string{"%камера%", "%фотоаппарат%", "%camera%", "%canon%"}
	default:
		return []string{"%" + canonical + "%"}
	}
}
func prependUnique(value string, list []string, limit int) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		if len(list) > limit {
			return list[:limit]
		}
		return list
	}

	result := make([]string, 0, len(list)+1)
	result = append(result, trimmed)
	for _, item := range list {
		if item == trimmed {
			continue
		}
		result = append(result, item)
		if len(result) >= limit {
			break
		}
	}
	return result
}
