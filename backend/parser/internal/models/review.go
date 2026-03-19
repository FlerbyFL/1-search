package models

type Review struct {
	ID           int64   `db:"id"`
	ProductID    int64   `db:"product_id"`
	ExternalID   string  `db:"external_id"`
	Author       string  `db:"author"`
	Rating       float64 `db:"rating"`
	Date         string  `db:"review_date"`
	Title        string  `db:"title"`
	Content      string  `db:"content"`
	Verified     bool    `db:"verified"`
	HelpfulCount int     `db:"helpful_count"`
	Source       string  `db:"source"`
}
