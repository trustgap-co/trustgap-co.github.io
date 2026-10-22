import { api, auth, html, show, onSubmit, link, shell, $ } from '../core.js';
import { codeStep } from './auth-code.js';

await shell('public');
if (auth.seller()) location.href = link('seller/dashboard.html');

show('#app', html`<section class="card narrow">
  <h1>Seller login</h1>
  <form class="form" id="login">
    <label>Phone number <input name="phone" required inputmode="tel" autocomplete="tel" placeholder="0803 123 4567"></label>
    <button class="btn btn-block">Text me a login code</button>
  </form>
  <p class="muted">New here? <a href="${link('seller/signup.html')}">Create an account</a></p>
</section>`);

onSubmit($('#login'), async (data) => {
  const sent = await api('/api/auth/login', { method: 'POST', body: data });
  codeStep(sent.phone, sent, { next: 'seller/dashboard.html' });
});
