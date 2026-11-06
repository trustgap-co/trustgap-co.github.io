// Deal safety check: a free, no-login page that shows the red flags in a WhatsApp or Instagram deal,
// for buyers ("I wan buy") and sellers ("I wan sell"). Pidgin by default, English as an option.
// Everything runs on the phone: nothing typed or pasted is saved or sent anywhere. It scores the
// warning signs in the deal, never the person, and every result ends with the TrustGap way to pay.
import { html, raw, show, link, shell, track, $, $$ } from '../core.js';
import { SITE } from '../site-info.js';
import { SHORT, REASON_ALT, HEAD, NOTE, THINKING, WA, CARD } from '../check-voices.js';

shell('public');

const T = {
  pcm: {
    lang: 'pcm', other: 'English',
    title: 'Dis deal safe? Check am before you pay.',
    lead: 'Answer small questions about the seller or buyer, or paste the message wey dem send you. We go show you the red flags.',
    private: 'We no dey save anything wey you type or paste. Everything dey happen for your phone.',
    who: 'Wetin you wan do?', buyer: 'I wan buy', seller: 'I wan sell',
    yes: 'Yes', no: 'No', unsure: 'I no sure',
    paste: 'Paste the message wey dem send you', pasteHint: 'E no compulsory. We go mark the words wey dey look like scam.',
    pastePh: 'Example: “Pay first to my account, na today only…”',
    check: 'Check the deal', again: 'Start again',
    answered: (n, t) => `${n} of ${t} answered`,
    flags: (n) => (n === 1 ? '1 red flag' : `${n} red flags`),
    level: { low: 'E look calm, but shine your eye', mid: 'Hold your money small', high: 'Omo, no pay yet!' },
    sellerLevel: { low: 'E look okay, but confirm the money', mid: 'Confirm the money first', high: 'Omo, no send the item!' },
    levelNote: {
      low: 'We no see plenty red flag. But scam fit still happen: pay through protection make your money dey safe till the item reach you.',
      mid: 'Some things no too clear. No send money straight to anybody account. Ask make una use protection.',
      high: 'Many things for this deal na the way scammers dey do am. Do not send money to their account. If dem no gree use protection, waka.',
    },
    sellerLevelNote: {
      low: 'E look okay. But no send the item until the money don truly land, no be screenshot.',
      mid: 'Some things no too clear. Confirm the money for your bank app, no be alert or screenshot, before you send anything.',
      high: 'Many things for this deal na the way fake buyers dey do am. No send the item and no refund any “extra”. Ask make dem pay through protection.',
    },
    why: 'Wetin we see', inMessage: 'For the message:', noFlags: 'No red flag from your answers.',
    safeWay: 'The safe way to do am',
    buyerSafe: 'Ask the seller for a TrustGap payment link. Your money go dey hold until the item reach you and you check am. If e no be wetin una agree, you get your money back.',
    sellerSafe: 'Collect the money through TrustGap. The buyer pay first, we confirm the money, then you send. No fake alert, no “I don send am”.',
    askSeller: '💬 Tell the seller make e send TrustGap link', askBuyer: '💬 Tell the buyer make e pay through TrustGap',
    share: 'Share my result', saved: 'Picture don download. Post am for your status!', learn: 'How TrustGap work',
    sellCta: 'Sell with TrustGap', earlyCta: 'Get early access',
    msgSeller: (url) => `Hello! I like the item and I ready to buy. Abeg make we do am through TrustGap: my money go dey safe till the item reach me, and you go collect your money once I confirm. E no dey cost you anything to start: ${url}`,
    msgBuyer: (url) => `Hello! To make am safe for both of us, abeg pay through TrustGap. Your money go dey safe till the item reach you, and I go send immediately the payment confirm: ${url}`,
    cardTitle: 'Deal safety check', cardLine: 'Before you pay, ask for TrustGap link.',
    sellerCardLine: 'Before you send the item, make dem pay through TrustGap.',
    disclaimer: 'Dis check na guide, e no fit catch every scam, and e no dey judge any person. Na the deal we dey check, no be the seller or buyer.',
  },
  en: {
    lang: 'en', other: 'Pidgin',
    title: 'Is this deal safe? Check before you pay.',
    lead: 'Answer a few quick questions about the seller or buyer, or paste the message they sent you. We’ll show you the red flags.',
    private: 'We don’t save anything you type or paste. Everything happens on your phone.',
    who: 'What are you doing?', buyer: 'I’m buying', seller: 'I’m selling',
    yes: 'Yes', no: 'No', unsure: 'Not sure',
    paste: 'Paste the message they sent you', pasteHint: 'Optional. We’ll highlight words that look like a scam.',
    pastePh: 'Example: “Pay first to my account, today only…”',
    check: 'Check the deal', again: 'Start again',
    answered: (n, t) => `${n} of ${t} answered`,
    flags: (n) => (n === 1 ? '1 red flag' : `${n} red flags`),
    level: { low: 'Looks calm, but stay alert', mid: 'Hold your money for now', high: 'Don’t pay yet!' },
    sellerLevel: { low: 'Looks okay, but confirm the money', mid: 'Confirm the money first', high: 'Don’t send the item!' },
    levelNote: {
      low: 'We didn’t see many red flags. Scams can still happen, so pay with protection and your money stays safe until the item reaches you.',
      mid: 'Some things aren’t clear. Don’t send money straight to anyone’s account. Ask to use protection.',
      high: 'Much of this deal looks like how scammers work. Don’t send money to their account. If they refuse protection, walk away.',
    },
    sellerLevelNote: {
      low: 'Looks fine. Still, don’t send the item until the money has really arrived, not just a screenshot.',
      mid: 'Some things aren’t clear. Confirm the money in your bank app, not an alert or screenshot, before you send anything.',
      high: 'Much of this deal looks like how fake buyers work. Don’t send the item and don’t refund any “extra”. Ask them to pay through protection.',
    },
    why: 'What we found', inMessage: 'In the message:', noFlags: 'No red flags from your answers.',
    safeWay: 'The safe way to do it',
    buyerSafe: 'Ask the seller for a TrustGap payment link. Your money is held until the item reaches you and you check it. If it isn’t what you agreed, you get your money back.',
    sellerSafe: 'Collect the money through TrustGap. The buyer pays first, we confirm the money, then you send. No fake alerts, no “I’ve sent it”.',
    askSeller: '💬 Ask the seller for a TrustGap link', askBuyer: '💬 Ask the buyer to pay through TrustGap',
    share: 'Share my result', saved: 'Picture downloaded. Post it on your status!', learn: 'How TrustGap works',
    sellCta: 'Sell with TrustGap', earlyCta: 'Get early access',
    msgSeller: (url) => `Hello! I like the item and I’m ready to buy. Can we do it through TrustGap? My money stays safe until the item reaches me, and you’re paid once I confirm. It costs you nothing to start: ${url}`,
    msgBuyer: (url) => `Hello! To keep it safe for both of us, please pay through TrustGap. Your money stays safe until the item reaches you, and I’ll send as soon as the payment is confirmed: ${url}`,
    cardTitle: 'Deal safety check', cardLine: 'Before you pay, ask for a TrustGap link.',
    sellerCardLine: 'Before you send the item, ask them to pay through TrustGap.',
    disclaimer: 'This check is a guide. It can’t catch every scam and it doesn’t judge anyone: it checks the deal, not the seller or buyer.',
  },
};

