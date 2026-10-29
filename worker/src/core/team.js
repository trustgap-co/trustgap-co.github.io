import { first, all, run, insert, update } from '../lib/db.js';
import { hashPassword, checkPassword } from '../lib/crypto.js';
import { UserError, iso, str, requireLength, normalisePhone, validEmail, getOrder, getDeal, getSeller, DISPUTE_CATEGORIES } from './common.js';
import { createSession } from './sellers.js';
import { DELIVERY_LABELS, resolveDispute, evidenceDetails } from './orders.js';
import { activeReturn, returnView } from './returns.js';
import { caseView } from './statements.js';

// Team members (staff who are not the admin, e.g. customer relations). Each has their own email and
// password. They see the tasks the admin assigns them, the orders those tasks are about (read only),
// and the team manual. They can't move money, decide disputes or change orders.

export const ROLES = { customer_relations: 'Customer relations' };
export const TASK_STATUSES = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
export const PRIORITIES = { normal: 'Normal', high: 'High' };
// 'decide_dispute' lets the assignee decide that order's open dispute, until the task is done.
export const TASK_KINDS = { general: 'General', decide_dispute: 'Decide a dispute' };
const MIN_PASSWORD = 10;

const staffView = (s) => ({
  id: s.id, name: s.name, email: s.email, phone: s.phone, role: s.role, role_label: ROLES[s.role] || s.role,
  must_change_password: Boolean(s.must_change_password), disabled: Boolean(s.disabled_at), last_login_at: s.last_login_at, created_at: s.created_at,
});

function newPassword(input, label = 'Password') {
  const p = String(input ?? '');
  if (p.length < MIN_PASSWORD) throw new UserError(`${label} must be at least ${MIN_PASSWORD} characters.`);
  if (p.length > 200) throw new UserError(`${label} is too long.`);
  return p;
}

// ---------------------------------------------------------------- admin: team members

export async function listStaff(ctx) {
  return (await all(ctx.env, 'SELECT * FROM staff ORDER BY disabled_at IS NOT NULL, name')).map(staffView);
}

export async function createStaff(ctx, input) {
  const name = requireLength(input.name, 'Name', 2, 100);
  const email = validEmail(input.email);
  const phone = str(input.phone) ? normalisePhone(input.phone) : null;
  const role = ROLES[input.role] ? input.role : 'customer_relations';
  const password = newPassword(input.password, 'Temporary password');
  if (await first(ctx.env, 'SELECT id FROM staff WHERE email = ?', email)) throw new UserError('A team member with this email already exists.');
  const id = await insert(ctx.env, 'staff', {
    name, email, phone, role, password_hash: await hashPassword(password), must_change_password: 1, created_at: iso(ctx.now()),
  });
  return staffView(await first(ctx.env, 'SELECT * FROM staff WHERE id = ?', id));
}

// Reset the password (they must choose a new one at next login), or turn the account off and on.
export async function updateStaff(ctx, id, input) {
  const s = await first(ctx.env, 'SELECT * FROM staff WHERE id = ?', Number(id));
  if (!s) throw new UserError('Team member not found.', 404);
  const fields = {};
  if (input.password !== undefined) Object.assign(fields, { password_hash: await hashPassword(newPassword(input.password, 'Temporary password')), must_change_password: 1 });
  if (input.disabled === true) fields.disabled_at = iso(ctx.now());
  if (input.disabled === false) fields.disabled_at = null;
  if (!Object.keys(fields).length) throw new UserError('Nothing to change.');
  await update(ctx.env, 'staff', s.id, fields);
  // A reset or a disabled account signs them out everywhere.
  if (fields.password_hash || fields.disabled_at) await run(ctx.env, 'DELETE FROM sessions WHERE staff_id = ?', s.id);
  return staffView(await first(ctx.env, 'SELECT * FROM staff WHERE id = ?', s.id));
}

// ---------------------------------------------------------------- team login

