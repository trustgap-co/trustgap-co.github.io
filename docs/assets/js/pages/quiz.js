// Spot the Scam: made-up WhatsApp/Instagram chats, one at a time. Tap Scam or Legit, meet the
// character behind each trick, and get a score worth sharing. Pidgin first, English as an option
// (the same choice as the safety check). Every chat is invented: no real messages, no real people.
//
// Two ways to play:
//   Play till you fail (the main game): chats keep coming; one wrong answer ends it. After 10 correct a
//     countdown starts (10 seconds a chat, 8 after 30), and legit chats come a little more often.
//     Score = correct answers in a row; the best is remembered on this phone.
//   Quick round: ten chats (7 scams, 3 legit), score out of 10.
import { html, raw, show, link, shell, track, params, $ } from '../core.js';
import { VILLAINS } from '../check-fun.js';
import { faceSvg, drawFace, buzz, confetti } from '../check-art.js';
import { BANK, SHIELDS } from '../quiz-bank.js';
import { offerNewsletter } from '../newsletter.js';

shell('tool');

const T = {
  pcm: {
    title: 'Spot the Scam 🎮', lead: 'Chat go dey come one by one. Tap Scam or Legit. One mistake and game don end. How far you fit go?',
    endless: '🔥 Play till you fail', endlessNote: 'One life. After 10 correct, clock go start.', quick: 'Quick round (10 chats)',
    scam: '🚩 Scam', legit: '✅ Legit', next: 'Next chat', finish: 'See my score',
    of: (i, n) => `Chat ${i} of ${n}`, streak: (n) => `🔥 ${n} in a row`, buyerSide: 'You dey buy', sellerSide: 'You dey sell', them: 'Them', you: 'You',
    right: 'Correct! 🎉', wrong: 'Ah, no be am 😅', timeUp: '⏰ Time don finish!', met: (v) => `Na ${v} be this 😂`,
    score: (n) => `You score ${n}/10`, again: 'Play again', check: 'Check a real deal',
    share: '📸 Share my score', saved: 'Picture don download. Post am for your status!', dare: '😂 Dare your friend',
    rank: [[10, 'Scam Detector: Professor 🎓'], [8, 'Sharp eye 👀'], [6, 'You dey try! Small more practice'], [0, 'You don learn new tricks today 💪']],
    erank: [[30, 'Scam Slayer ⚔️'], [20, 'Wahala Detector 🕵️'], [10, 'Sharp Eye 👀'], [5, 'Scam Spotter 🔎'], [0, 'You don start to sabi 💪']],
    eScore: (n) => `You spot ${n} for row!`, best: (n) => `Your best: ${n}`, newBest: '🏆 New best!',
    caught: (v) => `Na ${v} catch you this time 😂`,
    shareText: (n, u) => (n >= 8 ? `I score ${n}/10 for Spot the Scam 🧠 “Pay first” no fit catch me. Your turn: ${u}` : `I score ${n}/10 for Spot the Scam 😅 Now I sabi the tricks. You fit beat am? ${u}`),
    eShareText: (n, u) => `I spot ${n} scams for row for Spot the Scam 🔥 You fit pass me? ${u}`,
    challenged: (n) => `Your padi score ${n}/10 for Spot the Scam. You fit beat am? 👀`,
    eChallenged: (n) => `Your padi spot ${n} for row. You fit pass am? 👀`,
    beat: (n) => `You pass your padi (${n}) 🏆`, tie: (n) => `Una draw: ${n} 🤝`, lost: (n) => `Your padi get ${n}. Try again? 😅`,
    note: 'All the chats for this game na made-up examples.',
    avoid: '🛡️ How to avoid am', safe: '✅ Wetin make am safe', secs: 's',
  },
  en: {
    title: 'Spot the Scam 🎮', lead: 'Chats keep coming, one at a time. Tap Scam or Legit. One mistake and it’s over. How far can you go?',
    endless: '🔥 Play till you fail', endlessNote: 'One life. After 10 correct, the clock starts.', quick: 'Quick round (10 chats)',
    scam: '🚩 Scam', legit: '✅ Legit', next: 'Next chat', finish: 'See my score',
    of: (i, n) => `Chat ${i} of ${n}`, streak: (n) => `🔥 ${n} in a row`, buyerSide: 'You’re buying', sellerSide: 'You’re selling', them: 'Them', you: 'You',
    right: 'Correct! 🎉', wrong: 'Not quite 😅', timeUp: '⏰ Time’s up!', met: (v) => `That was ${v} 😂`,
    score: (n) => `You scored ${n}/10`, again: 'Play again', check: 'Check a real deal',
    share: '📸 Share my score', saved: 'Picture downloaded. Post it on your status!', dare: '😂 Dare a friend',
    rank: [[10, 'Scam Detector: Professor 🎓'], [8, 'Sharp eye 👀'], [6, 'Getting there! A bit more practice'], [0, 'You just learned some new tricks 💪']],
    erank: [[30, 'Scam Slayer ⚔️'], [20, 'Wahala Detector 🕵️'], [10, 'Sharp Eye 👀'], [5, 'Scam Spotter 🔎'], [0, 'Getting the hang of it 💪']],
    eScore: (n) => `You spotted ${n} in a row!`, best: (n) => `Your best: ${n}`, newBest: '🏆 New best!',
    caught: (v) => `${v} caught you this time 😂`,
    shareText: (n, u) => (n >= 8 ? `I scored ${n}/10 on Spot the Scam 🧠 “Pay first” won’t catch me. Your turn: ${u}` : `I scored ${n}/10 on Spot the Scam 😅 Now I know the tricks. Can you beat me? ${u}`),
    eShareText: (n, u) => `I spotted ${n} scams in a row on Spot the Scam 🔥 Can you beat me? ${u}`,
    challenged: (n) => `Your friend scored ${n}/10 on Spot the Scam. Can you beat that? 👀`,
    eChallenged: (n) => `Your friend spotted ${n} in a row. Can you beat that? 👀`,
    beat: (n) => `You beat your friend (${n}) 🏆`, tie: (n) => `It’s a tie: ${n} 🤝`, lost: (n) => `Your friend got ${n}. Try again? 😅`,
    note: 'Every chat in this game is a made-up example.',
    avoid: '🛡️ How to avoid it', safe: '✅ What made it safe', secs: 's',
  },
};

