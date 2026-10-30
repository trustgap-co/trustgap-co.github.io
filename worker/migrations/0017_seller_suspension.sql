-- Suspension: why and by whom, and a history of every suspend/unsuspend. While a seller is suspended
-- their payouts wait in the ledger with status 'held' and are sent when they're unsuspended.
ALTER TABLE sellers ADD COLUMN suspend_reason TEXT;
ALTER TABLE sellers ADD COLUMN suspended_by TEXT;
CREATE TABLE IF NOT EXISTS seller_actions (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  action TEXT NOT NULL,
  reason TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seller_actions_seller ON seller_actions(seller_id);
