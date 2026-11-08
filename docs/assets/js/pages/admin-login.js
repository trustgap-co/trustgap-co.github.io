import { api, auth, html, show, onSubmit, shell, link, $ } from '../core.js';

await shell('admin');
if (auth.admin()) location.href = link('admin/orders.html');
show('#app', html`<section class="card narrow"><h1>Admin</h1>
  <form class="form" id="login"><label>Password <input name="password" type="password" required autocomplete="current-password"></label>
  <button class="btn">Log in</button></form>
  <p class="muted small">Customer Relations Admin or team member? <a href="${link('team/index.html')}">Log in with your email in the team portal</a>.</p></section>`);
const done = (token) => { auth.setAdmin(token); auth.setStaffName(''); location.href = link('admin/orders.html'); };
onSubmit($('#login'), async (data) => {
  const r = await api('/api/admin/login', { method: 'POST', body: data });
  if (r.token) return done(r.token);
  // Step 2: the code texted to the admin phone (or the recovery code if SMS isn't arriving).
  show('#app', html`<section class="card narrow"><h1>Enter your login code</h1>
    <p>We texted a 6-digit code to ${r.phone_hint}.</p>
    ${r.dev_code ? html`<p class="devcode">Test mode code: <strong>${r.dev_code}</strong></p>` : ''}
    <form class="form" id="code"><label>Code <input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}"></label>
      <button class="btn">Log in</button></form>
    <details class="small"><summary>Not getting the SMS?</summary>
      <p class="muted">Wait a minute and check the number. If SMS isn’t working, use your recovery code (the ADMIN_RECOVERY_CODE secret in Cloudflare).</p>
      <form class="form" id="recovery"><label>Recovery code <input name="recovery_code" required type="password" autocomplete="off"></label>
        <button class="btn btn-secondary">Log in with the recovery code</button></form></details></section>`);
  onSubmit($('#code'), async ({ code }) => done((await api('/api/admin/login', { method: 'POST', body: { password: data.password, code } })).token));
  onSubmit($('#recovery'), async ({ recovery_code }) => done((await api('/api/admin/login', { method: 'POST', body: { password: data.password, recovery_code } })).token));
});
