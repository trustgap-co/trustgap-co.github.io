-- Referrals: each seller's invite code, who invited whom, and free deals (no TrustGap fee) earned.
ALTER TABLE sellers ADD COLUMN ref_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS sellers_ref_code ON sellers(ref_code);
ALTER TABLE sellers ADD COLUMN referred_by INTEGER;
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES sellers(id),
  referred_id INTEGER NOT NULL UNIQUE REFERENCES sellers(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, rewarded, blocked
  note TEXT,
  order_id INTEGER,
  created_at TEXT NOT NULL,
  rewarded_at TEXT
);
CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals(referrer_id, status);
CREATE TABLE IF NOT EXISTS free_deals (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  source TEXT NOT NULL, -- welcome (joined with an invite) or referral (their invite worked)
  referral_id INTEGER,
  used_on_deal_id INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS free_deals_seller ON free_deals(seller_id, expires_at);
-- The TrustGap fee a link gave away (early-access code or free deal), recorded when the order completes.
ALTER TABLE deals ADD COLUMN fee_waived INTEGER NOT NULL DEFAULT 0;
