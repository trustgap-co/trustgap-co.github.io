-- When the courier collected the parcel, so the delivery estimate can count from the real pickup.
ALTER TABLE orders ADD COLUMN picked_up_at TEXT;
