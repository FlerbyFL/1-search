package main

import (
	"context"
	"time"
)

// defaultContext возвращает контекст с таймаутом 30 секунд
func defaultContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}

// longContext возвращает контекст с таймаутом 60 секунд для больших операций
func longContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 60*time.Second)
}
