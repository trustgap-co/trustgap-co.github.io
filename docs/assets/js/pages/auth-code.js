// Step 2 of signup/login: enter the 6-digit code sent by SMS.
import { api, auth, html, show, onSubmit, link, params, $ } from '../core.js';

export function codeStep(phone, sent, { next }) {
  show('#app', html`<section class="card narrow">
    <h1>Enter your code</h1>
    <p class="muted">We sent a 6-digit code by SMS to <strong>${phone}</strong>. It expires in 10 minutes.</p>
    ${sent.dev_code ? html`<p class="devcode">Test mode — no SMS is sent. Your code is <strong>${sent.dev_code}</strong></p>` : ''}
    <form class="form" id="code">
      <label>Code <input name="code" class="codeinput" required inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6"></label>
      <button class="btn btn-block">Continue</button>
    </form>
    <p class="muted small center">Didn’t get it? Wait a minute, then <a href="">start again</a>.</p>
  </section>`);
  $('#code input').focus();
  onSubmit($('#code'), async ({ code }) => {
    const { token } = await api('/api/auth/verify', { method: 'POST', body: { phone, code } });
    auth.setSeller(token);
    location.href = params.get('next')?.startsWith(link('')) ? params.get('next') : link(next);
  });
}
