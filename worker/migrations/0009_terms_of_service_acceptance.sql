-- Acceptance of the TrustGap Terms of Service (a required, unticked checkbox). Sellers accept when
-- signing up; buyers accept in step 1 of each deal (the version and time are also in the order's
-- accepted terms).
ALTER TABLE sellers ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE sellers ADD COLUMN terms_version TEXT;
ALTER TABLE orders ADD COLUMN buyer_terms_accepted_at TEXT;
