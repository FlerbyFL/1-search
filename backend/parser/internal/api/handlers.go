package api

import (
	"net/http"
	"strconv"

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
