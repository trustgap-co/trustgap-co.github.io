import { api, auth, html, show, onSubmit, link, shell, track, $ } from '../core.js';
import { codeStep } from './auth-code.js';

shell('public'); // not awaited: this page doesn't need the server settings to draw
if (auth.seller()) location.href = link('seller/dashboard.html');

show('#app', html`<section class="card narrow">
  <h1>Create your seller account</h1>
  <p class="muted">Buyers never need an account. Only sellers sign up. No password: we text you a code each time you log in.</p>
  <form class="form" id="signup">
    <label>Full name <small>exactly as on your bank account and NIN</small><input name="full_name" required autocomplete="name"></label>
    <label>Business / page name <small>what buyers know you as</small><input name="business_name" required></label>
    <label>Phone (WhatsApp) <input name="phone" required inputmode="tel" autocomplete="tel" placeholder="0803 123 4567"></label>
    <label>Email <input name="email" type="email" required autocomplete="email"></label>
    <label class="choice"><input type="checkbox" name="marketing_opt_in" value="yes"> Send me TrustGap news, selling tips and special offers by SMS, WhatsApp or email <small>(optional; stop any time)</small></label>
    <label class="choice terms-check"><input type="checkbox" name="terms_accepted" value="yes" required> I have read and agree to the TrustGap
      <a href="${link('legal/terms.html')}" target="_blank" rel="noopener">Terms of Service</a> and
      <a href="${link('legal/seller-terms.html')}" target="_blank" rel="noopener">Seller Terms</a>, and I have read the
      <a href="${link('legal/privacy.html')}" target="_blank" rel="noopener">Privacy Policy</a>. <small>(required)</small></label>
    <button class="btn btn-block">Send me a code</button>
  </form>
  <p class="muted">Already have an account? <a href="${link('seller/login.html')}">Log in</a></p>
</section>`);

onSubmit($('#signup'), async (data) => {
  if (data.terms_accepted !== 'yes') throw new Error('Tick the box to accept the Terms of Service and Seller Terms. You can’t create an account without accepting them.');
  track('terms_accepted', { side: 'seller' });
  const sent = await api('/api/auth/signup', { method: 'POST', body: data });
  track('otp_requested', { flow: 'signup' });
  codeStep(sent.phone, sent, { next: 'seller/settings.html', flow: 'signup' });
});
