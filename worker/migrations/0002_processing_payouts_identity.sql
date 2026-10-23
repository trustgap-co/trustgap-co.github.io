-- Payment processing line (Flutterwave's costs, passed on at cost) stored per deal.
ALTER TABLE deals ADD COLUMN processing_fee INTEGER NOT NULL DEFAULT 0;

-- Payouts: a stable reference per attempt (Flutterwave's idempotency key), the attempt number,
-- and the earliest time a payout may be sent (after the buyer's payment settles, T+1).
ALTER TABLE ledger ADD COLUMN transfer_ref TEXT;
ALTER TABLE ledger ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ledger ADD COLUMN not_before TEXT;
ALTER TABLE ledger ADD COLUMN last_error TEXT;
CREATE INDEX ledger_status ON ledger(status, not_before);
CREATE UNIQUE INDEX ledger_transfer_ref ON ledger(transfer_ref) WHERE transfer_ref IS NOT NULL;

-- Each NIN check costs money, so failed attempts are counted and capped.
ALTER TABLE sellers ADD COLUMN id_attempts INTEGER NOT NULL DEFAULT 0;
