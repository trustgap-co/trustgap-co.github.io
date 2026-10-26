-- Sellers can pay a dispute charge straight away through the payment page, instead of only having it
-- taken from a later payout.
CREATE TABLE IF NOT EXISTS debt_payments (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  amount INTEGER NOT NULL,
  tx_ref TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  confirm_nonce TEXT,
  provider_tx_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
-- What each side confirmed before the deal: the seller's condition pledge (exact wording) and the time
-- the buyer accepted the change-of-mind notice (its wording is in the order's accepted terms).
ALTER TABLE deals ADD COLUMN condition_confirmed_at TEXT;
ALTER TABLE deals ADD COLUMN condition_pledge TEXT;
ALTER TABLE orders ADD COLUMN buyer_ack_at TEXT;
-- Opt-ins for TrustGap news and offers (separate from the messages needed to run a deal).
ALTER TABLE sellers ADD COLUMN marketing_opt_in_at TEXT;
ALTER TABLE orders ADD COLUMN buyer_marketing_opt_in_at TEXT;
