package models

import "time"

type User struct {
	ID           int64
	Name         string
	Email        string
	PasswordHash string
	Avatar       string
	Cart         []string
	Wishlist     []string
	History      []string
	Bonuses      int
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
