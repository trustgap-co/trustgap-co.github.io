import { first } from '../lib/db.js';
import { UserError } from '../lib/http.js';
import { authenticate } from './sellers.js';

// Who is using the admin pages: the admin, or the Customer Relations Admin (a team member with
// near-admin access, staff.role = 'cr_admin'). `actor` is how their actions are recorded.
export async function whoIs(ctx, request) {
  const session = await authenticate(ctx, request);
  if (!session) return null;
  if (session.is_admin) return { role: 'admin', name: 'Admin', actor: 'admin' };
  if (!session.staff_id) return null;
  const s = await first(ctx.env, 'SELECT * FROM staff WHERE id = ? AND disabled_at IS NULL', session.staff_id);
  if (!s || s.role !== 'cr_admin' || s.must_change_password) return null;
  return { role: 'cr_admin', name: s.name, staff: s, actor: `team:${s.name}` };
}

// `cr: true` routes are open to the Customer Relations Admin as well; the rest are the admin's only.
export async function requireAccess(ctx, request, { cr = false } = {}) {
  const who = await whoIs(ctx, request);
  if (!who) throw new UserError('Admin login required.', 401);
  if (who.role !== 'admin' && !cr) throw new UserError('Only the admin can do this.', 403);
  return who;
}
