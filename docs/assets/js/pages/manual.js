// The team manual: served by the Worker only to the admin and signed-in team members.
import { api, auth, html, show, shell, link, raw, fail } from '../core.js';

const as = auth.team() ? 'team' : auth.admin() ? 'admin' : null;
await shell(as || 'team');
if (!as) location.href = link('team/index.html');

async function render() {
  const { manual } = await api('/api/manual', { as });
  show('#app', html`<article class="card manual">
    <h1>TrustGap team manual</h1>
    <p class="muted small">Private: for the TrustGap team only. Don’t share or screenshot it outside the team. Last updated ${manual.updated}.</p>
    <nav class="toc" aria-label="Contents"><strong>Contents</strong><ol>${manual.sections.map((s) => html`<li><a href="#${s.id}">${s.title}</a></li>`)}</ol></nav>
    ${manual.sections.map((s, i) => html`<section id="${s.id}"><h2>${i + 1}. ${s.title}</h2>${raw(s.html)}</section>`)}
  </article>`);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
render().catch(fail);
