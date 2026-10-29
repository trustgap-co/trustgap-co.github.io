-- Returns to the seller. The buyer's refund waits until the seller has the item back, confirmed by
-- the seller's 4-digit return PIN (given to the rider at hand-back), the courier's own record, the
-- seller's "I've received it" button, or TrustGap staff.
--   kind 'door':   refused at the door; the same rider takes the parcel straight back.
--   kind 'pickup': a problem found after delivery; a new courier order collects it from the buyer.
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  pin_enc TEXT NOT NULL,
  pin_attempts INTEGER NOT NULL DEFAULT 0,
  courier TEXT,
  delivery_ref TEXT,
  rider_url TEXT,
  courier_status TEXT,
  cost INTEGER,
  deadline_at TEXT,
  received_at TEXT,
  received_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS returns_order ON returns(order_id);
