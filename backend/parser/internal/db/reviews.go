package db

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"strings"

	"backend/parser/internal/models"
)

func (d *DB) SaveProductReviews(productID int64, reviews []models.Review) error {
	if len(reviews) == 0 {
		return nil
	}

	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	stmt, err := tx.Prepare(`
		INSERT INTO product_reviews
			(product_id, external_id, author, rating, title, content, verified, helpful_count, source, review_date)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (product_id, external_id) DO UPDATE SET
			author = EXCLUDED.author,
			rating = EXCLUDED.rating,
			title = EXCLUDED.title,
			content = EXCLUDED.content,
			verified = EXCLUDED.verified,
			helpful_count = EXCLUDED.helpful_count,
			source = EXCLUDED.source,
			review_date = EXCLUDED.review_date
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, review := range reviews {
		externalID := buildReviewExternalID(productID, review)
		author := strings.TrimSpace(review.Author)
		title := strings.TrimSpace(review.Title)
		content := strings.TrimSpace(review.Content)
		source := strings.TrimSpace(review.Source)

		if _, err = stmt.Exec(
			productID,
			externalID,
			author,
			review.Rating,
			title,
			content,
			review.Verified,
			review.HelpfulCount,
			source,
			strings.TrimSpace(review.Date),
		); err != nil {
			return err
		}
	}

	if err = tx.Commit(); err != nil {
		return err
	}

	_, _ = d.conn.Exec(
		`UPDATE products SET review_count = GREATEST(review_count, $2) WHERE id = $1`,
		productID,
		len(reviews),
	)

	return nil
}

func (d *DB) GetProductReviews(productID int64, limit int, offset int) ([]models.Review, error) {
	if limit <= 0 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := d.conn.Query(
		`SELECT id, product_id, external_id, author, rating, title, content, verified, helpful_count, source, review_date
		 FROM product_reviews
		 WHERE product_id = $1
		 ORDER BY id DESC
		 LIMIT $2 OFFSET $3`,
		productID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []models.Review
	for rows.Next() {
		var r models.Review
		if err := rows.Scan(
			&r.ID,
			&r.ProductID,
			&r.ExternalID,
			&r.Author,
			&r.Rating,
			&r.Title,
			&r.Content,
			&r.Verified,
			&r.HelpfulCount,
			&r.Source,
			&r.Date,
		); err != nil {
			return nil, err
		}
		reviews = append(reviews, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return reviews, nil
}

func buildReviewExternalID(productID int64, review models.Review) string {
	external := strings.TrimSpace(review.ExternalID)
	if external != "" {
		return external
	}

	raw := fmt.Sprintf("%d|%s|%s|%s|%s|%.2f|%s",
		productID,
		strings.TrimSpace(review.Author),
		strings.TrimSpace(review.Title),
		strings.TrimSpace(review.Content),
		strings.TrimSpace(review.Date),
		review.Rating,
		strings.TrimSpace(review.Source),
	)
	sum := sha1.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}
