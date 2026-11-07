// Spot the Scam: ten made-up WhatsApp/Instagram chats, one at a time. Tap Scam or Legit, meet the
// character behind each trick, and get a score worth sharing. Pidgin first, English as an option
// (the same choice as the safety check). Every chat is invented: no real messages, no real people.
import { html, raw, show, link, shell, track, params, $ } from '../core.js';
import { VILLAINS } from '../check-fun.js';
import { faceSvg, drawFace, buzz, confetti } from '../check-art.js';

shell('public');

// [side, scam?, character (when scam), chat lines [[from: them|you, Pidgin, English]], why [Pidgin, English]]
const BANK = [
  ['buyer', true, 'pay_first', [['them', 'The bag dey o. Pay first enter my account make I reserve am for you 🙏', 'The bag is available. Pay first into my account so I can reserve it for you 🙏']],
    ['“Pay first enter my account” na the oldest trick. Once money comot, you no get any way back.', '“Pay first into my account” is the oldest trick. Once the money leaves, there’s no way back.']],
  ['buyer', false, null, [['them', 'I don create TrustGap link for you. Check everything, pay there, rider go bring am come your house.', 'I’ve made you a TrustGap link. Check everything, pay there, and a rider will bring it to your house.']],
    ['Legit! Payment protected, delivery handled, and you check the item before the seller collect money.', 'Legit! Payment protected, delivery handled, and you check the item before the seller is paid.']],
  ['buyer', true, 'deposit', [['them', 'Just send ₦5,000 for delivery first. Balance when the item reach you.', 'Just send ₦5,000 for delivery first. Pay the balance when it arrives.']],
    ['“Small delivery fee first” today, “clearing fee” tomorrow. The item no go ever come.', '“Small delivery fee first” today, “clearing fee” tomorrow. The item never comes.']],
  ['buyer', true, 'pressure', [['them', 'Na last one remain o 😩 3 people dey ask. Pay in 10 minutes or I sell am.', 'Only one left 😩 3 people are asking. Pay in 10 minutes or I sell it.']],
    ['Rush na how dem dey stop you from thinking. Real seller fit wait you small.', 'Rushing you stops you thinking. A real seller can wait a moment.']],
  ['buyer', false, null, [['you', 'Abeg I fit see the phone live?', 'Can I see the phone live?'], ['them', 'No wahala. Make we do video call now so you see am yourself.', 'Sure. Let’s video call now so you can see it yourself.']],
    ['Legit sign! Seller wey get the item no dey fear video call.', 'A good sign! A seller who has the item isn’t afraid of a video call.']],
  ['seller', true, 'fake_alert', [['them', 'I don send ₦45,000 🙏 check your alert. See the screenshot. Send the item now, my driver dey wait.', 'I’ve sent ₦45,000 🙏 check your alert. See the screenshot. Send the item now, my driver is waiting.']],
    ['Screenshot no be money. Na only your bank app get final say.', 'A screenshot isn’t money. Only your bank app has the final say.']],
  ['seller', true, 'overpay', [['them', 'Ah sorry! I mistakenly send ₦80,000 instead of ₦8,000. Abeg refund the ₦72,000 now now.', 'Oh sorry! I sent ₦80,000 by mistake instead of ₦8,000. Please refund the ₦72,000 right now.']],
    ['The “overpaid” money no ever land. Na your own money you go dey refund.', 'The “overpaid” money never arrived. You’d be refunding your own money.']],
  ['seller', true, 'otp', [['them', 'To confirm my payment, abeg send me the code wey dem just send your phone.', 'To confirm my payment, please send me the code that was just sent to your phone.']],
    ['Nobody wey wan pay you go need your OTP. That code na key to your account.', 'Nobody paying you needs your OTP. That code is the key to your account.']],
  ['seller', false, null, [['them', 'I don pay through the TrustGap link ✅ When you go book pickup?', 'I’ve paid through the TrustGap link ✅ When will you book pickup?']],
    ['Legit! TrustGap confirm the money before you send, and dem go handle the delivery.', 'Legit! TrustGap confirms the money before you send, and handles the delivery.']],
  ['seller', true, 'pending', [['them', 'My transfer dey pending, bank say e go land tomorrow. Send the item today abeg.', 'My transfer is pending, the bank says it lands tomorrow. Please send the item today.']],
    ['Money wey “dey pending” no be money yet. Wait make e land.', 'Money that’s “pending” isn’t money yet. Wait until it lands.']],
  ['buyer', true, 'too_cheap', [['them', 'Brand new iPhone 15 Pro Max for ₦250,000 only 🔥 Promo for today.', 'Brand new iPhone 15 Pro Max for just ₦250,000 🔥 Today’s promo.']],
    ['If e cheap reach like that, ask why. Price wey too sweet na bait.', 'If it’s that cheap, ask why. A price that’s too sweet is bait.']],
  ['buyer', false, null, [['them', 'The price na ₦45,000. If you no like am when e reach, you fit return am through TrustGap.', 'It’s ₦45,000. If you don’t like it when it arrives, you can return it through TrustGap.']],
    ['Legit! Seller wey agree to protection and returns no dey hide anything.', 'Legit! A seller who accepts protection and returns has nothing to hide.']],
  ['buyer', true, 'no_refund', [['them', 'Pay first. No refund, no return o. Once you pay, e don finish.', 'Pay first. No refund, no return. Once you pay, that’s final.']],
    ['“No refund” for item wey you never see na risk wey you go carry alone.', '“No refund” on an item you haven’t seen leaves all the risk with you.']],
  ['seller', true, 's_pressure', [['them', 'My driver don reach your gate 🏍️ Release the item, I go transfer as e reach me.', 'My driver is at your gate 🏍️ Release the item, I’ll transfer when it reaches me.']],
    ['Driver fit wait five minutes. If money never land, the item no suppose comot.', 'A driver can wait five minutes. If the money hasn’t landed, the item stays.']],
  ['buyer', true, 'name_mismatch', [['them', 'Our page na Glam Hub. Pay to this account, e get another name because na my cousin own.', 'Our page is Glam Hub. Pay to this account; it’s under another name because it’s my cousin’s.']],
    ['Business name one thing, account name another thing? Na red flag.', 'One name on the page, another on the account? That’s a red flag.']],
  ['buyer', false, null, [['them', 'We dey Lekki. You fit come check am for our shop, or pay with TrustGap link make we deliver.', 'We’re in Lekki. You can check it at our shop, or pay with a TrustGap link and we’ll deliver.']],
    ['Legit! Shop you fit visit, plus protection if you no fit come. Na so e suppose be.', 'Legit! A shop you can visit, plus protection if you can’t. That’s how it should be.']],
];

