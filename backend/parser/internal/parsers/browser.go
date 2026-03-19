package parsers

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"time"

	"go.uber.org/zap"

	"backend/parser/internal/models"
)

type BrowserParser struct {
	shop       string
	scriptPath string
	logger     *zap.Logger
}

func NewBrowserParser(shop, scriptPath string, logger *zap.Logger) *BrowserParser {
	return &BrowserParser{shop: shop, scriptPath: scriptPath, logger: logger}
}

func (p *BrowserParser) Name() string { return p.shop }

func (p *BrowserParser) ParseCategory(categoryURL string) ([]models.ParseResult, error) {
	python := "python"
	if runtime.GOOS != "windows" {
		python = "python3"
	}

	p.logger.Info("Browser parse start", zap.String("shop", p.shop), zap.String("url", categoryURL))
	start := time.Now()

	cmd := exec.Command(python, p.scriptPath, categoryURL)
	cmd.Env = append(cmd.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("script error: %s", string(exitErr.Stderr))
		}
		return nil, fmt.Errorf("exec: %w", err)
	}

	p.logger.Info("Browser parse done",
		zap.String("shop", p.shop),
		zap.Duration("took", time.Since(start)),
	)

	var items []struct {
		ID       string   `json:"id"`
		Name     string   `json:"name"`
		Price    float64  `json:"price"`
		OldPrice float64  `json:"old_price"`
		URL      string   `json:"url"`
		ImageURL string   `json:"image_url"`
		Images   []string `json:"images"`
		Brand    string   `json:"brand"`
		Category string   `json:"category"`
		InStock  bool     `json:"in_stock"`
		Rating   any      `json:"rating"`
		Reviews  []struct {
			ID           string `json:"id"`
			Author       string `json:"author"`
			Rating       any    `json:"rating"`
			Date         string `json:"date"`
			Title        string `json:"title"`
			Content      string `json:"content"`
			Verified     bool   `json:"verified"`
			HelpfulCount int    `json:"helpful_count"`
			Source       string `json:"source"`
		} `json:"reviews"`
		ReviewCount any `json:"review_count"`
		Specs    []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"specs"`
	}
	if err := json.Unmarshal(out, &items); err != nil {
		return nil, fmt.Errorf("output parse: %w, got: %.200s", err, string(out))
	}

	var results []models.ParseResult
	for _, item := range items {
		if item.Name == "" || item.Price < 0 {
			continue
		}
		externalID := fmt.Sprintf("%s_%s", p.shop, item.ID)
		if item.ID == "" {
			externalID = fmt.Sprintf("%s_%s", p.shop, item.URL)
		}
		parsed := models.ParseResult{
			Product: models.Product{
				ExternalID: externalID,
				Name:       item.Name,
				Price:      item.Price,
				OldPrice:   item.OldPrice,
				Currency:   "RUB",
				Shop:       p.shop,
				URL:        item.URL,
				Brand:      item.Brand,
				Category:   item.Category,
				InStock:    item.InStock,
				Specs:      map[string]string{},
			},
		}
		parsed.Product.Rating = readFloat(item.Rating)
		parsed.Product.ReviewCount = readInt(item.ReviewCount)
		for _, spec := range item.Specs {
			if spec.Name == "" || spec.Value == "" {
				continue
			}
			parsed.Product.Specs[spec.Name] = spec.Value
		}
		for _, review := range item.Reviews {
			if review.Author == "" && review.Content == "" && review.Title == "" {
				continue
			}
			source := review.Source
			if source == "" {
				source = p.shop
			}
			parsed.Reviews = append(parsed.Reviews, models.Review{
				ExternalID:   review.ID,
				Author:       review.Author,
				Rating:       readFloat(review.Rating),
				Date:         review.Date,
				Title:        review.Title,
				Content:      review.Content,
				Verified:     review.Verified,
				HelpfulCount: review.HelpfulCount,
				Source:       source,
			})
		}
		if len(item.Images) > 0 {
			parsed.Images = item.Images
		} else if item.ImageURL != "" {
			parsed.Images = []string{item.ImageURL}
		}
		results = append(results, parsed)
	}

	p.logger.Info("Browser parsed", zap.String("shop", p.shop), zap.Int("products", len(results)))
	return results, nil
}

func readFloat(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		if f, err := v.Float64(); err == nil {
			return f
		}
	case string:
		if v == "" {
			return 0
		}
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return 0
}

func readInt(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return int(i)
		}
	case string:
		if v == "" {
			return 0
		}
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return 0
}

func (p *BrowserParser) ParseProduct(productURL string) (models.ParseResult, error) {
	return models.ParseResult{}, nil
}
