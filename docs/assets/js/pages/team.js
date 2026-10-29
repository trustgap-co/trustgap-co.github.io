// Team portal: sign in, set your own password, and work through the tasks the admin assigned you.
import { api, auth, html, show, onSubmit, shell, link, date, flash, fail, $, $$, keepFresh } from '../core.js';

await shell('team');

const PRIORITY = { high: html`<span class="badge badge-warn">High</span>`, normal: '' };

function loginView() {
  show('#app', html`<section class="card narrow"><h1>Team portal</h1>
    <p class="muted">For TrustGap team members. The admin gives you your email and a temporary password.</p>
    <form class="form" id="login">
      <label>Email <input name="email" type="email" required autocomplete="username"></label>
      <label>Password <input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-block">Log in</button>
    </form></section>`);
  onSubmit($('#login'), async (data) => {
    const r = await api('/api/team/login', { method: 'POST', body: data });
    auth.setTeam(r.token);
    location.reload(); // redraws the header with the team menu
  });
}

function passwordView(me) {
  show('#app', html`<section class="card narrow"><h1>Choose your password</h1>
    <p class="muted">Hi ${me.name}. ${me.must_change_password ? 'Before you start, replace the temporary password with your own.' : 'Change your password.'} Use at least 10 characters; a short sentence is easy to remember and hard to guess.</p>
    <form class="form" id="pw">
      <label>Current password <input name="current_password" type="password" required autocomplete="current-password"></label>
      <label>New password <input name="new_password" type="password" required minlength="10" autocomplete="new-password"></label>
      <label>New password again <input name="confirm" type="password" required minlength="10" autocomplete="new-password"></label>
      <button class="btn btn-block">Save password</button>
    </form></section>`);
  onSubmit($('#pw'), async (data) => {
    if (data.new_password !== data.confirm) throw new Error('The two new passwords don’t match.');
    await api('/api/team/password', { method: 'POST', body: data, as: 'team' });
    flash.set('Password saved.');
    location.reload();
  });
}

const taskCard = (t, statuses) => html`<article class="card task ${t.overdue ? 'card-warn' : ''}" id="task-${t.id}">
  <div class="spread"><h2>${t.title}</h2><span>${t.kind === 'decide_dispute' ? html`<span class="badge badge-info">Decide a dispute</span> ` : ''}${PRIORITY[t.priority]} <span class="badge badge-${t.status === 'done' ? 'ok' : 'info'}">${t.status_label}</span></span></div>
  <p class="small muted">${t.due_at ? html`Due ${date(t.due_at)}${t.overdue ? html` · <strong>overdue</strong>` : ''} · ` : ''}assigned ${date(t.created_at)}
    ${t.order_ref && t.kind !== 'decide_dispute' ? html` · <a href="${link(`team/order.html?id=${t.order_id}`)}">Open order ${t.order_ref}</a>` : ''}</p>
  ${t.kind === 'decide_dispute' && t.status !== 'done' && t.order_id
    ? html`<p><a class="btn" href="${link(`team/order.html?id=${t.order_id}#decide`)}">Review evidence and decide ${t.order_ref}</a></p>` : ''}
  ${t.details ? html`<p class="pre">${t.details}</p>` : ''}
  ${t.notes.length ? html`<ul class="notes">${t.notes.map((n) => html`<li><strong>${n.author}</strong> <small class="muted">${date(n.created_at)}</small><br>${n.body}</li>`)}</ul>` : ''}
  <div class="actions">${Object.entries(statuses).filter(([k]) => k !== t.status)
    .map(([k, label]) => html`<button class="btn btn-small ${k === 'done' ? '' : 'btn-secondary'}" data-status="${k}" data-task="${t.id}">Mark ${label.toLowerCase()}</button>`)}</div>
  <form class="form note-form" data-task="${t.id}">
    <label>Add a note <small>who you spoke to, when, what they said, what evidence you got</small><textarea name="body" rows="2" required maxlength="2000"></textarea></label>
    <button class="btn btn-small btn-secondary">Add note</button>
  </form>
</article>`;

async function tasksView() {
  const { tasks, statuses } = await api('/api/team/tasks', { as: 'team' });
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');
  show('#app', html`<div class="spread"><h1>My tasks</h1><div class="actions">
      <a class="btn btn-small btn-secondary" href="${link('team/manual.html')}">Team manual</a>
      <button class="btn btn-small btn-secondary" id="change-pw">Change password</button></div></div>
    <p class="muted">${open.length} open${open.some((t) => t.overdue) ? html` · <strong>${open.filter((t) => t.overdue).length} overdue</strong>` : ''}. You can’t move money or decide disputes; when a case is ready, note what you found and mark it done.</p>
    ${open.length ? open.map((t) => taskCard(t, statuses)) : html`<p class="card muted">Nothing to do right now. New tasks also arrive by SMS.</p>`}
    ${done.length ? html`<details class="rules"><summary>Done (${done.length})</summary>${done.map((t) => taskCard(t, statuses))}</details>` : ''}`);
  for (const b of $$('[data-status]')) {
    b.addEventListener('click', async () => {
      b.disabled = true;
      await api(`/api/team/tasks/${b.dataset.task}/status`, { method: 'POST', body: { status: b.dataset.status }, as: 'team' }).catch((e) => alert(e.message));
      await tasksView();
    });
  }
  for (const f of $$('.note-form')) {
    onSubmit(f, async (data) => {
      await api(`/api/team/tasks/${f.dataset.task}/notes`, { method: 'POST', body: data, as: 'team' });
      await tasksView();
      $(`#task-${f.dataset.task}`)?.scrollIntoView({ block: 'center' });
    });
  }
  $('#change-pw').addEventListener('click', async () => passwordView((await api('/api/team/me', { as: 'team' })).staff));
}

async function render() {
  if (!auth.team()) return loginView();
  const { staff: me } = await api('/api/team/me', { as: 'team' });
  if (me.must_change_password) return passwordView(me);
  await tasksView();
  keepFresh('/api/team/tasks', tasksView, { as: 'team' });
}
render().catch(fail);
