package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"backend/parser/internal/models"
	"github.com/lib/pq"
)

var (
	ErrUserAlreadyExists = errors.New("user already exists")
	ErrUserNotFound      = errors.New("user not found")
)

func (d *DB) CreateUser(name, email, passwordHash string) (models.User, error) {
	var user models.User

	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		normalizedName = "User"
	}

	var cartRaw, wishlistRaw, historyRaw []byte
	err := d.conn.QueryRow(`
		INSERT INTO users (name, email, password_hash, avatar, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		RETURNING id, name, email, password_hash, avatar, cart, wishlist, history, bonuses, status, created_at, updated_at
	`, normalizedName, normalizedEmail, passwordHash, buildAvatar(normalizedEmail)).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Avatar,
		&cartRaw,
		&wishlistRaw,
		&historyRaw,
		&user.Bonuses,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return models.User{}, ErrUserAlreadyExists
		}
		return models.User{}, err
	}

	user.Cart = decodeStringSlice(cartRaw)
	user.Wishlist = decodeStringSlice(wishlistRaw)
	user.History = decodeStringSlice(historyRaw)
	return user, nil
}

func (d *DB) GetUserByEmail(email string) (models.User, error) {
	var user models.User
	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	var cartRaw, wishlistRaw, historyRaw []byte

	err := d.conn.QueryRow(`
		SELECT id, name, email, password_hash, avatar, cart, wishlist, history, bonuses, status, created_at, updated_at
		FROM users
		WHERE LOWER(email) = LOWER($1)
		LIMIT 1
	`, normalizedEmail).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Avatar,
		&cartRaw,
		&wishlistRaw,
		&historyRaw,
		&user.Bonuses,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.User{}, ErrUserNotFound
		}
		return models.User{}, err
	}

	user.Cart = decodeStringSlice(cartRaw)
	user.Wishlist = decodeStringSlice(wishlistRaw)
	user.History = decodeStringSlice(historyRaw)
	return user, nil
}

func buildAvatar(email string) string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return "https://i.pravatar.cc/150"
	}
	return "https://i.pravatar.cc/150?u=" + trimmed
}

func decodeStringSlice(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return out
}
