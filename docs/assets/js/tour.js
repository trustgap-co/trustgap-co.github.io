// Guided tours: a card points at one part of the page at a time and explains it, with Back, Next and
// Skip. Tours are always offered, never forced: a small invitation (or, on the home page's first
// visit, a welcome pop-up), and a "Show me around" button to start or replay it any time.
// Once someone finishes or skips a tour it isn't offered again on that device.
//
//   offerTour('new-link', { invite: 'New to payment links?', steps: [{ el: '#deal [name=item_title]', title, text }, …] })
//
// A step's `el` is a CSS selector or a function returning an element; a step whose element isn't on
// the page (or is hidden) is skipped, and a step without `el` is shown in the middle of the screen.
import { track } from './core.js';

const seenKey = (id) => `tg_tour_${id}`;
const seen = (id) => { try { return localStorage.getItem(seenKey(id)); } catch { return 'unknown'; } };
const remember = (id, how) => { try { localStorage.setItem(seenKey(id), how); } catch { /* private mode */ } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const target = (step) => {
  const el = !step.el ? null : typeof step.el === 'function' ? step.el() : document.querySelector(step.el);
  return el && el.getClientRects().length ? el : null;
};

let active = null; // the running tour, if any
const offered = new Set();

// `after`: the tour of the step before (e.g. step 1 of a deal link). If they finished it, this one
// starts straight away; if they skipped or declined it, this one isn't offered (the ? button stays).
export function offerTour(id, { invite = 'First time here? Take a quick tour of this page.', welcome = null, after = null, steps }) {
  if (!steps?.length) return;
  helpButton(id, steps);
  if (seen(id) || offered.has(id)) return; // pages that redraw call this again: offer once
  offered.add(id);
  if (after && seen(after)) {
    if (seen(after) === 'completed') setTimeout(() => startTour(id, steps, 'continued'), 500);
    return;
  }
  // Wait for the cookie choice to be made first, so the two never sit on top of each other.
  const ready = () => !document.querySelector('.consent') && !active;
  const show = () => (welcome ? welcomeCard(id, welcome, steps) : inviteBar(id, invite, steps));
  const wait = () => (ready() ? show() : setTimeout(wait, 800));
  setTimeout(wait, 900);
}

// "Show me around": always there, to start or replay the page's tour.
function helpButton(id, steps) {
  document.querySelector('.tour-help')?.remove();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tour-help';
  b.innerHTML = '<span aria-hidden="true">?</span><span class="tour-help-label">Show me around</span>';
  b.setAttribute('aria-label', 'Show me around this page');
  b.addEventListener('click', () => startTour(id, steps, 'help_button'));
  document.body.append(b);
}

function inviteBar(id, text, steps) {
  const bar = document.createElement('div');
  bar.className = 'tour-invite';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Page tour');
  bar.innerHTML = `<p><span aria-hidden="true">👋</span> ${esc(text)}</p>
    <div class="tour-actions"><button type="button" class="btn btn-small" data-go>Show me (${steps.length} quick steps)</button>
    <button type="button" class="btn btn-small btn-secondary" data-no>No thanks</button></div>`;
  document.body.append(bar);
  track('tour_offered', { tour: id });
  bar.querySelector('[data-go]').addEventListener('click', () => { bar.remove(); startTour(id, steps, 'invite'); });
  bar.querySelector('[data-no]').addEventListener('click', () => { bar.remove(); remember(id, 'declined'); track('tour_declined', { tour: id }); });
}

// The home page's first visit: a welcome pop-up offering the tour.
function welcomeCard(id, { title, text }, steps) {
  const wrap = document.createElement('div');
  wrap.className = 'tour-welcome';
  wrap.innerHTML = `<div class="tour-card tour-card-center" role="dialog" aria-modal="true" aria-labelledby="tour-w-title">
    <p class="tour-wave" aria-hidden="true">👋</p>
    <h2 id="tour-w-title">${esc(title)}</h2><p>${esc(text)}</p>
    <div class="tour-actions"><button type="button" class="btn" data-go>Take the 1-minute tour</button>
    <button type="button" class="btn btn-secondary" data-no>Not now</button></div>
    <p class="tour-hint">You can start it any time with the <strong>?</strong> button.</p></div>`;
  document.body.append(wrap);
  track('tour_offered', { tour: id, style: 'welcome' });
  wrap.querySelector('[data-go]').focus();
  const close = (go) => {
    wrap.remove();
    if (go) startTour(id, steps, 'welcome');
    else { remember(id, 'declined'); track('tour_declined', { tour: id }); }
  };
  wrap.querySelector('[data-go]').addEventListener('click', () => close(true));
  wrap.querySelector('[data-no]').addEventListener('click', () => close(false));
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
}

export function startTour(id, allSteps, from = 'button') {
  if (active) return;
  document.querySelector('.tour-invite')?.remove();
  const steps = allSteps.filter((s) => !s.el || target(s));
  if (!steps.length) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-block"></div><div class="tour-spot" hidden></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-live="polite" aria-labelledby="tour-title"></div>`;
  document.body.append(root);
  document.body.classList.add('touring');
  const spot = root.querySelector('.tour-spot');
  const card = root.querySelector('.tour-card');
  let at = 0;
  let timer;
  track('tour_started', { tour: id, from });

  const place = () => {
    const el = target(steps[at]);
    const phone = innerWidth < 700;
    if (!el) {
      spot.hidden = true;
      root.classList.add('tour-dim');
      card.classList.add('tour-card-center');
      card.style.cssText = '';
      return;
    }
    root.classList.remove('tour-dim');
    card.classList.remove('tour-card-center');
    const r = el.getBoundingClientRect();
    const pad = 6;
    spot.hidden = false;
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    if (phone) { card.style.cssText = ''; return; } // a sheet at the bottom of the screen (CSS)
    const cw = Math.min(380, innerWidth - 32);
    const ch = card.offsetHeight;
    const below = r.bottom + 14 + ch < innerHeight;
    const top = below ? r.bottom + 14 : Math.max(12, r.top - ch - 14);
    const left = Math.min(Math.max(16, r.left), innerWidth - cw - 16);
    card.style.cssText = `top:${top}px;left:${left}px;width:${cw}px`;
  };

  const show = (n) => {
    at = n;
    const s = steps[at];
    const last = at === steps.length - 1;
    card.innerHTML = `<p class="tour-count">Step ${at + 1} of ${steps.length}</p>
      <h2 id="tour-title">${esc(s.title)}</h2><p>${esc(s.text)}</p>
      <div class="tour-actions">
        ${at ? '<button type="button" class="btn btn-small btn-secondary" data-back>Back</button>' : ''}
        <button type="button" class="btn btn-small" data-next>${last ? 'Done' : 'Next'}</button>
        ${last ? '' : '<button type="button" class="linklike tour-skip" data-skip>Skip tour</button>'}
      </div>`;
    const el = target(s);
    if (el) {
      // On phones the card sits at the bottom, so bring the part being explained near the top.
      if (innerWidth < 700) scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - 90), behavior: 'smooth' });
      else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    place();
    setTimeout(place, 350);
    card.querySelector('[data-next]').focus({ preventScroll: true });
    card.querySelector('[data-next]').addEventListener('click', () => (last ? end('completed') : show(at + 1)));
    card.querySelector('[data-back]')?.addEventListener('click', () => show(at - 1));
    card.querySelector('[data-skip]')?.addEventListener('click', () => end('skipped'));
    track('tour_step', { tour: id, step: at + 1 });
  };

  const keys = (e) => {
    if (e.key === 'Escape') end('skipped');
    else if (e.key === 'ArrowRight') (at === steps.length - 1 ? end('completed') : show(at + 1));
    else if (e.key === 'ArrowLeft' && at) show(at - 1);
  };
  function end(how) {
    clearInterval(timer);
    removeEventListener('keydown', keys);
    removeEventListener('resize', place);
    root.remove();
    document.body.classList.remove('touring');
    active = null;
    remember(id, how);
    track(how === 'completed' ? 'tour_completed' : 'tour_skipped', { tour: id, step: at + 1, of: steps.length });
    document.querySelector('.tour-help')?.focus({ preventScroll: true });
  }

  active = { id };
  addEventListener('keydown', keys);
  addEventListener('resize', place);
  timer = setInterval(place, 250); // follows scrolling and pages that redraw themselves
  show(0);
}
