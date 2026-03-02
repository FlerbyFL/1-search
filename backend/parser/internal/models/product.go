package models

import "time"

type Product struct {
	ID          int64     `db:"id"`
	ExternalID  string    `db:"external_id"`
	Name        string    `db:"name"`
	Price       float64   `db:"price"`
	OldPrice    float64   `db:"old_price"`
	Currency    string    `db:"currency"`
	Shop        string    `db:"shop"`
	URL         string    `db:"url"`
	Category    string    `db:"category"`
	Brand       string    `db:"brand"`
	Rating      float64   `db:"rating"`
	ReviewCount int       `db:"review_count"`
	InStock     bool      `db:"in_stock"`
	CreatedAt   time.Time `db:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"`
}

type ProductImage struct {
	ID        int64     `db:"id"`
	ProductID int64     `db:"product_id"`
	URL       string    `db:"url"`
	LocalPath string    `db:"local_path"`
	IsPrimary bool      `db:"is_primary"`
	SortOrder int       `db:"sort_order"`
	CreatedAt time.Time `db:"created_at"`
}

type PriceHistory struct {
	ID        int64     `db:"id"`
	ProductID int64     `db:"product_id"`
	Price     float64   `db:"price"`
	Shop      string    `db:"shop"`
	RecordedAt time.Time `db:"recorded_at"`
}

// ParseResult is returned by each parser
type ParseResult struct {
	Product  Product
	Images   []string // image URLs
	Error    error
}

const (
	ShopMVideo     = "mvideo"
	ShopCitylink   = "citylink"
	ShopDNS        = "dns"
	ShopOzon       = "ozon"
	ShopWildberries = "wildberries"
	ShopYandexMarket = "yandexmarket"
)
