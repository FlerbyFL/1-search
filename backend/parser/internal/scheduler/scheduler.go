package scheduler

import (
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"

	"backend/parser/internal/db"
	"backend/parser/internal/models"
	"backend/parser/internal/parsers"
)

type CategoryTarget struct {
	Parser      parsers.Parser
	CategoryURL string
}

type Worker struct {
	database    *db.DB
	logger      *zap.Logger
	imagesDir   string
	concurrency int
}

func NewWorker(database *db.DB, logger *zap.Logger, imagesDir string, concurrency int) *Worker {
	return &Worker{
		database:    database,
		logger:      logger,
		imagesDir:   imagesDir,
		concurrency: concurrency,
	}
}

func (w *Worker) RunAll(targets []CategoryTarget) {
	sem := make(chan struct{}, w.concurrency)
	var wg sync.WaitGroup

	for _, target := range targets {
		wg.Add(1)
		sem <- struct{}{}
		go func(t CategoryTarget) {
			defer wg.Done()
			defer func() { <-sem }()
			w.parseTarget(t)
		}(target)
	}

	wg.Wait()
}

func (w *Worker) parseTarget(t CategoryTarget) {
	shop := t.Parser.Name()
	w.logger.Info("Starting parse", zap.String("shop", shop), zap.String("url", t.CategoryURL))

	results, err := t.Parser.ParseCategory(t.CategoryURL)
	if err != nil {
		w.logger.Error("Parse failed", zap.String("shop", shop), zap.Error(err))
		return
	}

	saved := 0
	for _, result := range results {
		if result.Error != nil {
			continue
		}
		if result.Product.Name == "" || result.Product.Price < 0 {
			continue
		}
		productID, err := w.database.UpsertProduct(result.Product)
		if err != nil {
			w.logger.Error("DB upsert failed", zap.String("shop", shop), zap.Error(err))
			continue
		}
		if len(result.Images) > 0 {
			imgs := result.Images
			if len(imgs) > 4 {
				imgs = imgs[:4]
			}
			if err := w.database.SaveImages(productID, imgs, w.imagesDir); err != nil {
				w.logger.Warn("Save images failed", zap.Error(err))
			}
		}
		if len(result.Reviews) > 0 {
			if err := w.database.SaveProductReviews(productID, result.Reviews); err != nil {
				w.logger.Warn("Save reviews failed", zap.Error(err))
			}
		}
		saved++
	}

	w.logger.Info("Parse complete",
		zap.String("shop", shop),
		zap.Int("parsed", len(results)),
		zap.Int("saved", saved),
	)
}

func (w *Worker) RunScheduled(targets []CategoryTarget, interval time.Duration) {
	w.logger.Info("Starting scheduled parser", zap.Duration("interval", interval))
	w.RunAll(targets)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		w.logger.Info("Running scheduled parse cycle")
		w.RunAll(targets)
	}
}

// DefaultTargets — Ситилинк + PiterGSM
func DefaultTargets(logger *zap.Logger, scriptPath string) []CategoryTarget {
	cl := parsers.NewBrowserParser("citilink", scriptPath, logger)

	// Resolve pitergsm.py path relative to browser.py location
	piterGSMScript := resolveSiblingScript(scriptPath, "pitergsm.py")
	pg := parsers.NewBrowserParser("pitergsm", piterGSMScript, logger)

	return []CategoryTarget{
		// --- Citilink ---
		{Parser: cl, CategoryURL: "https://www.citilink.ru/catalog/smartfony/"},
		{Parser: cl, CategoryURL: "https://www.citilink.ru/catalog/noutbuki/"},
		{Parser: cl, CategoryURL: "https://www.citilink.ru/catalog/televizory/"},
		{Parser: cl, CategoryURL: "https://www.citilink.ru/catalog/planshetnyj-kompyuter-i-aksessuary/planshety/"},
		{Parser: cl, CategoryURL: "https://www.citilink.ru/catalog/processory/"},
		{Parser: cl, CategoryURL: "https://www.citilink.ru/catalog/videokarty/"},
		{Parser: cl, CategoryURL: "https://www.citilink.ru/catalog/naushniki/"},

		// --- PiterGSM ---
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/phones/iphone/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/phones/smartfony/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/tablets/ipad/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/tablets/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/mac/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/elektronika/smartwatch/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/elektronika/naushniki/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/elektronika/noutbuki/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/elektronika/televizory/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/elektronika/igrovye-pristavki/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/elektronika/gadzhety/"},
		{Parser: pg, CategoryURL: "https://pitergsm.ru/catalog/accessories/"},
	}
}

// resolveSiblingScript returns a path to scriptName in the same directory as basePath.
func resolveSiblingScript(basePath, scriptName string) string {
	return filepath.Join(filepath.Dir(basePath), scriptName)
}

func FindBestPrices(database *db.DB, productName string) ([]models.Product, error) {
	return database.GetProductsByName(productName)
}
