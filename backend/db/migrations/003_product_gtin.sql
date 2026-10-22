BEGIN;
ALTER TABLE products ADD COLUMN gtin CHAR(14);
ALTER TABLE products ADD CONSTRAINT products_gtin_format CHECK (gtin IS NULL OR gtin ~ '^[0-9]{14}$');
CREATE UNIQUE INDEX products_gtin_unique_idx ON products (gtin) WHERE gtin IS NOT NULL;
COMMIT;