// Questions: [id, weight, Pidgin, English, what it means when "yes" (Pidgin, English)]
const QUESTIONS = {
  buyer: [
    ['pay_first', 3, 'Dem say make you pay first enter their personal account?', 'Did they ask you to pay first into a personal account?',
      'Dem want make you pay first enter personal account: na the number one sign of scam.', 'Paying first into a personal account is the number one scam sign.'],
    ['deposit', 2, 'Dem ask you pay “delivery fee” or small deposit first?', 'Did they ask for a “delivery fee” or small deposit first?',
      'Small deposit first na common trick: once you pay, more “fees” go dey come.', 'A small deposit first is a common trick: once you pay, more “fees” follow.'],
    ['too_cheap', 2, 'The price too cheap pass wetin others dey sell am?', 'Is the price much lower than elsewhere?',
      'Price wey too sweet dey usually get story behind am.', 'A price that’s too good is often bait.'],
    ['pressure', 2, 'Dem dey rush you say “na today only” or “e remain one”?', 'Are they rushing you (“today only”, “only one left”)?',
      'Rushing you make you no get time to think.', 'Rushing you leaves no time to think.'],
    ['no_video', 2, 'Dem no gree do video call or send fresh video of the item?', 'Did they refuse a video call or a fresh video of the item?',
      'Seller wey get the item fit show am live.', 'A seller who has the item can show it live.'],
    ['name_mismatch', 2, 'The account name no match the business name?', 'Does the account name not match the business name?',
      'Account name wey no match the page na red flag.', 'An account name that doesn’t match the page is a red flag.'],
    ['new_page', 1, 'The page new, followers look fake, or dem off comments?', 'Is the page new, with fake-looking followers or comments switched off?',
      'New page or comments off fit mean dem dey hide bad reviews.', 'A new page or comments off can hide bad reviews.'],
    ['no_reviews', 1, 'You no fit find any real customer wey don buy from them?', 'You can’t find any real customer who bought from them?',
      'No real customer wey you fit confirm.', 'No real customer you could check with.'],
    ['no_refund', 1, 'Dem say “no refund, no return” even if the item spoil or fake?', 'Do they say “no refund, no return” even for a fake or damaged item?',
      '“No refund” even for fake item mean say you go carry the loss alone.', '“No refund” even for a fake item leaves all the risk with you.'],
  ],
  seller: [
    ['fake_alert', 3, 'Buyer send you payment alert or screenshot, but the money never land your account?', 'Did the buyer send an alert or screenshot, but the money isn’t in your account?',
      'Fake alert and edited screenshot na the main seller scam.', 'Fake alerts and edited screenshots are the main seller scam.'],
    ['overpay', 3, 'Buyer say dem “overpay” and make you refund the extra?', 'Did the buyer say they “overpaid” and ask you to refund the extra?',
      'The “refund the extra” story na scam: the first payment no real.', 'The “refund the extra” story is a scam: the first payment isn’t real.'],
    ['ship_first', 3, 'Buyer want make you send the item before the money land?', 'Does the buyer want the item sent before the money arrives?',
      'Sending before money land na how sellers dey lose goods.', 'Sending before the money arrives is how sellers lose goods.'],
    ['otp', 3, 'Buyer ask for your OTP, PIN, or make you click one link?', 'Did the buyer ask for your OTP or PIN, or to click a link?',
      'Nobody wey wan pay you go need your OTP or PIN.', 'Nobody paying you needs your OTP or PIN.'],
    ['pending', 2, 'Buyer say the transfer “dey pending” or go land tomorrow, make you send now?', 'Do they say the transfer is “pending” or will land tomorrow, so send now?',
      '“E dey pending” na common excuse to collect goods free.', '“It’s pending” is a common excuse to get goods free.'],
    ['pressure', 2, 'Buyer dey rush you, “my driver don reach your gate”?', 'Is the buyer rushing you (“my driver is at your gate”)?',
      'Rushing you make you no check your bank app.', 'Rushing you stops you checking your bank app.'],
    ['address', 1, 'The delivery address no clear, or dem change am after?', 'Is the delivery address unclear, or did it change after?',
      'Address wey dey change fit be trick.', 'An address that keeps changing can be a trick.'],
    ['new_account', 1, 'Buyer account new, no picture, no history?', 'Is the buyer’s account new, with no photo or history?',
      'Account wey just open fit be fake.', 'A brand-new account can be fake.'],
  ],
};

