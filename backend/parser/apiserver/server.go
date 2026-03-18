package apiserver

import (
	"flag"
	"fmt"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"backend/parser/internal/api"
	"backend/parser/internal/db"
)

func Run() {
	var (
		dbHost     = flag.String("db-host", getEnv("DB_HOST", "localhost"), "PostgreSQL host")
		dbPort     = flag.Int("db-port", getEnvInt("DB_PORT", 5431), "PostgreSQL port")
		dbUser     = flag.String("db-user", getEnv("DB_USER", "postgres"), "PostgreSQL user")
		dbPassword = flag.String("db-password", getEnv("DB_PASSWORD", ""), "PostgreSQL password")
		dbName     = flag.String("db-name", getEnv("DB_NAME", "priceparser"), "PostgreSQL database name")
		port       = flag.String("port", getEnv("PORT", "8080"), "API port")
		debug      = flag.Bool("debug", getEnvBool("DEBUG", false), "Enable debug logging")
	)
	flag.Parse()

	logger := newLogger(*debug)
	defer logger.Sync()

	database, err := db.New(db.Config{
		Host:     *dbHost,
		Port:     *dbPort,
		User:     *dbUser,
		Password: *dbPassword,
		DBName:   *dbName,
		SSLMode:  "disable",
	}, logger)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		logger.Fatal("Failed to apply migrations", zap.Error(err))
	}

	avatarsDir := getEnv("AVATAR_DIR", "storage/avatars")
	if err := os.MkdirAll(avatarsDir, 0755); err != nil {
		logger.Fatal("Failed to create avatars dir", zap.Error(err))
	}

	if !*debug {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(ginLogger(logger))

	handler := api.NewHandler(database, logger, avatarsDir)
	handler.SetupRoutes(r)
	r.Static("/api/v1/avatars", avatarsDir)

	addr := ":" + *port
	logger.Info("API server starting", zap.String("addr", addr))
	if err := r.Run(addr); err != nil {
		logger.Fatal("Server failed", zap.Error(err))
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func ginLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		logger.Info("request",
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
		)
	}
}

func newLogger(debug bool) *zap.Logger {
	level := zapcore.InfoLevel
	if debug {
		level = zapcore.DebugLevel
	}
	cfg := zap.Config{
		Level:    zap.NewAtomicLevelAt(level),
		Encoding: "console",
		EncoderConfig: zapcore.EncoderConfig{
			TimeKey:        "ts",
			LevelKey:       "level",
			MessageKey:     "msg",
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.CapitalColorLevelEncoder,
			EncodeTime:     zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05"),
			EncodeDuration: zapcore.StringDurationEncoder,
		},
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
	}
	l, err := cfg.Build()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	return l
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
