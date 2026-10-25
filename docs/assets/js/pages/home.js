// Home page: shared shell plus the hero animation, which tells what TrustGap stands for: closing
// the trust gap between a buyer and a seller in five steps: Agree, Secure, Deliver, Inspect, Release.
import { shell, track, $, $$ } from '../core.js';

shell('public'); // not awaited: this page doesn't need the server settings to draw

const STEPS = [
  ['Agree', 'Buyer and seller agree in the chat. The seller turns it into one TrustGap deal link.'],
  ['Secure', 'The buyer pays through the link. The money is held under the deal rules, not sent to the seller yet.'],
  ['Deliver', 'Payment is secured, so the seller dispatches. The courier carries the parcel to the buyer.'],
  ['Inspect', 'The buyer checks the item, then gives the rider their private delivery PIN.'],
  ['Release', 'After the inspection window, the seller is paid. Both sides knew what would happen next.'],
  ['Trust gap closed', 'Agree. Secure. Deliver. Inspect. Release.'],
];

const svg = $('#trust-anim');
const caption = $('#anim-caption');
const words = $$('.hero-mech span');
let step = 0;
let timer;

function show(n) {
  step = n;
  svg.dataset.step = String(n);
  caption.innerHTML = `<b>${n < 5 ? `${n + 1}. ` : ''}${STEPS[n][0]}</b><span>${STEPS[n][1]}</span>`;
  words.forEach((w, i) => w.classList.toggle('on', i === n || n === 5));
}

// Runs only while the hero is on screen and the tab is visible (saves battery on phones).
// Phones set to reduce motion (Android battery saver or "Remove animations", iPhone "Reduce
// Motion") still get the story: scenes cross-fade instead of sliding (see styles.css), a bit slower.
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let visible = true;
function play() {
  clearInterval(timer);
  if (visible && !document.hidden) timer = setInterval(() => show((step + 1) % STEPS.length), calm ? 4200 : 3200);
}

if (svg) {
  show(0);
  play();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; play(); }).observe(svg);
  document.addEventListener('visibilitychange', play);
  // Tap a step word to see that moment; the loop carries on from there.
  words.forEach((w, i) => {
    w.addEventListener('click', () => {
      track('hero_step_click', { step: STEPS[i][0] });
      show(i);
      play();
    });
  });
}