// Words in a pasted message that often come with scams (both languages; matched without case).
const PHRASES = [
  /pay\s*(?:me\s*)?first|first\s*pay/gi, /(?:my|personal)\s+account/gi, /\bdeposit\b/gi, /delivery\s+fee\s+first/gi,
  /today\s+only|na\s+today|last\s+(?:one|piece)|e\s+remain\s+one|only\s+one\s+left/gi, /\burgent(?:ly)?\b|quick\s+quick|asap/gi,
  /no\s+refund|no\s+return/gi, /\b(?:otp|pin|bvn)\b/gi, /over\s*-?\s*paid|overpay|refund\s+the\s+(?:extra|balance)/gi,
  /check\s+your\s+alert|i\s+(?:don|have|ve)\s+sen[td]|i\s+don\s+pay|transfer\s+receipt/gi, /\bpending\b/gi,
  /driver\s+(?:is\s+)?(?:at|for|don\s+reach)|my\s+driver/gi, /gift\s*card|crypto|usdt|western\s+union/gi, /click\s+(?:this|the)\s+link/gi,
];

let lang = (() => { try { return localStorage.getItem('tg_check_lang') || 'pcm'; } catch { return 'pcm'; } })();
let mode = 'buyer';
let answers = {};
let pasted = '';
let result = null;
const t = () => T[lang];
const ctaUrl = () => link(SITE.launched ? 'seller/signup.html' : 'sellers.html');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function findPhrases(text) {
  const marks = [];
  for (const re of PHRASES) for (const m of text.matchAll(re)) marks.push([m.index, m.index + m[0].length]);
  marks.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const m of marks) { const last = merged.at(-1); if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]); else merged.push([...m]); }
  return merged;
}
function highlighted(text, marks) {
  let out = '', at = 0;
  for (const [a, b] of marks) { out += esc(text.slice(at, a)) + `<mark>${esc(text.slice(a, b))}</mark>`; at = b; }
  return out + esc(text.slice(at));
}