const T = {
  pcm: {
    title: 'Spot the Scam 🎮', lead: 'We go show you 10 chats. Tap Scam or Legit. You fit catch the scammer?',
    start: 'Start the game', scam: '🚩 Scam', legit: '✅ Legit', next: 'Next chat', finish: 'See my score',
    of: (i, n) => `Chat ${i} of ${n}`, buyerSide: 'You dey buy', sellerSide: 'You dey sell', them: 'Them', you: 'You',
    right: 'Correct! 🎉', wrong: 'Ah, no be am 😅', met: (v) => `Na ${v} be this 😂`,
    score: (n) => `You score ${n}/10`, again: 'Play again', check: 'Check a real deal',
    share: '📸 Share my score', saved: 'Picture don download. Post am for your status!', dare: '😂 Dare your friend',
    rank: [[10, 'Scam Detector: Professor 🎓'], [8, 'Sharp eye 👀'], [6, 'You dey try! Small more practice'], [0, 'You don learn new tricks today 💪']],
    shareText: (n, u) => (n >= 8 ? `I score ${n}/10 for Spot the Scam 🧠 “Pay first” no fit catch me. Your turn: ${u}` : `I score ${n}/10 for Spot the Scam 😅 Now I sabi the tricks. You fit beat am? ${u}`),
    challenged: (n) => `Your padi score ${n}/10 for Spot the Scam. You fit beat am? 👀`,
    note: 'All the chats for this game na made-up examples.',
  },
  en: {
    title: 'Spot the Scam 🎮', lead: 'We’ll show you 10 chats. Tap Scam or Legit. Can you catch the scammer?',
    start: 'Start the game', scam: '🚩 Scam', legit: '✅ Legit', next: 'Next chat', finish: 'See my score',
    of: (i, n) => `Chat ${i} of ${n}`, buyerSide: 'You’re buying', sellerSide: 'You’re selling', them: 'Them', you: 'You',
    right: 'Correct! 🎉', wrong: 'Not quite 😅', met: (v) => `That was ${v} 😂`,
    score: (n) => `You scored ${n}/10`, again: 'Play again', check: 'Check a real deal',
    share: '📸 Share my score', saved: 'Picture downloaded. Post it on your status!', dare: '😂 Dare a friend',
    rank: [[10, 'Scam Detector: Professor 🎓'], [8, 'Sharp eye 👀'], [6, 'Getting there! A bit more practice'], [0, 'You just learned some new tricks 💪']],
    shareText: (n, u) => (n >= 8 ? `I scored ${n}/10 on Spot the Scam 🧠 “Pay first” won’t catch me. Your turn: ${u}` : `I scored ${n}/10 on Spot the Scam 😅 Now I know the tricks. Can you beat me? ${u}`),
    challenged: (n) => `Your friend scored ${n}/10 on Spot the Scam. Can you beat that? 👀`,
    note: 'Every chat in this game is a made-up example.',
  },
};

