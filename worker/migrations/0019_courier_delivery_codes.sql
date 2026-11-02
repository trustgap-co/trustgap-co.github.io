-- Fez makes its own delivery code (delivery_OTP) and texts it to the recipient at dispatch; the rider
-- can't complete delivery without it. TrustGap reads it from Fez's API and keeps it encrypted, to show
-- the buyer (delivery) or seller (return) on their private page. TrustGap's own PIN stays for your
-- own riders.
ALTER TABLE orders ADD COLUMN courier_code_enc TEXT;
ALTER TABLE returns ADD COLUMN courier_code_enc TEXT;
