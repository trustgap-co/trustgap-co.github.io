-- How each evidence photo was taken, and what TrustGap's checks found:
--   source       'camera' (TrustGap's in-page camera, stamped) or 'upload' (chosen from the phone)
--   stamp_code   the code stamped on a camera photo; captured_at is when TrustGap issued it
--   phash        a 64-bit picture fingerprint, to spot a photo copied from the listing or reused
--   flags        JSON list of warnings for whoever decides (e.g. old photo, copy of listing photo)
ALTER TABLE dispute_photos ADD COLUMN source TEXT;
ALTER TABLE dispute_photos ADD COLUMN stamp_code TEXT;
ALTER TABLE dispute_photos ADD COLUMN captured_at TEXT;
ALTER TABLE dispute_photos ADD COLUMN phash TEXT;
ALTER TABLE dispute_photos ADD COLUMN flags TEXT;
ALTER TABLE deal_photos ADD COLUMN phash TEXT;
-- A return the seller accepted but reported as not the item that was delivered.
ALTER TABLE returns ADD COLUMN problem_at TEXT;
ALTER TABLE returns ADD COLUMN problem_note TEXT;
