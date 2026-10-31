-- Revenue: delivery as TrustGap's own service (courier cost kept apart from the price charged),
-- a dispute fee paid by whoever is at fault, and a per-seller deal limit the admin can raise.
ALTER TABLE deals ADD COLUMN courier_cost INTEGER;
ALTER TABLE deals ADD COLUMN dispute_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sellers ADD COLUMN deal_limit INTEGER;
ALTER TABLE disputes ADD COLUMN fault TEXT;
ALTER TABLE disputes ADD COLUMN dispute_fee INTEGER NOT NULL DEFAULT 0;
-- The part of the fee kept from the held money (the rest, if any, was added to the seller's debt).
ALTER TABLE disputes ADD COLUMN dispute_fee_taken INTEGER NOT NULL DEFAULT 0;
