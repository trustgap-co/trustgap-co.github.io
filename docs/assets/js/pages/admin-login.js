import { api, auth, html, show, onSubmit, shell, link, $ } from '../core.js';

await shell('admin');
if (auth.admin()) location.href = link('admin/orders.html');
show('#app', html`<section class="card narrow"><h1>Admin</h1>
  <form class="form" id="login"><label>Password <input name="password" type="password" required autocomplete="current-password"></label>
  <button class="btn">Log in</button></form></section>`);
onSubmit($('#login'), async (data) => {
  auth.setAdmin((await api('/api/admin/login', { method: 'POST', body: data })).token);
  location.href = link('admin/orders.html');
});
