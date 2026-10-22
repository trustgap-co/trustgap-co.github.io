import { api, auth, html, show, onSubmit, link, shell, $ } from '../core.js';
import { codeStep } from './auth-code.js';

await shell('public');
if (auth.seller()) location.href = link('seller/dashboard.html');

show('#app', html`<section class="card narrow">
  <h1>Create your seller account</h1>
  <p class="muted">Buyers never need an account — only sellers sign up. No password: we text you a code each time you log in.</p>
  <form class="form" id="signup">
    <label>Full name <small>exactly as on your bank account and NIN</small><input name="full_name" required autocomplete="name"></label>
    <label>Business / page name <small>what buyers know you as</small><input name="business_name" required></label>
    <label>Phone (WhatsApp) <input name="phone" required inputmode="tel" autocomplete="tel" placeholder="0803 123 4567"></label>
    <label>Email <input name="email" type="email" required autocomplete="email"></label>
    <button class="btn btn-block">Send me a code</button>
  </form>
  <p class="muted">Already have an account? <a href="${link('seller/login.html')}">Log in</a></p>
</section>`);

onSubmit($('#signup'), async (data) => {
  const sent = await api('/api/auth/signup', { method: 'POST', body: data });
  codeStep(sent.phone, sent, { next: 'seller/settings.html' });
});