export async function staffLogin(ctx, input) {
  const email = str(input.email).toLowerCase();
  const key = `team_fails:${email}`;
  const windowStart = iso(new Date(ctx.now().getTime() - 15 * 60_000));
  const fails = JSON.parse((await first(ctx.env, 'SELECT value FROM meta WHERE key = ?', key))?.value || '[]').filter((t) => t > windowStart);
  if (fails.length >= 8) throw new UserError('Too many attempts. Try again in 15 minutes.', 429);
  const s = await first(ctx.env, 'SELECT * FROM staff WHERE lower(email) = ?', email);
  if (!s || s.disabled_at || !(await checkPassword(input.password, s.password_hash))) {
    fails.push(iso(ctx.now()));
    await run(ctx.env, 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(fails));
    throw new UserError('Wrong email or password.', 401);
  }
  await update(ctx.env, 'staff', s.id, { last_login_at: iso(ctx.now()) });
  return { token: await createSession(ctx, { staffId: s.id }), staff: staffView(s) };
}

export async function changeOwnPassword(ctx, staff, input) {
  if (!(await checkPassword(input.current_password, staff.password_hash))) throw new UserError('Your current password is wrong.');
  const next = newPassword(input.new_password, 'New password');
  if (next === input.current_password) throw new UserError('Choose a password you haven’t used here before.');
  await update(ctx.env, 'staff', staff.id, { password_hash: await hashPassword(next), must_change_password: 0 });
  return staffView(await first(ctx.env, 'SELECT * FROM staff WHERE id = ?', staff.id));
}

export const meView = staffView;

// ---------------------------------------------------------------- tasks

async function taskRows(ctx, where, ...args) {
  const rows = await all(ctx.env, `SELECT t.*, s.name AS assignee_name, o.ref AS order_ref FROM tasks t
    LEFT JOIN staff s ON s.id = t.assigned_to LEFT JOIN orders o ON o.id = t.order_id
    WHERE ${where} ORDER BY t.status = 'done', t.priority = 'high' DESC, COALESCE(t.due_at, '9999') , t.id DESC LIMIT 300`, ...args);
  const notes = rows.length
    ? await all(ctx.env, `SELECT * FROM task_notes WHERE task_id IN (${rows.map(() => '?').join(', ')}) ORDER BY id`, ...rows.map((r) => r.id))
    : [];
  return rows.map((t) => ({
    ...t,
    status_label: TASK_STATUSES[t.status] || t.status,
    kind_label: TASK_KINDS[t.kind] || t.kind,
    overdue: Boolean(t.due_at && t.status !== 'done' && new Date(t.due_at) < ctx.now()),
    notes: notes.filter((n) => n.task_id === t.id),
  }));
}

export const allTasks = (ctx) => taskRows(ctx, '1 = 1');
export const tasksFor = (ctx, staffId) => taskRows(ctx, 't.assigned_to = ?', staffId);

async function orderIdFromRef(ctx, ref) {
  const r = str(ref).toUpperCase();
  if (!r) return null;
  const o = await first(ctx.env, 'SELECT id FROM orders WHERE ref = ?', r);
  if (!o) throw new UserError(`No order with reference ${r}.`);
  return o.id;
}
function dueDate(input) {
  if (!str(input)) return null;
  const d = new Date(`${str(input)}T18:00:00+01:00`); // the end of that working day, Lagos time
  if (Number.isNaN(d.getTime())) throw new UserError('Choose a valid due date.');
  return iso(d);
}

export async function createTask(ctx, input) {
  const title = requireLength(input.title, 'Task title', 3, 160);
  const details = str(input.details).slice(0, 4000) || null;
  const assignee = await first(ctx.env, 'SELECT * FROM staff WHERE id = ? AND disabled_at IS NULL', Number(input.assigned_to));
  if (!assignee) throw new UserError('Choose who the task is for.');
  const now = iso(ctx.now());
  const orderId = await orderIdFromRef(ctx, input.order_ref);
  const kind = TASK_KINDS[input.kind] ? input.kind : 'general';
  if (kind === 'decide_dispute') await requireOpenDispute(ctx, orderId);
  const id = await insert(ctx.env, 'tasks', {
    title, details, kind, order_id: orderId, assigned_to: assignee.id,
    priority: PRIORITIES[input.priority] ? input.priority : 'normal', status: 'todo', due_at: dueDate(input.due_date), created_at: now, updated_at: now,
  });
  await notifyAssignee(ctx, assignee, `TrustGap: new task for you: "${title}". Open the team portal: ${ctx.config.siteUrl}/team/index.html`);
  return (await taskRows(ctx, 't.id = ?', id))[0];
}

async function requireOpenDispute(ctx, orderId) {
  if (!orderId) throw new UserError('A "Decide a dispute" task needs the order reference.');
  if (!(await first(ctx.env, "SELECT id FROM disputes WHERE order_id = ? AND status = 'open'", orderId))) {
    throw new UserError('That order has no open dispute to decide.');
  }
}

