import { first } from '../lib/db.js';
import { UserError } from '../lib/http.js';
import { authenticate } from '../core/sellers.js';
import {
  ROLES, TASK_STATUSES, PRIORITIES, TASK_KINDS, listStaff, createStaff, updateStaff, deleteStaff, staffLogin, changeOwnPassword, meView,
  allTasks, tasksFor, createTask, updateTask, setTaskStatus, addNote, staffNote, teamOrderView, teamResolveDispute,
} from '../core/team.js';
import { MANUAL } from '../manual.js';
import { requireAccess } from '../core/access.js';

async function requireStaff(ctx, request, { allowPasswordChange = false } = {}) {
  const session = await authenticate(ctx, request);
  const staff = session?.staff_id && (await first(ctx.env, 'SELECT * FROM staff WHERE id = ? AND disabled_at IS NULL', session.staff_id));
  if (!staff) throw new UserError('Please log in.', 401);
  // A new or reset account must choose its own password before doing anything else.
  if (staff.must_change_password && !allowPasswordChange) throw new UserError('Choose a new password first.', 403);
  return staff;
}

export function teamRoutes(r) {
  // ---- team members
  r.post('/api/team/login', ({ ctx, body }) => staffLogin(ctx, body));
  r.get('/api/team/me', async ({ ctx, request }) => ({ staff: meView(await requireStaff(ctx, request, { allowPasswordChange: true })) }));
  r.post('/api/team/password', async ({ ctx, request, body }) =>
    ({ staff: await changeOwnPassword(ctx, await requireStaff(ctx, request, { allowPasswordChange: true }), body) }));
  r.get('/api/team/tasks', async ({ ctx, request }) => {
    const staff = await requireStaff(ctx, request);
    return { tasks: await tasksFor(ctx, staff.id), statuses: TASK_STATUSES };
  });
  r.post('/api/team/tasks/:id/status', async ({ ctx, request, params, body }) =>
    ({ task: await setTaskStatus(ctx, await requireStaff(ctx, request), params.id, body.status) }));
  r.post('/api/team/tasks/:id/notes', async ({ ctx, request, params, body }) =>
    ({ task: await staffNote(ctx, await requireStaff(ctx, request), params.id, body.body) }));
  r.get('/api/team/orders/:id', async ({ ctx, request, params }) => teamOrderView(ctx, await requireStaff(ctx, request), params.id));
  r.post('/api/team/disputes/:id/resolve', async ({ ctx, request, params, body }) =>
    ({ ok: true, ...(await teamResolveDispute(ctx, await requireStaff(ctx, request), params.id, body)) }));

  // ---- the team manual: for the admin and for team members, never public
  r.get('/api/manual', async ({ ctx, request }) => {
    const session = await authenticate(ctx, request);
    if (!session?.is_admin) await requireStaff(ctx, request);
    return { manual: MANUAL };
  });

  // ---- team members and tasks: the admin and the Customer Relations Admin (who can't add or change
  // the Customer Relations Admin role, or their own account here)
  const lead = (handler) => async (args) => handler({ ...args, who: await requireAccess(args.ctx, args.request, { cr: true }) });
  const byOf = (who) => ({ by: who.role, byStaffId: who.staff?.id ?? null });
  r.get('/api/admin/team', lead(async ({ ctx, who }) => ({
    staff: await listStaff(ctx), tasks: await allTasks(ctx), statuses: TASK_STATUSES, priorities: PRIORITIES, kinds: TASK_KINDS,
    roles: who.role === 'admin' ? ROLES : { customer_relations: ROLES.customer_relations },
    team_dispute_cap: ctx.config.teamDisputeCapKobo, me: { role: who.role, id: who.staff?.id ?? null },
  })));
  r.post('/api/admin/team', lead(async ({ ctx, body, who }) => ({ staff: await createStaff(ctx, body, byOf(who)) })));
  r.post('/api/admin/team/:id', lead(async ({ ctx, params, body, who }) => ({ staff: await updateStaff(ctx, params.id, body, byOf(who)) })));
  r.post('/api/admin/team/:id/delete', lead(async ({ ctx, params, who }) => deleteStaff(ctx, params.id, byOf(who))));
  r.post('/api/admin/tasks', lead(async ({ ctx, body }) => ({ task: await createTask(ctx, body) })));
  r.post('/api/admin/tasks/:id', lead(async ({ ctx, params, body }) => ({ task: await updateTask(ctx, params.id, body) })));
  r.post('/api/admin/tasks/:id/notes', lead(async ({ ctx, params, body, who }) => {
    const t = await first(ctx.env, 'SELECT id FROM tasks WHERE id = ?', Number(params.id));
    if (!t) throw new UserError('Task not found.', 404);
    await addNote(ctx, t.id, who.role === 'admin' ? 'Admin' : who.name, body.body);
    return { ok: true };
  }));
}
