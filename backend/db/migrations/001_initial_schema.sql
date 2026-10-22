-- CompliKart initial schema. Apply with psql against PostgreSQL 16+.
-- Compliance events and related records must be retained for at least two years.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    fssai_license_number TEXT NOT NULL,
    license_type TEXT NOT NULL,
    turnover NUMERIC(14, 2) NOT NULL CHECK (turnover >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    ingredients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    nutritional_info_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    shelf_life_days INTEGER NOT NULL CHECK (shelf_life_days > 0),
    packaging_type TEXT NOT NULL,
    CONSTRAINT products_ingredients_array CHECK (jsonb_typeof(ingredients_json) = 'array'),
    CONSTRAINT products_nutrition_object CHECK (jsonb_typeof(nutritional_info_json) = 'object')
);

CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_code TEXT NOT NULL,
    manufacturing_date DATE NOT NULL,
    best_before_date DATE NOT NULL,
    quantity_produced NUMERIC(14, 3) NOT NULL CHECK (quantity_produced > 0),
    storage_conditions TEXT NOT NULL,
    CONSTRAINT batches_best_before_after_manufacture CHECK (best_before_date >= manufacturing_date),
    CONSTRAINT batches_product_batch_unique UNIQUE (product_id, batch_code)
);

CREATE TABLE compliance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    location_gln TEXT,
    party_gln TEXT,
    quantity NUMERIC(14, 3) CHECK (quantity IS NULL OR quantity >= 0),
    reference_document_url TEXT
);

CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label_json JSONB NOT NULL,
    qr_code_url TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INTEGER NOT NULL CHECK (version > 0),
    CONSTRAINT labels_payload_object CHECK (jsonb_typeof(label_json) = 'object'),
    CONSTRAINT labels_product_version_unique UNIQUE (product_id, version)
);

CREATE TABLE regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clause_number TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    effective_date DATE NOT NULL,
    source_url TEXT NOT NULL
);

CREATE INDEX users_fssai_license_number_idx ON users (fssai_license_number);
CREATE INDEX products_category_idx ON products (category);
CREATE INDEX batches_batch_code_idx ON batches (batch_code);
CREATE INDEX compliance_events_event_timestamp_idx ON compliance_events (event_timestamp);
CREATE INDEX compliance_events_batch_timestamp_idx ON compliance_events (batch_id, event_timestamp);
CREATE INDEX regulations_clause_number_idx ON regulations (clause_number);

COMMIT;