let lang = (() => { try { return localStorage.getItem('tg_check_lang') || 'pcm'; } catch { return 'pcm'; } })();
const t = () => T[lang];
const L2 = (pair) => (lang === 'pcm' ? pair[0] : pair[1]);
// A friend's score from a challenge link: ?s=7 (quick round, out of 10) or ?e=23 (play till you fail).
const friend = /^(10|\d)$/.test(params.get('s') || '') ? Number(params.get('s')) : null;
const friendE = /^\d{1,3}$/.test(params.get('e') || '') ? Number(params.get('e')) : null;
let game = null; // { mode, items, at, answered, right, timedOut, over }

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------- quick round (ten chats)
// 7 scams and 3 legit. Legit chats are never back to back (nor first), the same character never shows
// twice in a row, and chats this phone hasn't seen yet come first, so games keep changing.
const SEEN_KEY = 'tg_quiz_seen';
const seenIds = () => new Set(store.get(SEEN_KEY, []));
function freshFirst(list, n) {
  const seen = seenIds();
  const fresh = shuffle(list.filter((q) => !seen.has(q.id))), old = shuffle(list.filter((q) => seen.has(q.id)));
  return [...fresh, ...old].slice(0, n);
}
function arrange(scams, legit) {
  const slots = shuffle([[1, 4, 7], [2, 5, 8], [1, 5, 8], [2, 4, 7], [1, 4, 8], [2, 6, 9], [3, 6, 9], [1, 6, 9]])[0];
  let order = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const mixed = shuffle(scams);
    order = [];
    let si = 0, li = 0;
    for (let i = 0; i < scams.length + legit.length; i++) order.push(slots.includes(i) && li < legit.length ? legit[li++] : mixed[si++]);
    if (order.every((q, i) => !i || !q.scam || !order[i - 1].scam || q.v !== order[i - 1].v)) break;
  }
  return order;
}
function quickGame() {
  const items = arrange(freshFirst(BANK.filter((q) => q.scam), 7), freshFirst(BANK.filter((q) => !q.scam), 3));
  const seen = seenIds(); items.forEach((q) => seen.add(q.id));
  // Once nearly everything has been seen, start the cycle again.
  store.set(SEEN_KEY, seen.size >= BANK.length - 10 ? items.map((q) => q.id) : [...seen]);
  return { mode: 'quick', items, at: 0, answered: null, right: 0 };
}

