// Drawings and small joys for the safety check and the quiz: a cartoon face for each character
// (drawn in code, as SVG on the page and on the canvas for share pictures), confetti and a buzz.
// The faces are cartoons of a trick, not of any real person.

const SKIN = ['#8D5524', '#A0522D', '#6B3E26', '#C68642'];
// [background, skin, headwear (gele | cap | none), headwear colour, prop emoji]
const LOOK = {
  pay_first: ['#F4B740', 0, 'cap', '#0B1B3D', '🏦'], deposit: ['#9DB9F5', 1, 'none', '#1F1F1F', '💸'],
  too_cheap: ['#F7A6C1', 2, 'gele', '#C2185B', '🏷️'], pressure: ['#FFB4A2', 3, 'gele', '#B42318', '⏰'],
  no_video: ['#B8E0D2', 0, 'cap', '#0E7A4A', '📷'], name_mismatch: ['#D6C1F5', 1, 'none', '#1F1F1F', '🪪'],
  new_page: ['#C7F0FF', 2, 'cap', '#2350B0', '🐣'], no_reviews: ['#E2E8F0', 3, 'none', '#1F1F1F', '🤐'],
  no_refund: ['#FFD6A5', 0, 'gele', '#9A5B00', '🚫'], fake_alert: ['#A7F3D0', 1, 'cap', '#0B1B3D', '📲'],
  overpay: ['#FDE68A', 2, 'none', '#1F1F1F', '💰'], ship_first: ['#BFDBFE', 3, 'cap', '#9A5B00', '📦'],
  otp: ['#FCA5A5', 0, 'none', '#1F1F1F', '🔑'], pending: ['#DDD6FE', 1, 'cap', '#5B21B6', '⏳'],
  s_pressure: ['#FED7AA', 2, 'cap', '#B42318', '🏍️'], address: ['#FBCFE8', 3, 'gele', '#7C3AED', '📍'],
  new_account: ['#CFFAFE', 0, 'none', '#1F1F1F', '🆕'], smooth: ['#E9D5FF', 1, 'cap', '#0B1B3D', '😏'],
  customs: ['#FDE68A', 3, 'cap', '#0E7A4A', '🛃'], giveaway: ['#FBCFE8', 2, 'gele', '#DB2777', '🎁'],
  fake_rider: ['#FED7AA', 1, 'cap', '#1F2937', '🏍️'], clone_page: ['#C7D2FE', 0, 'none', '#1F1F1F', '📋'],
};
const look = (id) => LOOK[id] || LOOK.smooth;

// The face on a 100 × 100 grid: background, head, headwear, bandit mask, sly smile, prop badge.
export function faceSvg(id, size = 64) {
  const [bg, s, hat, hatColor, prop] = look(id);
  const skin = SKIN[s];
  const head = {
    gele: `<path d="M22 40 C20 18 40 10 52 14 C66 8 84 18 78 40 C70 30 34 30 22 40Z" fill="${hatColor}"/><circle cx="74" cy="20" r="9" fill="${hatColor}"/>`,
    cap: `<path d="M26 40 C26 22 74 22 74 40Z" fill="${hatColor}"/><rect x="50" y="36" width="32" height="6" rx="3" fill="${hatColor}"/>`,
    none: `<path d="M28 38 C30 22 70 22 72 38 C64 30 36 30 28 38Z" fill="${hatColor}"/>`,
  }[hat];
  return `<svg class="tg-face" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="50" cy="50" r="50" fill="${bg}"/>
    <circle cx="50" cy="54" r="27" fill="${skin}"/>
    ${head}
    <rect x="24" y="44" width="52" height="13" rx="6.5" fill="#111"/>
    <ellipse cx="40" cy="50.5" rx="5" ry="3.6" fill="#fff"/><ellipse cx="60" cy="50.5" rx="5" ry="3.6" fill="#fff"/>
    <circle cx="41.5" cy="51" r="1.8" fill="#111"/><circle cx="61.5" cy="51" r="1.8" fill="#111"/>
    <path d="M39 66 Q52 74 63 63" stroke="#2A1608" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="80" cy="80" r="15" fill="#fff"/><text x="80" y="86" font-size="17" text-anchor="middle">${prop}</text>
  </svg>`;
}

// The same face on a canvas (share pictures). x, y: top-left; size: width = height.
export function drawFace(g, id, x, y, size) {
  const [bg, s, hat, hatColor, prop] = look(id);
  const k = size / 100, P = (px, py) => [x + px * k, y + py * k];
  g.save();
  const circle = (cx, cy, r, fill) => { g.beginPath(); g.arc(...P(cx, cy), r * k, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  const ellipse = (cx, cy, rx, ry, fill) => { g.beginPath(); g.ellipse(...P(cx, cy), rx * k, ry * k, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  circle(50, 50, 50, bg);
  circle(50, 54, 27, SKIN[s]);
  g.fillStyle = hatColor; g.beginPath();
  if (hat === 'gele') { g.moveTo(...P(22, 40)); g.bezierCurveTo(...P(20, 18), ...P(40, 10), ...P(52, 14)); g.bezierCurveTo(...P(66, 8), ...P(84, 18), ...P(78, 40)); g.bezierCurveTo(...P(70, 30), ...P(34, 30), ...P(22, 40)); g.fill(); circle(74, 20, 9, hatColor); }
  else if (hat === 'cap') { g.moveTo(...P(26, 40)); g.bezierCurveTo(...P(26, 22), ...P(74, 22), ...P(74, 40)); g.fill(); g.beginPath(); g.roundRect(...P(50, 36), 32 * k, 6 * k, 3 * k); g.fill(); }
  else { g.moveTo(...P(28, 38)); g.bezierCurveTo(...P(30, 22), ...P(70, 22), ...P(72, 38)); g.bezierCurveTo(...P(64, 30), ...P(36, 30), ...P(28, 38)); g.fill(); }
  g.fillStyle = '#111'; g.beginPath(); g.roundRect(...P(24, 44), 52 * k, 13 * k, 6.5 * k); g.fill();
  ellipse(40, 50.5, 5, 3.6, '#fff'); ellipse(60, 50.5, 5, 3.6, '#fff');
  circle(41.5, 51, 1.8, '#111'); circle(61.5, 51, 1.8, '#111');
  g.strokeStyle = '#2A1608'; g.lineWidth = 3 * k; g.lineCap = 'round'; g.beginPath(); g.moveTo(...P(39, 66)); g.quadraticCurveTo(...P(52, 74), ...P(63, 63)); g.stroke();
  circle(80, 80, 15, '#fff');
  g.font = `${17 * k}px Roboto, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#000';
  g.fillText(prop, ...P(80, 86));
  g.restore();
}

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// A short buzz on phones that support it (Android). Never on iPhones, which don't allow it.
export function buzz(pattern = [80, 60, 80]) {
  if (calm()) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

// Confetti for about a second and a half, then gone. Nothing happens if motion is reduced.
export function confetti() {
  if (calm()) return;
  const c = document.createElement('canvas');
  c.className = 'tg-confetti';
  c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  document.body.append(c);
  const g = c.getContext('2d'); g.scale(devicePixelRatio, devicePixelRatio);
  const colors = ['#F4B740', '#0E7A4A', '#2350B0', '#B42318', '#F4F7FC', '#9DB9F5'];
  const bits = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 14 - 6, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (now) => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.42; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.color; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
    if (now - start < 1600) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}
