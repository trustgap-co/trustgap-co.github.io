-- The Customer Relations Admin: one team member with near-admin access (staff.role = 'cr_admin').
-- At most one active at a time.
CREATE UNIQUE INDEX IF NOT EXISTS staff_one_cr_admin ON staff(role) WHERE role = 'cr_admin' AND disabled_at IS NULL;