// ---------------------------------------------------------------- play till you fail
// The next chat: never the same chat twice until the whole bank is used, never two legit in a row
// (and not legit first), never the same character twice in a row. Legit chats come a bit more often
// as the score climbs, so "everything is a scam" stops working.
let pool = [];
function nextEndless(prev, right) {
  if (!pool.length) pool = shuffle(BANK);
  const legitChance = right < 10 ? 0.25 : right < 20 ? 0.32 : 0.4;
  const wantLegit = prev && prev.scam && Math.random() < legitChance;
  const fits = (q) => (wantLegit ? !q.scam : q.scam) && !(prev && q.scam && prev.scam && q.v === prev.v) && q.id !== prev?.id;
  let i = pool.findIndex(fits);
  if (i < 0) i = pool.findIndex((q) => q.scam && q.id !== prev?.id && !(prev?.scam && q.v === prev.v));
  if (i < 0) { pool = shuffle(BANK); i = pool.findIndex((q) => q.scam && q.id !== prev?.id); }
  return pool.splice(i, 1)[0];
}
// Seconds for this chat (null: no clock yet).
const secondsFor = (right) => (right < 10 ? null : right < 30 ? 10 : 8);
function endlessGame() {
  pool = shuffle(BANK);
  return { mode: 'endless', items: [nextEndless(null, 0)], at: 0, answered: null, right: 0, timedOut: false, over: false };
}

// ---------------------------------------------------------------- the clock
let tick = null;
function startClock() {
  clearInterval(tick);
  const secs = game.mode === 'endless' && game.answered === null ? secondsFor(game.right) : null;
  if (!secs) return;
  // One deadline per chat: redrawing (e.g. switching language) never gives more time.
  game.clockEnds ||= Date.now() + secs * 1000;
  const ends = game.clockEnds;
  const paint = () => {
    const left = Math.max(0, ends - Date.now());
    const el = $('#qz-clock');
    if (el) { el.textContent = `⏱ ${Math.ceil(left / 1000)}${t().secs}`; el.classList.toggle('hurry', left < 3500); }
    const bar = $('#qz-clock-bar');
    if (bar) bar.style.width = `${(left / (secs * 1000)) * 100}%`;
    if (left <= 0 && game.answered === null) answer(null);
  };
  paint();
  tick = setInterval(paint, 200);
}

// ---------------------------------------------------------------- screens
const rank = (n) => t().rank.find(([min]) => n >= min)[1];
const erank = (n) => t().erank.find(([min]) => n >= min)[1];
const pageUrl = () => `${location.origin}${location.pathname}`;
const challengeUrl = () => (game.mode === 'endless' ? `${pageUrl()}?e=${game.right}` : `${pageUrl()}?s=${game.right}`);
const vsFriend = (n, f) => (f === null ? '' : html`<p class="muted">${n > f ? t().beat(f) : n === f ? t().tie(f) : t().lost(f)}</p>`);