function score() {
  const qs = QUESTIONS[mode];
  let points = 0, max = 0, flags = 0;
  const ids = [];
  for (const q of qs) {
    max += q[1];
    if (answers[q[0]] === 'yes') { points += q[1]; flags++; ids.push(q[0]); }
    else if (answers[q[0]] === 'unsure') points += q[1] / 2;
  }
  const marks = pasted.trim() ? findPhrases(pasted) : [];
  points += Math.min(4, marks.length); // words in the message add up to 4 points
  const level = points >= 7 ? 'high' : points >= 3 ? 'mid' : 'low';
  ids.sort((a, b) => weight(b) - weight(a));
  return { points, max, flags, total: qs.length, ids, marks, level, voice: chooseVoice(level, ids) };
}

// ---------------------------------------------------------------- the voice of each result
// The level never changes for the same answers; the words do. Each check picks a fresh headline,
// note, explanation for each red flag, WhatsApp message and picture line, never the one used last
// time on this device, so two checks of the same deal read differently.
const weight = (id) => QUESTIONS[mode].find((q) => q[0] === id)?.[1] || 0;
const key = (id) => (mode === 'seller' && id === 'pressure' ? 's_pressure' : id);
// A shuffle bag per kind of line: every version is used once before any repeats, and the next round
// never starts with the line just used. Kept for this visit only (sessionStorage).
function pickIndex(name, n, ok = () => true) {
  let bags = {};
  try { bags = JSON.parse(sessionStorage.getItem('tg_check_voice') || '{}'); } catch { /* private mode */ }
  const bag = bags[name] || { left: [], last: -1 };
  const allowed = [...Array(n).keys()].filter(ok);
  let left = bag.left.filter((i) => allowed.includes(i));
  if (!left.length) left = allowed.filter((i) => i !== bag.last);
  if (!left.length) left = allowed.length ? allowed : [0];
  const i = left[Math.floor(Math.random() * left.length)];
  bags[name] = { left: left.filter((x) => x !== i), last: i };
  try { sessionStorage.setItem('tg_check_voice', JSON.stringify(bags)); } catch { /* private mode */ }
  return i;
}
function chooseVoice(level, ids) {
  const heads = HEAD.en[mode][level];
  const needs = (i) => (heads[i].includes('{top2}') ? ids.length >= 2 : heads[i].includes('{top}') ? ids.length >= 1 : true);
  return {
    head: pickIndex(`head-${mode}-${level}`, heads.length, needs),
    note: pickIndex(`note-${mode}-${level}`, NOTE.en[mode][level].length),
    wa: pickIndex(`wa-${mode}`, WA.en[mode].length),
    card: pickIndex(`card-${mode}`, CARD.en[mode].length),
    alt: Object.fromEntries(ids.map((id) => [id, Math.random() < 0.5])),
  };
}
const fill = (text, r) => text
  .replace('{top2}', SHORT[lang][key(r.ids[1])] || '')
  .replace('{top}', SHORT[lang][key(r.ids[0])] || '')
  .replace('{n}', String(r.flags + r.marks.length))
  .replace(/^./, (c) => c.toUpperCase());
const headline = (L, r) => fill(HEAD[lang][mode][r.level][r.voice.head], r);
const noteText = (r) => fill(NOTE[lang][mode][r.level][r.voice.note], r);
const reasonText = (id, r) => {
  const q = QUESTIONS[mode].find((x) => x[0] === id);
  return r.voice.alt[id] ? REASON_ALT[lang][key(id)] : lang === 'pcm' ? q[4] : q[5];
};
const cardLine = (r) => CARD[lang][mode][r.voice.card];

