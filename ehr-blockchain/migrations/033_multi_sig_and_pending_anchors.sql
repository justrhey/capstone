-- 033_multi_sig_and_pending_anchors.sql
-- Adds per-user Stellar keypair columns and pending-anchor queue columns.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stellar_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS stellar_secret_enc TEXT;

CREATE INDEX IF NOT EXISTS idx_users_stellar_pubkey ON users (stellar_pubkey)
  WHERE stellar_pubkey IS NOT NULL;

ALTER TABLE blockchain_transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','failed')),
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS pending_payload JSONB,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_blockchain_tx_status_pending
  ON blockchain_transactions (status, next_retry_at)
  WHERE status = 'pending';
