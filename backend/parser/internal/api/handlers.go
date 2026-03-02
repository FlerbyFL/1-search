package api

import (
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"backend/parser/internal/db"
)

type Handler struct {
	db     *db.DB
	logger *zap.Logger
}

func NewHandler(database *db.DB, logger *zap.Logger) *Handler {
	return &Handler{db: database, logger: logger}
}

func (h *Handler) SetupRoutes(r *gin.Engine) {
	api := r.Group("/api/v1")
	{
		api.GET("/products", h.GetProducts)
		api.GET("/products/search", h.SearchProducts)
		api.GET("/categories", h.GetCategories)
		api.GET("/images/proxy", h.ProxyImage)
	}
	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
}

// GET /api/v1/products?category=&brand=&min_price=&max_price=&page=&limit=
func (h *Handler) GetProducts(c *gin.Context) {
	filter := db.ProductFilter{
		Category: c.Query("category"),
		Brand:    c.Query("brand"),
		Shop:     c.Query("shop"),
	}

	if v := c.Query("min_price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			filter.MinPrice = f
		}
	}
	if v := c.Query("max_price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			filter.MaxPrice = f
		}
	}
	filter.Page = 1
	if v := c.Query("page"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 {
			filter.Page = i
		}
	}
	filter.Limit = 20
	if v := c.Query("limit"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 && i <= 100 {
			filter.Limit = i
		}
	}

	products, total, err := h.db.GetProducts(filter)
	if err != nil {
		h.logger.Error("GetProducts failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  products,
		"total": total,
		"page":  filter.Page,
		"limit": filter.Limit,
	})
}

// GET /api/v1/products/search?q=ноутбук&limit=20
func (h *Handler) SearchProducts(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q parameter is required"})
		return
	}

	limit := 20
	if v := c.Query("limit"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 && i <= 100 {
			limit = i
		}
	}

	products, err := h.db.SearchProducts(q, limit)
	if err != nil {
		h.logger.Error("SearchProducts failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  products,
		"total": len(products),
		"query": q,
	})
}

// GET /api/v1/categories
func (h *Handler) GetCategories(c *gin.Context) {
	categories, err := h.db.GetCategories()
	if err != nil {
		h.logger.Error("GetCategories failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": categories})
}

// GET /api/v1/images/proxy?url=https://...
func (h *Handler) ProxyImage(c *gin.Context) {
	rawURL := strings.TrimSpace(c.Query("url"))
	imageURL, err := normalizeImageURL(rawURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image url"})
		return
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, imageURL, nil)
	if err != nil {
		h.logger.Warn("ProxyImage request creation failed", zap.Error(err), zap.String("url", imageURL))
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream request failed"})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; PriceParser/1.0)")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		h.logger.Warn("ProxyImage upstream failed", zap.Error(err), zap.String("url", imageURL))
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream unavailable"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		h.logger.Warn("ProxyImage bad upstream status", zap.Int("status", resp.StatusCode), zap.String("url", imageURL))
		c.JSON(http.StatusBadGateway, gin.H{"error": "bad upstream status"})
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	c.Header("Content-Type", contentType)

	cacheControl := resp.Header.Get("Cache-Control")
	if cacheControl == "" {
		cacheControl = "public, max-age=86400"
	}
	c.Header("Cache-Control", cacheControl)
	c.Header("X-Image-Proxy", "1")
	c.Status(http.StatusOK)

	if _, err := io.Copy(c.Writer, io.LimitReader(resp.Body, 10*1024*1024)); err != nil {
		h.logger.Warn("ProxyImage stream failed", zap.Error(err), zap.String("url", imageURL))
	}
}

func normalizeImageURL(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", url.InvalidHostError("empty url")
	}
	if strings.HasPrefix(s, "//") {
		s = "https:" + s
	}

	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return "", url.InvalidHostError("invalid host")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", url.InvalidHostError("invalid scheme")
	}

	host := strings.ToLower(u.Hostname())
	if host != "citilink.ru" && !strings.HasSuffix(host, ".citilink.ru") {
		return "", url.InvalidHostError("host not allowed")
	}

	return u.String(), nil
}
