package db

import "strings"

func (d *DB) SaveProductSpecs(productID int64, specs map[string]string) error {
	if len(specs) == 0 {
		return nil
	}

	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM product_specs WHERE product_id = $1`, productID); err != nil {
		return err
	}

	for name, value := range specs {
		trimmedName := strings.TrimSpace(name)
		trimmedValue := strings.TrimSpace(value)
		if trimmedName == "" || trimmedValue == "" {
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO product_specs (product_id, spec_name, spec_value, updated_at) VALUES ($1, $2, $3, NOW())`,
			productID, trimmedName, trimmedValue,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}
