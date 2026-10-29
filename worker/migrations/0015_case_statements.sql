-- Each side's account of an open case (buyer, seller, rider, courier), added after the first report.
-- One case per problem: a second person adds their side instead of opening another dispute.
CREATE TABLE IF NOT EXISTS dispute_statements (
  id INTEGER PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id),
  party TEXT NOT NULL,
  body TEXT NOT NULL,
  parcel_location TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dispute_statements_dispute ON dispute_statements(dispute_id);
-- Photos sent with a statement (NULL: photos sent with the first report).
ALTER TABLE dispute_photos ADD COLUMN statement_id INTEGER;
