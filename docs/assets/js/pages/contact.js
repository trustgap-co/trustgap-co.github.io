// Contact page: the message goes straight to TrustGap's email through Web3Forms, never through our
// Worker or database. Protections: a hidden field robots fill in (dropped), a minimum time on the page,
// a limit of 3 messages an hour from this browser, length limits, and checks before sending.
import { shell, track, $ } from '../core.js';
import { SITE } from '../site-info.js';

shell('public');
const form = $('#contact'), err = $('#contact-err'), btn = $('#contact-send');
const opened = Date.now();
const KEY = 'tg_contact_sent';
const recent = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter((t) => Date.now() - t < 3_600_000); } catch { return []; } };
const ready = SITE.web3formsKey && !/^\[.*\]$/.test(SITE.web3formsKey);

function check(f) {
  const name = f.name.value.trim(), phone = f.phone.value.replace(/[\s-]/g, ''), email = f.email.value.trim(), message = f.message.value.trim();
  if (name.length < 2) return 'Please enter your name.';
  if (!/^(\+?234|0)[789][01]\d{8}$/.test(phone)) return 'Please enter a Nigerian phone number, e.g. 0803 123 4567.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Please enter a valid email address.';
  if (message.length < 10) return 'Please write a little more about how we can help.';
  return null;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  if (!ready) { err.textContent = 'The contact form isn’t set up yet. Please email us instead (address on the right).'; return; }
  const problem = check(form);
  if (problem) { err.textContent = problem; return; }
  // Robots: the hidden field is filled, or the form was sent within seconds of opening the page.
  if (form.botcheck.value || Date.now() - opened < 3000) { form.hidden = true; $('#contact-done').hidden = false; return; }
  if (recent().length >= 3) { err.textContent = 'You’ve sent a few messages already. Please wait a little, or email us directly.'; return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: SITE.web3formsKey,
        subject: `TrustGap contact: ${form.topic.value}`,
        from_name: 'TrustGap website',
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        replyto: form.email.value.trim(),
        topic: form.topic.value,
        message: form.message.value.trim(),
        page: location.href,
        botcheck: '',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || 'not sent');
    try { localStorage.setItem(KEY, JSON.stringify([...recent(), Date.now()])); } catch { /* private mode */ }
    track('contact_sent', { topic: form.topic.value });
    form.hidden = true;
    $('#contact-done').hidden = false;
    $('#contact-done').scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    err.textContent = 'Sorry, your message couldn’t be sent. Please check your connection and try again, or email us directly.';
    btn.disabled = false; btn.textContent = 'Send message';
  }
});