function render() {
  const L = t();
  document.documentElement.lang = lang;
  $('.page-hero .container').innerHTML = String(html`<p class="sc-lang">
      <button type="button" class="sc-lang-btn ${lang === 'pcm' ? 'on' : ''}" data-lang="pcm" aria-pressed="${lang === 'pcm'}">Pidgin</button>
      <button type="button" class="sc-lang-btn ${lang === 'en' ? 'on' : ''}" data-lang="en" aria-pressed="${lang === 'en'}">English</button></p>
    <h1>${L.title}</h1><p>${L.lead}</p>`);
  const box = '.page-hero + .section .container';
  const best = store.get('tg_quiz_best', 0);

  if (!game) {
    show(box, html`<div class="sc-wrap">
      ${friendE !== null ? html`<div class="sc-challenge"><p>${L.eChallenged(friendE)}</p></div>` : friend !== null ? html`<div class="sc-challenge"><p>${L.challenged(friend)}</p></div>` : ''}
      <section class="card sc-card qz-start"><div class="qz-faces">${['pressure', 'fake_alert', 'deposit', 'overpay', 'pay_first'].map((v) => raw(faceSvg(v, 56)))}</div>
        <button type="button" class="btn btn-lg btn-block" id="qz-endless">${L.endless}</button>
        <p class="small center muted">${L.endlessNote}${best ? html` · <strong>${L.best(best)}</strong>` : ''}</p>
        <button type="button" class="btn btn-secondary btn-block" id="qz-quick">${L.quick}</button>
        <p class="fine center">${L.note}</p></section></div>`);
    return;
  }

  // The end: quick round finished, or the first wrong answer in play till you fail.
  if (game.over || (game.mode === 'quick' && game.at >= game.items.length)) {
    const n = game.right;
    if (game.mode === 'endless') {
      const last = game.items[game.at];
      show(box, html`<div class="sc-wrap"><section class="card sc-res qz-end ${n >= 20 ? 'sc-low' : n >= 10 ? 'sc-mid' : 'sc-high'}">
        <p class="qz-big">🔥 ${n}</p><h2>${L.eScore(n)}</h2><p class="qz-rank">${erank(n)}</p>
        <p>${game.newBest ? html`<strong>${L.newBest}</strong> ` : ''}${L.best(Math.max(best, n))}</p>
        ${last?.scam ? html`<div class="sc-villain">${raw(faceSvg(last.v, 56))}<div><strong>${L.caught(VILLAINS[last.v][0])}</strong></div></div>` : ''}
        ${vsFriend(n, friendE)}
        <div class="sc-safe"><button type="button" class="btn btn-block" id="qz-share">${L.share}</button>
          <a class="btn btn-block btn-whatsapp" id="qz-dare" href="${`https://wa.me/?text=${encodeURIComponent(L.eShareText(n, challengeUrl()))}`}" target="_blank" rel="noopener">${L.dare}</a>
          <a class="btn btn-block btn-secondary" href="${link('check.html')}">${L.check}</a>
          <p class="small center"><button type="button" class="linklike" id="qz-endless">${L.again}</button> · <button type="button" class="linklike" id="qz-quick">${L.quick}</button></p></div></section></div>`);
      return;
    }
    show(box, html`<div class="sc-wrap"><section class="card sc-res qz-end ${n >= 8 ? 'sc-low' : n >= 6 ? 'sc-mid' : 'sc-high'}">
      <p class="qz-big">${n}/10</p><h2>${L.score(n)}</h2><p class="qz-rank">${rank(n)}</p>
      ${vsFriend(n, friend)}
      <div class="sc-safe"><button type="button" class="btn btn-block" id="qz-share">${L.share}</button>
        <a class="btn btn-block btn-whatsapp" id="qz-dare" href="${`https://wa.me/?text=${encodeURIComponent(L.shareText(n, challengeUrl()))}`}" target="_blank" rel="noopener">${L.dare}</a>
        <a class="btn btn-block btn-secondary" href="${link('check.html')}">${L.check}</a>
        <p class="small center"><button type="button" class="linklike" id="qz-quick">${L.again}</button> · <button type="button" class="linklike" id="qz-endless">${L.endless}</button></p></div></section></div>`);
    return;
  }

  const q = game.items[game.at], done = game.answered, endless = game.mode === 'endless';
  const secs = endless ? secondsFor(game.right) : null;
  show(box, html`<div class="sc-wrap"><section class="card sc-card qz-card">
    <p class="qz-top"><span>${endless ? L.streak(game.right) : L.of(game.at + 1, game.items.length)}</span>
      ${secs && done === null ? html`<span class="qz-clock" id="qz-clock">⏱ ${secs}${L.secs}</span>` : ''}
      <span class="pill">${q.side === 'buyer' ? L.buyerSide : L.sellerSide}</span></p>
    <div class="qz-bar ${secs && done === null ? 'qz-timebar' : ''}" aria-hidden="true">
      <span id="${secs && done === null ? 'qz-clock-bar' : ''}" style="width:${secs && done === null ? 100 : endless ? Math.min(100, (game.right % 10) * 10) : (game.at / game.items.length) * 100}%"></span></div>
    <div class="qz-chat">${q.chat.map(([from, pcm, en]) => html`<p class="qz-msg qz-${from}"><small>${from === 'you' ? L.you : L.them}</small>${lang === 'pcm' ? pcm : en}</p>`)}</div>
    ${done === null ? html`<div class="qz-answers"><button type="button" class="btn btn-lg qz-scam" data-ans="scam">${L.scam}</button>
        <button type="button" class="btn btn-lg qz-legit" data-ans="legit">${L.legit}</button></div>`
      : html`<div class="qz-feedback ${done ? 'ok' : 'no'}"><p class="qz-verdict">${done ? L.right : game.timedOut ? L.timeUp : L.wrong}</p>
        ${q.scam ? html`<div class="sc-villain">${raw(faceSvg(q.v, 56))}<div><strong>${L.met(VILLAINS[q.v][0])}</strong><span>${L2(q.why)}</span></div></div>` : html`<p>${L2(q.why)}</p>`}
        <div class="qz-avoid"><p class="qz-avoid-head">${q.scam ? L.avoid : L.safe}</p><p>${L2(q.avoid)}</p>
          <span class="qz-shield">${SHIELDS[q.tg][0]} ${lang === 'pcm' ? SHIELDS[q.tg][1] : SHIELDS[q.tg][2]}</span></div>
        <button type="button" class="btn btn-block" id="qz-next">${(endless && !done) || (!endless && game.at + 1 === game.items.length) ? L.finish : L.next}</button></div>`}
  </section></div>`);
  startClock();
}

// `ans`: 'scam' | 'legit' | null (the clock ran out).
function answer(ans) {
  clearInterval(tick);
  const q = game.items[game.at];
  const ok = ans !== null && (ans === 'scam') === q.scam;
  game.answered = ok;
  game.timedOut = ans === null;
  if (ok) game.right++; else buzz([60]);
  render();
}

function next() {
  if (game.mode === 'endless') {
    if (!game.answered) return finish();
    game.items.push(nextEndless(game.items[game.at], game.right));
    game.at++; game.answered = null; game.timedOut = false; game.clockEnds = null;
    return render();
  }
  game.at++; game.answered = null;
  if (game.at >= game.items.length) return finish();
  render();
}

function finish() {
  const n = game.right;
  if (game.mode === 'endless') {
    game.over = true;
    const best = store.get('tg_quiz_best', 0);
    game.newBest = n > best && n > 0;
    if (game.newBest) store.set('tg_quiz_best', n);
    track('quiz_finished', { mode: 'endless', score: n, best: Math.max(best, n), language: lang, challenged: friendE !== null, timed_out: game.timedOut });
    render();
    if (game.newBest && n >= 5) confetti();
  } else {
    track('quiz_finished', { mode: 'quick', score: n, language: lang, challenged: friend !== null });
    render();
    if (n >= 8) confetti();
  }
  scrollTo({ top: 0 });
  // After a game, once: the newsletter invitation (never during play).
  setTimeout(() => offerNewsletter('quiz', lang), 1500);
}

// ---------------------------------------------------------------- the share picture
function scoreCard() {
  const L = t(), n = game.right, endless = game.mode === 'endless';
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d'), F = 'Roboto, Arial, sans-serif';
  g.fillStyle = '#0B1B3D'; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#F4F7FC'; g.font = `bold 60px ${F}`; g.fillText('Trust', 80, 120);
  const w = g.measureText('Trust').width; g.font = `60px ${F}`; g.fillText('Gap', 80 + w, 120);
  g.fillStyle = '#9DB9F5'; g.font = `600 36px ${F}`; g.fillText(endless ? 'SPOT THE SCAM 🔥 PLAY TILL YOU FAIL' : 'SPOT THE SCAM 🎮', 80, 180);
  const good = endless ? n >= 20 : n >= 8, mid = endless ? n >= 10 : n >= 6;
  g.fillStyle = good ? '#0E7A4A' : mid ? '#9A5B00' : '#2350B0';
  g.beginPath(); g.roundRect(80, 230, 920, 620, 40); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#FFFFFF';
  g.font = `bold ${endless ? 260 : 230}px ${F}`; g.fillText(endless ? String(n) : `${n}/10`, 540, 500);
  if (endless) { g.font = `600 44px ${F}`; g.fillText(lang === 'pcm' ? 'scams for row' : 'scams in a row', 540, 565); }
  g.font = `600 52px ${F}`; g.fillText(endless ? erank(n) : rank(n), 540, endless ? 645 : 620, 860);
  ['pressure', 'fake_alert', 'deposit', 'overpay', 'pay_first'].forEach((v, i) => drawFace(g, v, 150 + i * 160, 680, 130));
  g.fillStyle = '#F4F7FC'; g.font = `44px ${F}`;
  g.fillText(lang === 'pcm' ? 'You fit beat my score? 👀' : 'Can you beat my score? 👀', 540, 980);
  g.fillStyle = '#C9D3EA'; g.font = `36px ${F}`; g.fillText(`${location.host}/quiz.html`, 540, 1260);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
async function share() {
  const blob = await scoreCard();
  const file = new File([blob], 'trustgap-spot-the-scam.png', { type: 'image/png' });
  const text = game.mode === 'endless' ? t().eShareText(game.right, challengeUrl()) : t().shareText(game.right, challengeUrl());
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); track('share', { method: 'native', content_type: 'quiz_score', mode: game.mode }); return; } catch { /* closed */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  $('#qz-share').textContent = '✓ ' + t().saved;
  track('share', { method: 'download', content_type: 'quiz_score', mode: game.mode });
}

function start(mode) {
  clearInterval(tick);
  game = mode === 'endless' ? endlessGame() : quickGame();
  track('quiz_started', { mode, language: lang, challenged: (mode === 'endless' ? friendE : friend) !== null });
  render();
  scrollTo({ top: 0 });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.dataset.lang) { lang = b.dataset.lang; try { localStorage.setItem('tg_check_lang', lang); } catch { /* private mode */ } render(); }
  else if (b.id === 'qz-endless') start('endless');
  else if (b.id === 'qz-quick') start('quick');
  else if (b.dataset.ans && game && game.answered === null) answer(b.dataset.ans);
  else if (b.id === 'qz-next') next();
  else if (b.id === 'qz-share') share();
  else if (b.id === 'qz-dare') track('share', { method: 'whatsapp', content_type: 'quiz_dare', mode: game?.mode });
});

if (friend !== null || friendE !== null) track('quiz_challenge_opened', { friend_score: friendE ?? friend, mode: friendE !== null ? 'endless' : 'quick' });
render();