let lang = (() => { try { return localStorage.getItem('tg_check_lang') || 'pcm'; } catch { return 'pcm'; } })();
const t = () => T[lang];
const L2 = (pair) => (lang === 'pcm' ? pair[0] : pair[1]);
const friend = /^(10|\d)$/.test(params.get('s') || '') ? Number(params.get('s')) : null;
let game = null; // { items, at, answered, right }

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
function newGame() {
  // Ten chats: always some legit ones, and a mix of buyer and seller sides.
  const legit = shuffle(BANK.filter((q) => !q[1])).slice(0, 3);
  const scams = shuffle(BANK.filter((q) => q[1])).slice(0, 7);
  game = { items: shuffle([...legit, ...scams]), at: 0, answered: null, right: 0 };
  track('quiz_started', { language: lang, challenged: friend !== null });
}
const rank = (n) => t().rank.find(([min]) => n >= min)[1];
const pageUrl = () => `${location.origin}${location.pathname}`;

function render() {
  const L = t();
  document.documentElement.lang = lang;
  $('.page-hero .container').innerHTML = String(html`<p class="sc-lang">
      <button type="button" class="sc-lang-btn ${lang === 'pcm' ? 'on' : ''}" data-lang="pcm" aria-pressed="${lang === 'pcm'}">Pidgin</button>
      <button type="button" class="sc-lang-btn ${lang === 'en' ? 'on' : ''}" data-lang="en" aria-pressed="${lang === 'en'}">English</button></p>
    <h1>${L.title}</h1><p>${L.lead}</p>`);
  const box = '.page-hero + .section .container';
  if (!game) {
    show(box, html`<div class="sc-wrap">${friend !== null ? html`<div class="sc-challenge"><p>${L.challenged(friend)}</p></div>` : ''}
      <section class="card sc-card qz-start"><div class="qz-faces">${['pressure', 'fake_alert', 'deposit', 'overpay', 'pay_first'].map((v) => raw(faceSvg(v, 56)))}</div>
        <button type="button" class="btn btn-lg btn-block" id="qz-start">${L.start}</button><p class="fine center">${L.note}</p></section></div>`);
    return;
  }
  if (game.at >= game.items.length) {
    const n = game.right;
    show(box, html`<div class="sc-wrap"><section class="card sc-res qz-end ${n >= 8 ? 'sc-low' : n >= 6 ? 'sc-mid' : 'sc-high'}">
      <p class="qz-big">${n}/10</p><h2>${L.score(n)}</h2><p class="qz-rank">${rank(n)}</p>
      ${friend !== null ? html`<p class="muted">${n > friend ? (lang === 'pcm' ? `You beat your padi (${friend}/10) 🏆` : `You beat your friend (${friend}/10) 🏆`) : n === friend ? (lang === 'pcm' ? `Una draw: ${friend}/10 🤝` : `It’s a tie: ${friend}/10 🤝`) : (lang === 'pcm' ? `Your padi get ${friend}/10. Try again? 😅` : `Your friend got ${friend}/10. Try again? 😅`)}</p>` : ''}
      <div class="sc-safe"><button type="button" class="btn btn-block" id="qz-share">${L.share}</button>
        <a class="btn btn-block btn-whatsapp" id="qz-dare" href="${`https://wa.me/?text=${encodeURIComponent(L.shareText(n, `${pageUrl()}?s=${n}`))}`}" target="_blank" rel="noopener">${L.dare}</a>
        <a class="btn btn-block btn-secondary" href="${link('check.html')}">${L.check}</a>
        <p class="small center"><button type="button" class="linklike" id="qz-again">${L.again}</button></p></div></section></div>`);
    return;
  }
  const q = game.items[game.at], done = game.answered;
  show(box, html`<div class="sc-wrap"><section class="card sc-card qz-card">
    <p class="qz-top"><span>${L.of(game.at + 1, game.items.length)}</span><span class="pill">${q[0] === 'buyer' ? L.buyerSide : L.sellerSide}</span></p>
    <div class="qz-bar" aria-hidden="true"><span style="width:${(game.at / game.items.length) * 100}%"></span></div>
    <div class="qz-chat">${q[3].map(([from, pcm, en]) => html`<p class="qz-msg qz-${from}"><small>${from === 'you' ? L.you : L.them}</small>${lang === 'pcm' ? pcm : en}</p>`)}</div>
    ${done === null ? html`<div class="qz-answers"><button type="button" class="btn btn-lg qz-scam" data-ans="scam">${L.scam}</button>
        <button type="button" class="btn btn-lg qz-legit" data-ans="legit">${L.legit}</button></div>`
      : html`<div class="qz-feedback ${done ? 'ok' : 'no'}"><p class="qz-verdict">${done ? L.right : L.wrong}</p>
        ${q[1] ? html`<div class="sc-villain">${raw(faceSvg(q[2], 56))}<div><strong>${L.met(VILLAINS[q[2]][0])}</strong><span>${L2(q[4])}</span></div></div>` : html`<p>${L2(q[4])}</p>`}
        <button type="button" class="btn btn-block" id="qz-next">${game.at + 1 === game.items.length ? L.finish : L.next}</button></div>`}
  </section></div>`);
}

function scoreCard() {
  const L = t(), n = game.right;
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d'), F = 'Roboto, Arial, sans-serif';
  g.fillStyle = '#0B1B3D'; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#F4F7FC'; g.font = `bold 60px ${F}`; g.fillText('Trust', 80, 120);
  const w = g.measureText('Trust').width; g.font = `60px ${F}`; g.fillText('Gap', 80 + w, 120);
  g.fillStyle = '#9DB9F5'; g.font = `600 36px ${F}`; g.fillText('SPOT THE SCAM 🎮', 80, 180);
  g.fillStyle = n >= 8 ? '#0E7A4A' : n >= 6 ? '#9A5B00' : '#2350B0';
  g.beginPath(); g.roundRect(80, 230, 920, 620, 40); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#FFFFFF';
  g.font = `bold 230px ${F}`; g.fillText(`${n}/10`, 540, 500);
  g.font = `600 56px ${F}`; g.fillText(rank(n), 540, 620, 860);
  ['pressure', 'fake_alert', 'deposit', 'overpay', 'pay_first'].forEach((v, i) => drawFace(g, v, 150 + i * 160, 680, 130));
  g.fillStyle = '#F4F7FC'; g.font = `44px ${F}`;
  g.fillText(lang === 'pcm' ? 'You fit beat my score? 👀' : 'Can you beat my score? 👀', 540, 980);
  g.fillStyle = '#C9D3EA'; g.font = `36px ${F}`; g.fillText(`${location.host}/quiz.html`, 540, 1260);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
async function share() {
  const blob = await scoreCard();
  const file = new File([blob], 'trustgap-spot-the-scam.png', { type: 'image/png' });
  const text = t().shareText(game.right, `${pageUrl()}?s=${game.right}`);
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); track('share', { method: 'native', content_type: 'quiz_score' }); return; } catch { /* closed */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  $('#qz-share').textContent = '✓ ' + t().saved;
  track('share', { method: 'download', content_type: 'quiz_score' });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.dataset.lang) { lang = b.dataset.lang; try { localStorage.setItem('tg_check_lang', lang); } catch { /* private mode */ } render(); }
  else if (b.id === 'qz-start' || b.id === 'qz-again') { newGame(); render(); scrollTo({ top: 0 }); }
  else if (b.dataset.ans && game && game.answered === null) {
    const q = game.items[game.at], ok = (b.dataset.ans === 'scam') === q[1];
    game.answered = ok; if (ok) game.right++; else buzz([60]);
    render();
  }
  else if (b.id === 'qz-next') {
    game.at++; game.answered = null; render();
    if (game.at >= game.items.length) {
      track('quiz_finished', { score: game.right, language: lang, challenged: friend !== null });
      if (game.right >= 8) confetti();
    }
  }
  else if (b.id === 'qz-share') share();
  else if (b.id === 'qz-dare') track('share', { method: 'whatsapp', content_type: 'quiz_dare' });
});

if (friend !== null) track('quiz_challenge_opened', { friend_score: friend });
render();
