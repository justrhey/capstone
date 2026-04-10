CREATE TABLE blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash VARCHAR(255) NOT NULL UNIQUE,
    contract_id VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    payload TEXT,
    block_number BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blockchain_transactions_tx_hash ON blockchain_transactions(tx_hash);
CREATE INDEX idx_blockchain_transactions_action_type ON blockchain_transactions(action_type);