// A short "thinking" moment before the result, so it feels like the page is looking at the deal.
function think(done) {
  const lines = THINKING[lang][mode];
  const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const box = $('#sc-result');
  box.innerHTML = String(html`<section class="card sc-thinking" aria-live="polite"><span class="sc-dots" aria-hidden="true"><i></i><i></i><i></i></span><p id="sc-think">${lines[0]}</p></section>`);
  box.scrollIntoView({ behavior: quick ? 'auto' : 'smooth', block: 'start' });
  let i = 0;
  const step = quick ? 350 : 380 + Math.random() * 120;
  const timer = setInterval(() => { i++; if (i < lines.length) $('#sc-think').textContent = lines[i]; }, step);
  setTimeout(() => { clearInterval(timer); done(); }, quick ? 350 : step * lines.length);
}

function render() {
  const L = t();
  document.documentElement.lang = L.lang;
  const qs = QUESTIONS[mode];
  const done = qs.filter((q) => answers[q[0]]).length;
  $('.page-hero .container').innerHTML = String(html`<p class="sc-lang">
      <button type="button" class="sc-lang-btn ${lang === 'pcm' ? 'on' : ''}" data-lang="pcm" aria-pressed="${lang === 'pcm'}">Pidgin</button>
      <button type="button" class="sc-lang-btn ${lang === 'en' ? 'on' : ''}" data-lang="en" aria-pressed="${lang === 'en'}">English</button></p>
    <h1>${L.title}</h1><p>${L.lead}</p><p class="sc-private">🔒 ${L.private}</p>`);
  show('.page-hero + .section .container', html`<div class="sc-wrap">
    <section class="card sc-card">
      <p class="label">${L.who}</p>
      <div class="sc-modes" role="tablist">
        <button type="button" role="tab" class="sc-mode ${mode === 'buyer' ? 'on' : ''}" data-mode="buyer" aria-selected="${mode === 'buyer'}">🛍️ ${L.buyer}</button>
        <button type="button" role="tab" class="sc-mode ${mode === 'seller' ? 'on' : ''}" data-mode="seller" aria-selected="${mode === 'seller'}">📦 ${L.seller}</button>
      </div>
      <ol class="sc-questions">${qs.map((q) => html`<li>
        <p>${lang === 'pcm' ? q[2] : q[3]}</p>
        <div class="sc-answers" role="group" aria-label="${lang === 'pcm' ? q[2] : q[3]}">
          ${['yes', 'no', 'unsure'].map((a) => html`<button type="button" class="sc-ans sc-${a} ${answers[q[0]] === a ? 'on' : ''}" data-q="${q[0]}" data-a="${a}" aria-pressed="${answers[q[0]] === a}">${L[a]}</button>`)}
        </div></li>`)}</ol>
      <label class="sc-paste" for="sc-paste"><strong>${L.paste}</strong><small>${L.pasteHint}</small>
        <textarea id="sc-paste" rows="4" placeholder="${L.pastePh}">${pasted}</textarea></label>
      <div class="sc-go"><span class="muted small">${L.answered(done, qs.length)}</span>
        <button type="button" class="btn btn-lg" id="sc-check">${L.check}</button></div>
    </section>
    <div id="sc-result">${result ? resultView(L) : ''}</div>
  </div>`);
}

