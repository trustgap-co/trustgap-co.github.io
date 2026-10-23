-- TrustGap schema for Cloudflare D1 (SQLite). Money is integer kobo; times are ISO-8601 UTC strings.

CREATE TABLE sellers (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  phone_verified_at TEXT,
  pickup_address TEXT,
  pickup_zone TEXT,
  payout_bank_code TEXT,
  payout_bank_name TEXT,
  payout_account_number TEXT,
  payout_account_name TEXT,
  payout_verified_at TEXT,
  id_type TEXT,
  id_last4 TEXT,
  id_verified_name TEXT,
  id_provider_ref TEXT,
  identity_verified_at TEXT,
  amount_owed INTEGER NOT NULL DEFAULT 0,
  suspended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  seller_id INTEGER REFERENCES sellers(id),
  is_admin INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE otps (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX otps_phone ON otps(phone, created_at);

CREATE TABLE deals (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  replaces_deal_id INTEGER REFERENCES deals(id),
  item_title TEXT NOT NULL,
  item_description TEXT NOT NULL,
  item_condition TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  item_price INTEGER NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_zone TEXT NOT NULL,
  delivery_zone TEXT NOT NULL,
  delivery_fee INTEGER NOT NULL,
  delivery_payer TEXT NOT NULL,
  fee_payer TEXT NOT NULL,
  platform_fee INTEGER NOT NULL,
  buyer_total INTEGER NOT NULL,
  seller_payout INTEGER NOT NULL,
  delivery_days INTEGER NOT NULL,
  inspection_hours INTEGER NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX deals_seller ON deals(seller_id, status);

CREATE TABLE checkouts (
  id TEXT PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  terms_json TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  buyer_token TEXT NOT NULL UNIQUE,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_landmark TEXT,
  refund_bank_code TEXT NOT NULL,
  refund_bank_name TEXT NOT NULL,
  refund_account_enc TEXT NOT NULL,
  refund_account_last4 TEXT NOT NULL,
  refund_account_name TEXT NOT NULL,
  terms_json TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_transition TEXT,
  tx_ref TEXT NOT NULL UNIQUE,
  provider_tx_id TEXT,
  paid_at TEXT,
  delivery_pin_enc TEXT,
  pin_attempts INTEGER NOT NULL DEFAULT 0,
  delivery_ref TEXT,
  rider_url TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'not_booked',
  packing_note TEXT,
  ship_by TEXT,
  dispatched_at TEXT,
  delivered_at TEXT,
  inspection_ends_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL
);
-- A deal can be paid for only once, however many checkout attempts it had.
CREATE UNIQUE INDEX orders_one_paid_per_deal
  ON orders(deal_id) WHERE status IN ('paid', 'shipping', 'delivered', 'disputed', 'completed', 'refunded');
CREATE INDEX orders_status ON orders(status);
CREATE INDEX orders_seller ON orders(seller_id);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX order_events_order ON order_events(order_id);

CREATE TABLE disputes (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  opened_by TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  resolution_note TEXT,
  buyer_refund INTEGER,
  seller_payout INTEGER,
  seller_charge INTEGER,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE ledger (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  counterparty TEXT,
  provider_ref TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ledger_order ON ledger(order_id);

-- Messages handed to Make.com (which sends SMS via KudiSMS and email).
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY,
  order_id INTEGER,
  event TEXT NOT NULL,
  to_phone TEXT,
  to_email TEXT,
  sms TEXT,
  email_subject TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX outbox_status ON outbox(status);

CREATE TABLE mock_transactions (
  tx_ref TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
