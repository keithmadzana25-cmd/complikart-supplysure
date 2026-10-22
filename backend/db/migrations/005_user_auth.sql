-- Local email/password authentication for user accounts.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (phone);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (lower(email)) WHERE email IS NOT NULL;

COMMIT;