async function notifyAssignee(ctx, staff, sms) {
  if (!staff.phone && !staff.email) return;
  await ctx.notify.send({ event: 'task_assigned', phone: staff.phone, email: staff.email, sms, emailSubject: 'New TrustGap task' });
}

// Admin: change anything about a task. Team member: only its status (see setTaskStatus).
export async function updateTask(ctx, id, input) {
  const t = await first(ctx.env, 'SELECT * FROM tasks WHERE id = ?', Number(id));
  if (!t) throw new UserError('Task not found.', 404);
  const fields = { updated_at: iso(ctx.now()) };
  if (input.title !== undefined) fields.title = requireLength(input.title, 'Task title', 3, 160);
  if (input.details !== undefined) fields.details = str(input.details).slice(0, 4000) || null;
  if (input.priority !== undefined && PRIORITIES[input.priority]) fields.priority = input.priority;
  if (input.due_date !== undefined) fields.due_at = dueDate(input.due_date);
  if (input.order_ref !== undefined) fields.order_id = await orderIdFromRef(ctx, input.order_ref);
  if (input.kind !== undefined && TASK_KINDS[input.kind]) fields.kind = input.kind;
  if ((fields.kind || t.kind) === 'decide_dispute' && (fields.kind || fields.order_id !== undefined)) {
    await requireOpenDispute(ctx, fields.order_id !== undefined ? fields.order_id : t.order_id);
  }
  if (input.status !== undefined) Object.assign(fields, statusFields(ctx, input.status));
  let newAssignee = null;
  if (input.assigned_to !== undefined && Number(input.assigned_to) !== t.assigned_to) {
    newAssignee = await first(ctx.env, 'SELECT * FROM staff WHERE id = ? AND disabled_at IS NULL', Number(input.assigned_to));
    if (!newAssignee) throw new UserError('Choose who the task is for.');
    fields.assigned_to = newAssignee.id;
  }
  await update(ctx.env, 'tasks', t.id, fields);
  if (newAssignee) await notifyAssignee(ctx, newAssignee, `TrustGap: a task was passed to you: "${fields.title || t.title}". ${ctx.config.siteUrl}/team/index.html`);
  return (await taskRows(ctx, 't.id = ?', t.id))[0];
}

function statusFields(ctx, status) {
  if (!TASK_STATUSES[status]) throw new UserError('Unknown task status.');
  return { status, completed_at: status === 'done' ? iso(ctx.now()) : null };
}

export async function setTaskStatus(ctx, staff, id, status) {
  const t = await first(ctx.env, 'SELECT * FROM tasks WHERE id = ? AND assigned_to = ?', Number(id), staff.id);
  if (!t) throw new UserError('Task not found.', 404);
  await update(ctx.env, 'tasks', t.id, { ...statusFields(ctx, status), updated_at: iso(ctx.now()) });
  await addNote(ctx, t.id, staff.name, `Marked "${TASK_STATUSES[status]}".`);
  return (await taskRows(ctx, 't.id = ?', t.id))[0];
}

export async function addNote(ctx, taskId, author, body) {
  const text = requireLength(body, 'Note', 2, 2000);
  await insert(ctx.env, 'task_notes', { task_id: taskId, author, body: text, created_at: iso(ctx.now()) });
  await run(ctx.env, 'UPDATE tasks SET updated_at = ? WHERE id = ?', iso(ctx.now()), taskId);
}

export async function staffNote(ctx, staff, id, body) {
  const t = await first(ctx.env, 'SELECT id FROM tasks WHERE id = ? AND assigned_to = ?', Number(id), staff.id);
  if (!t) throw new UserError('Task not found.', 404);
  await addNote(ctx, t.id, staff.name, body);
  return (await taskRows(ctx, 't.id = ?', t.id))[0];
}

// ---------------------------------------------------------------- orders, read only

