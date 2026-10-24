-- Delivery is priced per order by the courier (Fez) from the buyer's address, instead of from
-- fixed areas chosen by the seller. Links keep the pickup address/state and parcel details;
-- the final delivery fee, processing fee and seller payout are stored on the order.
ALTER TABLE deals ADD COLUMN pickup_state TEXT;
ALTER TABLE deals ADD COLUMN weight_kg INTEGER NOT NULL DEFAULT 1;
ALTER TABLE deals ADD COLUMN fragile INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sellers ADD COLUMN pickup_state TEXT;

ALTER TABLE orders ADD COLUMN delivery_state TEXT;
ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN platform_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN processing_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN seller_payout INTEGER NOT NULL DEFAULT 0;
-- Which courier carries the parcel ("manual" rider link or "fez") and the courier's own status text.
ALTER TABLE orders ADD COLUMN courier TEXT;
ALTER TABLE orders ADD COLUMN courier_status TEXT;
CREATE INDEX orders_delivery_ref ON orders(delivery_ref);
