// "Get the TrustGap app" (footer): installs TrustGap from the website on Android, iPhone, Windows and Mac.
// Where the browser can install in one tap (Chrome and Edge on Android, Windows and Mac), the button does
// it; elsewhere (Safari on iPhone and Mac, other browsers) it shows the two or three steps.
import { html, raw, track } from './core.js';

const ua = navigator.userAgent;
export const thisDevice = () => (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios'
  : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : /Macintosh/.test(ua) ? 'mac' : 'other');
export const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const STEPS = {
  android: { title: 'Android', icon: '🤖', steps: [
    'Open this page in <strong>Chrome</strong>.',
    'Tap the menu <strong>⋮</strong> at the top right.',
    'Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.',
  ] },
  ios: { title: 'iPhone and iPad', icon: '🍎', steps: [
    'Open this page in <strong>Safari</strong>.',
    'Tap the <strong>Share</strong> button (the square with an arrow ⬆️).',
    'Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.',
  ] },
  windows: { title: 'Windows', icon: '🪟', steps: [
    'Open this page in <strong>Microsoft Edge</strong> or <strong>Chrome</strong>.',
    'Click the <strong>install icon</strong> at the right of the address bar (a screen with a ⬇ or ➕).',
    'Or open the menu <strong>⋯</strong> → <strong>Apps</strong> → <strong>Install TrustGap</strong>. It then opens from the Start menu.',
  ] },
  mac: { title: 'Mac', icon: '💻', steps: [
    '<strong>Safari</strong>: open the <strong>File</strong> menu → <strong>Add to Dock</strong>.',
    '<strong>Chrome</strong>: click the <strong>install icon</strong> at the right of the address bar, then <strong>Install</strong>.',
    'TrustGap then opens from your Dock or Launchpad, like any app.',
  ] },
};

export async function openInstall(platform) {
  track('app_install_click', { platform, device: thisDevice() });
  if (installed()) return showSteps(platform, 'TrustGap is already installed on this device. Open it from your home screen, Start menu or Dock.');
  // One-tap install (Chrome / Edge), when this device is the one the button is for.
  const deferred = window.__tgInstallPrompt;
  const same = platform === thisDevice() || (platform === 'mac' && thisDevice() === 'mac');
  if (deferred && same) {
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    window.__tgInstallPrompt = null;
    track('app_install_result', { platform, outcome: choice?.outcome || 'unknown' });
    if (choice?.outcome === 'accepted') return;
  }
  showSteps(platform, same ? null : `You’re not on ${STEPS[platform].title} right now. Open this website on your ${STEPS[platform].title} device and follow these steps.`);
}

function showSteps(platform, note) {
  document.querySelector('dialog.install-pop')?.remove();
  const s = STEPS[platform];
  const d = document.createElement('dialog');
  d.className = 'install-pop';
  d.setAttribute('aria-labelledby', 'install-title');
  d.innerHTML = String(html`<button type="button" class="ann-close nl-x" data-close aria-label="Close">×</button>
    <img src="${new URL('../app-icon-512.png', import.meta.url).href}" alt="" width="64" height="64" class="install-icon">
    <h2 id="install-title">Install TrustGap on ${s.title} ${s.icon}</h2>
    ${note ? html`<p class="callout">${note}</p>` : ''}
    <ol class="install-steps">${s.steps.map((x) => html`<li>${raw(x)}</li>`)}</ol>
    <p class="small muted">It’s the same secure TrustGap website, opening in its own window with its own icon: no app store needed, and it’s always up to date.</p>
    <button type="button" class="btn btn-block" data-close>Got it</button>`);
  document.body.append(d);
  for (const b of d.querySelectorAll('[data-close]')) b.addEventListener('click', () => { d.close(); d.remove(); });
  d.addEventListener('click', (e) => { if (e.target === d) { d.close(); d.remove(); } });
  d.showModal();
}
