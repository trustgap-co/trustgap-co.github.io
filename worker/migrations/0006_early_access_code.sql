-- Early-access code: removes the TrustGap fee (1.5%) from one deal. A seller can use it on one link
-- (the whole fee is removed); a buyer can use it on one order (their share of the fee is removed).
ALTER TABLE deals ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN promo_discount INTEGER NOT NULL DEFAULT 0;
