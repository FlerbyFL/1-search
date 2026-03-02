package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"backend/parser/internal/db"
	"backend/parser/internal/scheduler"
)

func main() {
	var (
		dbHost      = flag.String("db-host", getEnv("DB_HOST", "localhost"), "PostgreSQL host")
		dbPort      = flag.Int("db-port", getEnvInt("DB_PORT", 5431), "PostgreSQL port")
		dbUser      = flag.String("db-user", getEnv("DB_USER", "postgres"), "PostgreSQL user")
		dbPassword  = flag.String("db-password", getEnv("DB_PASSWORD", ""), "PostgreSQL password")
		dbName      = flag.String("db-name", getEnv("DB_NAME", "priceparser"), "PostgreSQL database name")
		imagesDir   = flag.String("images-dir", getEnv("IMAGES_DIR", "./images"), "Directory for product images")
		interval    = flag.Duration("interval", 6*time.Hour, "Parsing interval")
		concurrency = flag.Int("concurrency", getEnvInt("CONCURRENCY", 1), "Concurrent parsers (1 recommended for browser)")
		once        = flag.Bool("once", getEnvBool("ONCE", false), "Run once and exit")
		debug       = flag.Bool("debug", getEnvBool("DEBUG", false), "Enable debug logging")
		scriptPath  = flag.String("script", getEnv("SCRIPT_PATH", "browser.py"), "Path to browser.py")
	)
	flag.Parse()

	// Resolve script path
	if !filepath.IsAbs(*scriptPath) {
		if abs, err := filepath.Abs(*scriptPath); err == nil {
			*scriptPath = abs
		}
	}
	if _, err := os.Stat(*scriptPath); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: browser.py not found at %s\n", *scriptPath)
		os.Exit(1)
	}

	logger := newLogger(*debug)
	defer logger.Sync()

	logger.Info("Price Parser starting",
		zap.String("db_host", *dbHost),
		zap.Int("db_port", *dbPort),
		zap.String("script", *scriptPath),
		zap.Duration("interval", *interval),
	)

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

	if err := os.MkdirAll(*imagesDir, 0755); err != nil {
		logger.Fatal("Failed to create images dir", zap.Error(err))
	}

	targets := scheduler.DefaultTargets(logger, *scriptPath)
	worker := scheduler.NewWorker(database, logger, *imagesDir, *concurrency)

	if *once {
		logger.Info("Running single parse cycle")
		worker.RunAll(targets)
		logger.Info("Single parse cycle complete")
	} else {
		worker.RunScheduled(targets, *interval)
	}
}

func newLogger(debug bool) *zap.Logger {
	level := zapcore.InfoLevel
	if debug {
		level = zapcore.DebugLevel
	}
	cfg := zap.Config{
		Level:       zap.NewAtomicLevelAt(level),
		Development: debug,
		Encoding:    "console",
		EncoderConfig: zapcore.EncoderConfig{
			TimeKey:        "ts",
			LevelKey:       "level",
			NameKey:        "logger",
			CallerKey:      "caller",
			MessageKey:     "msg",
			StacktraceKey:  "stacktrace",
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.CapitalColorLevelEncoder,
			EncodeTime:     zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05"),
			EncodeDuration: zapcore.StringDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
	}
	logger, err := cfg.Build()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to init logger: %v\n", err)
		os.Exit(1)
	}
	return logger
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
