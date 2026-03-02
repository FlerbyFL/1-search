package parsers

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
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
		ID       string  `json:"id"`
		Name     string  `json:"name"`
		Price    float64 `json:"price"`
		OldPrice float64 `json:"old_price"`
		URL      string  `json:"url"`
		Brand    string  `json:"brand"`
		Category string  `json:"category"`
		InStock  bool    `json:"in_stock"`
	}
	if err := json.Unmarshal(out, &items); err != nil {
		return nil, fmt.Errorf("output parse: %w, got: %.200s", err, string(out))
	}

	var results []models.ParseResult
	for _, item := range items {
		if item.Name == "" || item.Price <= 0 {
			continue
		}
		externalID := fmt.Sprintf("%s_%s", p.shop, item.ID)
		if item.ID == "" {
			externalID = fmt.Sprintf("%s_%s", p.shop, item.URL)
		}
		results = append(results, models.ParseResult{
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
			},
		})
	}

	p.logger.Info("Browser parsed", zap.String("shop", p.shop), zap.Int("products", len(results)))
	return results, nil
}

func (p *BrowserParser) ParseProduct(productURL string) (models.ParseResult, error) {
	return models.ParseResult{}, nil
}
