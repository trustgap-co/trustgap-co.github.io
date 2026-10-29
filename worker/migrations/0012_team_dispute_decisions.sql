-- "Decide a dispute" tasks: the admin can let a team member decide one order's dispute. Each
-- decision records who made it.
ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'general';
ALTER TABLE disputes ADD COLUMN decided_by TEXT;