function resultView(L) {
  const r = result;
  const note = noteText(r);
  const msg = WA[lang][mode][r.voice.wa](ctaUrl());
  return html`<section class="card sc-res sc-${r.level}" aria-live="polite">
    <div class="sc-meter" aria-hidden="true"><span style="width:${Math.min(100, Math.round(r.points / (r.max + 4) * 100) + 8)}%"></span></div>
    <p class="sc-flags">${r.level === 'high' ? '🚩🚩🚩' : r.level === 'mid' ? '🚩' : '✅'} ${L.flags(r.flags + r.marks.length)}</p>
    <h2>${headline(L, r)}</h2>
    <p>${note}</p>
    <h3>${L.why}</h3>
    ${r.ids.length ? html`<ul class="sc-reasons">${r.ids.map((id) => html`<li>${reasonText(id, r)}</li>`)}</ul>` : html`<p class="muted">${L.noFlags}</p>`}
    ${r.marks.length ? html`<p class="small"><strong>${L.inMessage}</strong></p><blockquote class="sc-msg">${raw(highlighted(pasted, r.marks))}</blockquote>` : ''}
    <div class="sc-safe"><h3>✅ ${L.safeWay}</h3><p>${mode === 'buyer' ? L.buyerSafe : L.sellerSafe}</p>
      <a class="btn btn-block btn-whatsapp" id="sc-wa" href="${`https://wa.me/?text=${encodeURIComponent(msg)}`}" target="_blank" rel="noopener">${mode === 'buyer' ? L.askSeller : L.askBuyer}</a>
      ${mode === 'seller' ? html`<a class="btn btn-block" href="${ctaUrl()}" id="sc-sell">${SITE.launched ? L.sellCta : L.earlyCta}</a>` : ''}
      <button type="button" class="btn btn-block btn-secondary" id="sc-share">📸 ${L.share}</button>
      <p class="small center"><a href="${link('how.html')}">${L.learn}</a> · <button type="button" class="linklike" id="sc-again">${L.again}</button></p></div>
    <p class="fine sc-disc">${L.disclaimer}</p>
  </section>`;
}


// The picture to post on WhatsApp status or Instagram stories.
function card() {
  const L = t(), r = result;
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const color = { low: '#0E7A4A', mid: '#9A5B00', high: '#B42318' }[r.level];
  g.fillStyle = '#0B1B3D'; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#F4F7FC'; g.font = 'bold 64px Roboto, Arial, sans-serif'; g.fillText('Trust', 80, 140);
  const w = g.measureText('Trust').width; g.font = '64px Roboto, Arial, sans-serif'; g.fillText('Gap', 80 + w, 140);
  g.fillStyle = '#9DB9F5'; g.font = '600 40px Roboto, Arial, sans-serif'; g.fillText(L.cardTitle.toUpperCase(), 80, 230);
  g.fillStyle = color; roundRect(g, 80, 300, 920, 520, 40); g.fill();
  g.fillStyle = '#FFFFFF'; g.font = '150px Roboto, Arial, sans-serif'; g.textAlign = 'center';
  g.fillText(r.level === 'low' ? '✅' : '🚩', 540, 500);
  g.font = 'bold 76px Roboto, Arial, sans-serif'; g.fillText(L.flags(r.flags + r.marks.length), 540, 640);
  g.font = '600 50px Roboto, Arial, sans-serif'; wrap(g, headline(L, r), 540, 730, 820, 60);
  g.fillStyle = '#F4F7FC'; g.font = '46px Roboto, Arial, sans-serif'; wrap(g, cardLine(r), 540, 960, 880, 60);
  g.fillStyle = '#C9D3EA'; g.font = '38px Roboto, Arial, sans-serif'; g.fillText(`${location.host}/check.html`, 540, 1200);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrap(g, text, x, y, max, lh) {
  const words = text.split(' '); let line = '', yy = y;
  for (const word of words) { const test = line ? `${line} ${word}` : word; if (g.measureText(test).width > max && line) { g.fillText(line, x, yy); line = word; yy += lh; } else line = test; }
  g.fillText(line, x, yy);
}
async function share() {
  const blob = await card();
  const file = new File([blob], 'trustgap-deal-check.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: `${cardLine(result)} ${location.origin}${location.pathname}` }); track('share', { method: 'native', content_type: 'safety_check' }); return; } catch { /* closed */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  $('#sc-share').textContent = '✓ ' + t().saved;
  track('share', { method: 'download', content_type: 'safety_check' });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.dataset.lang) { lang = b.dataset.lang; try { localStorage.setItem('tg_check_lang', lang); } catch { /* private mode */ } track('safety_check_language', { lang }); render(); }
  else if (b.dataset.mode) { pasted = $('#sc-paste')?.value || pasted; mode = b.dataset.mode; answers = {}; result = null; render(); }
  else if (b.dataset.q) { pasted = $('#sc-paste')?.value || pasted; answers[b.dataset.q] = b.dataset.a; const keep = scrollY; render(); scrollTo(0, keep); }
  else if (b.id === 'sc-check') {
    pasted = $('#sc-paste').value; result = null;
    const next = score();
    think(() => { result = next; render(); $('#sc-result').scrollIntoView({ block: 'start' }); });
    track('safety_check_done', { mode, level: next.level, flags: next.flags + next.marks.length, language: lang, pasted: Boolean(pasted.trim()) });
  }
  else if (b.id === 'sc-again') { answers = {}; pasted = ''; result = null; render(); scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (b.id === 'sc-share') share();
  else if (b.id === 'sc-wa') track('share', { method: 'whatsapp', content_type: mode === 'buyer' ? 'safety_check_ask_seller' : 'safety_check_ask_buyer' });
  else if (b.id === 'sc-sell') track('safety_check_cta', { cta: SITE.launched ? 'signup' : 'early_access' });
});

render();
