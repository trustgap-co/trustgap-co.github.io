-- The seller puts the buyer's delivery address on the link (from the chat), so the delivery fee is
-- known and shown to both sides before anyone pays. The buyer confirms it read-only in step 1.
ALTER TABLE deals ADD COLUMN delivery_address TEXT;
ALTER TABLE deals ADD COLUMN delivery_landmark TEXT;
ALTER TABLE deals ADD COLUMN delivery_state TEXT;
