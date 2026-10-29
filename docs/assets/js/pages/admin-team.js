// Admin: team members (accounts, password resets) and the tasks assigned to them.
import { api, html, show, onSubmit, shell, link, date, flash, fail, params, $, $$, keepFresh } from '../core.js';

await shell('admin');

async function render() {
  const { staff, tasks, roles, statuses, priorities, kinds } = await api('/api/admin/team', { as: 'admin' });
  const active = staff.filter((s) => !s.disabled);
  const filter = params.get('show') || 'open';
  const shown = tasks.filter((t) => (filter === 'done' ? t.status === 'done' : filter === 'all' ? true : t.status !== 'done'));
  show('#app', html`<div class="spread"><h1>Team</h1><a class="btn btn-small btn-secondary" href="${link('team/manual.html')}">Team manual</a></div>

  <section class="card">
    <h2>Assign a task</h2>
    ${active.length ? html`<form class="form" id="new-task">
      <label>Task <input name="title" required maxlength="160" placeholder="e.g. Call the buyer on TG-ABC123 about the refused parcel"></label>
      <label>Details <small>what to do, what to find out, who to contact</small><textarea name="details" rows="3" maxlength="4000"></textarea></label>
      <div class="grid3">
        <label>For <select name="assigned_to" required>${active.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
        <label>Order reference <small>optional; lets them open that order</small><input name="order_ref" placeholder="TG-…" autocapitalize="characters"></label>
        <label>Due <small>optional</small><input name="due_date" type="date"></label>
      </div>
      <div class="grid2">
        <label>Type <select name="kind">${Object.entries(kinds).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <label>Priority <select name="priority">${Object.entries(priorities).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      </div>
      <p class="small muted"><strong>Decide a dispute</strong> lets them decide that order’s open dispute (refund, payout, seller charge) while the task is open, with the same rules and checks as you. Needs the order reference. Every decision records who made it.</p>
      <button class="btn">Assign task</button>
      <p class="small muted">They get an SMS and email with the task title.</p>
    </form>` : html`<p class="muted">Add a team member below first.</p>`}
  </section>

  <section class="card">
    <div class="spread"><h2>Tasks</h2><p class="filters">${[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, l]) =>
      html`<a class="${k === filter ? 'on' : ''}" href="${link(`admin/team.html?show=${k}`)}">${l}</a> `)}</p></div>
    ${shown.length ? html`<div class="list">${shown.map((t) => html`<div class="row task-row ${t.overdue ? 'warn-row' : ''}">
      <div><strong>${t.title}</strong>${t.priority === 'high' ? html` <span class="badge badge-warn">High</span>` : ''}${t.kind === 'decide_dispute' ? html` <span class="badge badge-info">Decide a dispute</span>` : ''}<br>
        <small class="muted">${t.assignee_name || 'unassigned'} · ${t.status_label}${t.due_at ? html` · due ${date(t.due_at)}${t.overdue ? html` <strong>overdue</strong>` : ''}` : ''}
        ${t.order_ref ? html` · <a href="${link(`admin/order.html?id=${t.order_id}`)}">${t.order_ref}</a>` : ''}</small>
        ${t.details ? html`<p class="pre small">${t.details}</p>` : ''}
        ${t.notes.length ? html`<ul class="notes small">${t.notes.map((n) => html`<li><strong>${n.author}</strong> <span class="muted">${date(n.created_at)}</span>: ${n.body}</li>`)}</ul>` : ''}
        <form class="inline-form note-form" data-task="${t.id}"><input name="body" placeholder="Add a note" required maxlength="2000"><button class="btn btn-small btn-secondary">Add</button></form>
      </div>
      <div class="right task-controls">
        <select data-field="status" data-task="${t.id}">${Object.entries(statuses).map(([k, l]) => html`<option value="${k}" ${k === t.status ? 'selected' : ''}>${l}</option>`)}</select>
        <select data-field="assigned_to" data-task="${t.id}">${active.map((s) => html`<option value="${s.id}" ${s.id === t.assigned_to ? 'selected' : ''}>${s.name}</option>`)}</select>
      </div></div>`)}</div>` : html`<p class="muted">No ${filter === 'all' ? '' : filter} tasks.</p>`}
  </section>

  <section class="card">
    <h2>Team members</h2>
    ${staff.length ? html`<div class="list">${staff.map((s) => html`<div class="row">
      <div><strong>${s.name}</strong> · ${s.role_label}${s.disabled ? html` <span class="badge badge-muted">disabled</span>` : ''}<br>
        <small class="muted">${s.email}${s.phone ? ` · ${s.phone}` : ''} · ${s.last_login_at ? `last login ${date(s.last_login_at)}` : 'never logged in'}${s.must_change_password ? ' · must set a new password' : ''}</small></div>
      <div class="right actions">
        <button class="btn btn-small btn-secondary" data-reset="${s.id}" data-name="${s.name}">Reset password</button>
        <button class="btn btn-small ${s.disabled ? '' : 'btn-danger'}" data-disable="${s.id}" data-on="${s.disabled ? 'false' : 'true'}">${s.disabled ? 'Turn back on' : 'Turn off'}</button>
      </div></div>`)}</div>` : html`<p class="muted">No team members yet.</p>`}
    <h3>Add a team member</h3>
    <form class="form" id="new-member">
      <div class="grid3">
        <label>Name <input name="name" required maxlength="100"></label>
        <label>Email <small>they log in with this</small><input name="email" type="email" required></label>
        <label>Phone <small>for task SMS</small><input name="phone" inputmode="tel"></label>
      </div>
      <label>Role <select name="role">${Object.entries(roles).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label>Temporary password <small>at least 10 characters. Give it to them in person or by phone, not in writing; they must change it when they first log in</small>
        <input name="password" type="text" required minlength="10" autocomplete="off"></label>
      <button class="btn">Add team member</button>
      <p class="small muted">They log in at <strong>${link('team/index.html')}</strong>. They see only their own tasks, the orders those tasks are about (read only, no bank details or PINs) and the manual. They can’t move money or decide disputes.</p>
    </form>
  </section>`);

  if ($('#new-task')) {
    onSubmit($('#new-task'), async (data) => {
      await api('/api/admin/tasks', { method: 'POST', body: data, as: 'admin' });
      flash.set('Task assigned.');
      location.reload();
    });
  }
  onSubmit($('#new-member'), async (data) => {
    await api('/api/admin/team', { method: 'POST', body: data, as: 'admin' });
    flash.set(`Team member added. Give them the temporary password; they log in at ${link('team/index.html')}.`);
    location.reload();
  });
  for (const sel of $$('[data-field]')) {
    sel.addEventListener('change', async () => {
      await api(`/api/admin/tasks/${sel.dataset.task}`, { method: 'POST', body: { [sel.dataset.field]: sel.value }, as: 'admin' }).catch((e) => alert(e.message));
      flash.set('Task updated.');
      location.reload();
    });
  }
  for (const f of $$('.note-form')) {
    onSubmit(f, async (data) => {
      await api(`/api/admin/tasks/${f.dataset.task}/notes`, { method: 'POST', body: data, as: 'admin' });
      location.reload();
    });
  }
  for (const b of $$('[data-reset]')) {
    b.addEventListener('click', async () => {
      const password = prompt(`New temporary password for ${b.dataset.name} (at least 10 characters). They must change it when they log in.`);
      if (!password) return;
      await api(`/api/admin/team/${b.dataset.reset}`, { method: 'POST', body: { password }, as: 'admin' }).then(() => flash.set('Password reset. They have been signed out.'))
        .catch((e) => alert(e.message));
      location.reload();
    });
  }
  for (const b of $$('[data-disable]')) {
    b.addEventListener('click', async () => {
      const off = b.dataset.on === 'true';
      if (off && !confirm('Turn this account off? They are signed out at once and can’t log in until you turn it back on.')) return;
      await api(`/api/admin/team/${b.dataset.disable}`, { method: 'POST', body: { disabled: off }, as: 'admin' });
      location.reload();
    });
  }
}
render().then(() => keepFresh('/api/admin/team', render, { as: 'admin' })).catch(fail);