// What a team member may see about an order: only one a task of theirs is about. Contact details
// to reach both sides; never bank or refund accounts, PINs, or anything that moves money.
export async function teamOrderView(ctx, staff, orderId) {
  const linked = await first(ctx.env, 'SELECT id FROM tasks WHERE order_id = ? AND assigned_to = ?', Number(orderId), staff.id);
  if (!linked) throw new UserError('You can only open orders that one of your tasks is about.', 403);
  const o = await getOrder(ctx, Number(orderId));
  const d = await getDeal(ctx, o.deal_id);
  const s = await getSeller(ctx, o.seller_id);
  const disputes = await all(ctx.env, 'SELECT id, opened_by, category, description, status, resolution_note, buyer_refund, seller_payout, seller_charge, decided_by, created_at FROM disputes WHERE order_id = ? ORDER BY id', o.id);
  const decideTask = await decisionTask(ctx, staff, o.id);
  return {
    order: {
      id: o.id, ref: o.ref, status: o.status, amount: o.amount, created_at: o.created_at, paid_at: o.paid_at,
      item_title: d.item_title, item_condition: d.item_condition, item_description: d.item_description, quantity: d.quantity,
      delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status, courier: o.courier, delivery_ref: o.delivery_ref, courier_status: o.courier_status,
      ship_by: o.ship_by, delivered_at: o.delivered_at, inspection_ends_at: o.inspection_ends_at, packing_note: o.packing_note,
      buyer: { name: o.buyer_name, phone: o.buyer_phone, email: o.buyer_email, state: o.delivery_state, address: o.delivery_address },
      seller: { business_name: s.business_name, name: s.full_name, phone: s.phone, email: s.email, identity_verified: Boolean(s.identity_verified_at) },
    },
    disputes: await Promise.all(disputes.map(async (x) => ({ ...x, category_label: DISPUTE_CATEGORIES[x.category] || x.category, photos: await evidenceDetails(ctx, x.id),
      case: await caseView(ctx, await first(ctx.env, 'SELECT * FROM disputes WHERE id = ?', x.id)) }))),
    // Present only while she holds an open "Decide a dispute" task for this order: what the decision form needs.
    decide: decideTask && {
      task_id: decideTask.id,
      dispute_id: disputes.find((x) => x.status === 'open')?.id,
      amount: o.amount, seller_payout: o.seller_payout, delivery_fee: o.delivery_fee, delivered: Boolean(o.delivered_at),
      item_with_seller: await (async () => { const r = await activeReturn(ctx, o.id); return Boolean(r && !r.problem_at); })(),
      return_problem: (await activeReturn(ctx, o.id))?.problem_note || null,
      condition_pledge: d.condition_pledge, buyer_ack_at: o.buyer_ack_at,
    },
    return: await returnView(ctx, await activeReturn(ctx, o.id)),
    events: await all(ctx.env, 'SELECT type, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id', o.id),
  };
}

// ---------------------------------------------------------------- deciding a dispute (team)

// An open "Decide a dispute" task of hers for this order, while the order still has an open dispute.
async function decisionTask(ctx, staff, orderId) {
  const task = await first(ctx.env, "SELECT * FROM tasks WHERE order_id = ? AND assigned_to = ? AND kind = 'decide_dispute' AND status != 'done' ORDER BY id DESC", orderId, staff.id);
  if (!task) return null;
  return (await first(ctx.env, "SELECT id FROM disputes WHERE order_id = ? AND status = 'open'", orderId)) ? task : null;
}

// Same rules, checks and money movements as the admin's decision; recorded under her name, and her
// task is closed with the decision in its notes.
export async function teamResolveDispute(ctx, staff, disputeId, input) {
  const dispute = await first(ctx.env, 'SELECT * FROM disputes WHERE id = ?', Number(disputeId));
  const task = dispute && (await decisionTask(ctx, staff, dispute.order_id));
  if (!task || dispute.status !== 'open') throw new UserError('You can only decide a dispute the admin has asked you to decide, while it is open.', 403);
  const result = await resolveDispute(ctx, dispute.id, input, { by: `team:${staff.name}` });
  const d = await first(ctx.env, 'SELECT * FROM disputes WHERE id = ?', dispute.id);
  const naira = (k) => '₦' + (k / 100).toLocaleString('en-NG');
  await addNote(ctx, task.id, staff.name, `Decided: refund ${naira(d.buyer_refund)}, seller paid ${naira(d.seller_payout)}, seller charged ${naira(d.seller_charge)}.${result.waiting_for_return ? ' Money moves once the seller has the item back.' : ''} Reason: ${d.resolution_note}`);
  await update(ctx.env, 'tasks', task.id, { status: 'done', completed_at: iso(ctx.now()), updated_at: iso(ctx.now()) });
  return result;
}
