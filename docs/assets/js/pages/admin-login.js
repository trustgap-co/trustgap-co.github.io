import { api, auth, html, show, onSubmit, shell, link, $ } from '../core.js';

await shell('admin');
if (auth.admin()) location.href = link('admin/orders.html');
show('#app', html`<section class="card narrow"><h1>Admin</h1>
  <form class="form" id="login"><label>Password <input name="password" type="password" required autocomplete="current-password"></label>
  <button class="btn">Log in</button></form>
  <p class="muted small">Customer Relations Admin or team member? <a href="${link('team/index.html')}">Log in with your email in the team portal</a>.</p></section>`);
onSubmit($('#login'), async (data) => {
  auth.setAdmin((await api('/api/admin/login', { method: 'POST', body: data })).token);
  auth.setStaffName('');
  location.href = link('admin/orders.html');
});
