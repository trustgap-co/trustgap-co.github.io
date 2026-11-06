// The fun layer of the safety check: a named character for the main trick, the Wahala Meter, the
// money kept, notes on scam words, dare-a-friend messages, Red Flag Bingo and seasonal editions.
// Rules: laugh at the trick, never at the person checking; nothing they typed and no real name goes
// on the shared picture; low-risk results get no jokes.

// Characters named after the trick, never a person. [name, Pidgin line, English line]
export const VILLAINS = {
  pay_first: ['Oga Personal Account', 'Im account dey collect money pass bank.', 'His account takes in more money than a bank.'],
  deposit: ['The Deposit Collector', 'Deposit today, “clearing fee” tomorrow, “customs” next week.', 'Deposit today, “clearing fee” tomorrow, “customs” next week.'],
  too_cheap: ['Bone Straight Too Sweet', 'Price wey sweet pass Christmas rice.', 'A price sweeter than Christmas jollof.'],
  pressure: ['Aunty Today-Only', 'E don be “today only” since 2019.', 'It’s been “today only” since 2019.'],
  no_video: ['Mr Camera Shy', 'Im camera dey spoil anytime you ask for video.', 'Their camera breaks every time you ask for a video.'],
  name_mismatch: ['Mr Two Names', 'One name for the page, another name for the account.', 'One name on the page, another on the account.'],
  new_page: ['Page Wey Born Yesterday', 'Followers plenty, but nobody dey talk.', 'Plenty of followers, but nobody ever comments.'],
  no_reviews: ['Mr No Testimony', 'Plenty promise, zero customer wey fit talk.', 'Lots of promises, zero customers who can vouch.'],
  no_refund: ['Madam No Refund', 'Item never reach you, but “no refund” don already land.', 'The item hasn’t arrived, but “no refund” already has.'],
  fake_alert: ['Mr Screenshot Alert', 'Im alert dey enter your WhatsApp, e no dey enter your bank.', 'The alert reaches your WhatsApp, never your bank.'],
  overpay: ['Uncle Overpaid', 'E “mistakenly” pay you extra, now e want am back sharp sharp.', 'They “accidentally” paid extra and want it back right now.'],
  ship_first: ['Brother Send-Am-First', 'Im money go come “after”. After wetin?', 'The money will come “after”. After what?'],
  otp: ['The OTP Collector', 'E no want your item, na your bank account e want.', 'Not after your item: after your bank account.'],
  pending: ['Mr Pending Alert', 'Im transfer dey pending since last Christmas.', 'Their transfer has been pending since last Christmas.'],
  s_pressure: ['Driver Don Reach', 'Im driver always dey your gate before im money.', 'The driver is always at your gate before the money.'],
  address: ['Madam Change Address', 'Lekki today, Ikeja tomorrow, “my cousin house” next.', 'Lekki today, Ikeja tomorrow, “my cousin’s place” next.'],
  new_account: ['Mr Fresh Account', 'Account wey open this morning.', 'An account opened this morning.'],
  smooth: ['The Smooth Talker', 'Sweet mouth, no receipt.', 'Sweet talk, no receipt.'],
};
export const MET = { pcm: (n) => `You don meet ${n} 😂`, en: (n) => `You just met ${n} 😂` };
// Scam words in a pasted message point to a character when no question was answered "yes".
export const PHRASE_VILLAIN = ['pay_first', 'pay_first', 'deposit', 'deposit', 'pressure', 'pressure', 'no_refund', 'otp', 'overpay', 'fake_alert', 'pending', 's_pressure', 'smooth', 'otp'];

// A note for each kind of scam word (same order as PHRASES in check.js).
export const PHRASE_NOTES = {
  pcm: ['“Pay first” na the national anthem of scammers 🎺', 'That “personal account” dey get more customers pass bank 😂',
    'Deposit today, balance tomorrow, then “my mama dey hospital” 🙄', 'Next week na clearing fee, then customs, then “my mama dey hospital”.',
    'E don be “today only” since 2019 📅', 'Na only scammer dey always get “urgent” 🚨', '“No refund” for item wey you never see? Hmm 🤨',
    'OTP na your toothbrush: you no dey share am 🪥', 'Nobody dey “mistakenly” pay extra for this economy 😂', 'Alert wey only screenshot fit see 👻',
    '“Pending” since last Christmas ⏳', 'Driver wey always dey your gate before money land 🏍️', 'Gift card and crypto na “pay me where nobody fit find am” 🕳️',
    'Link wey dem beg you to click na trap door 🚪'],
  en: ['“Pay first” is the scammers’ national anthem 🎺', 'That “personal account” gets more customers than a bank 😂',
    'Deposit today, balance tomorrow, then “my mum is in hospital” 🙄', 'Next week it’s a clearing fee, then customs, then “my mum is in hospital”.',
    'It’s been “today only” since 2019 📅', 'Only scammers are always this “urgent” 🚨', '“No refund” on an item you haven’t even seen? Hmm 🤨',
    'Your OTP is like your toothbrush: you don’t share it 🪥', 'Nobody “accidentally” overpays in this economy 😂', 'An alert only the screenshot can see 👻',
    '“Pending” since last Christmas ⏳', 'The driver is always at your gate before the money lands 🏍️', 'Gift cards or crypto means “pay me where nobody can trace it” 🕳️',
    'A link they beg you to click is a trap door 🚪'],
};

// The Wahala Meter: 0 to 10, inside the level's band (low 0-3, mid 4-6, high 7-10).
export function wahala(points, level) {
  if (level === 'low') return Math.min(3, Math.round(points));
  if (level === 'mid') return Math.min(6, 4 + Math.floor((points - 3) / 2));
  return Math.min(10, 7 + Math.floor((points - 7) / 2));
}
const METER = {
  pcm: ['E calm', 'E calm', 'Small wahala', 'Small wahala', 'Wahala dey', 'Wahala dey', 'Wahala don land', 'Wahala don land', 'Na serious wahala o 😬', 'Na serious wahala o 😬', 'Run, no look back 🏃🏾‍♀️'],
  en: ['Calm', 'Calm', 'Small wahala', 'Small wahala', 'There’s wahala', 'There’s wahala', 'Wahala has landed', 'Wahala has landed', 'Serious wahala 😬', 'Serious wahala 😬', 'Run, don’t look back 🏃🏾‍♀️'],
};
export const meterLabel = (lang, m) => METER[lang][m];
export const METER_TITLE = { pcm: 'Wahala Meter', en: 'Wahala Meter' };

// The money kept (only when they enter an amount, only on mid and high results). {amt} = ₦85,000
export const SAVED = {
  pcm: {
    buyer: ['You just stop {amt} from going on holiday to stranger account 🏖️', '{amt} still dey your pocket. Na so e suppose be 💪', 'Na {amt} you just save from “I go send am tomorrow” 😮‍💨'],
    seller: ['Goods worth {amt} still dey your hand 📦', 'You just stop {amt} from waka comot with “I don pay” 😮‍💨', '{amt} of your goods no go follow fake alert go house 💪'],
  },
  en: {
    buyer: ['You just stopped {amt} from going on holiday to a stranger’s account 🏖️', '{amt} is still in your pocket. That’s how it should be 💪', 'That’s {amt} saved from “I’ll send it tomorrow” 😮‍💨'],
    seller: ['Goods worth {amt} are still in your hands 📦', 'You just stopped {amt} walking off with “I’ve paid” 😮‍💨', '{amt} of your goods won’t follow a fake alert home 💪'],
  },
};
export const AMOUNT_LABEL = {
  pcm: { buyer: 'How much dem want make you pay?', seller: 'How much the item cost?', hint: 'E no compulsory. We no dey put am for any picture.' },
  en: { buyer: 'How much do they want you to pay?', seller: 'How much is the item worth?', hint: 'Optional. It isn’t saved anywhere.' },
};

// Share text that dares a friend. {m} meter, {v} character, {u} link
export const DARE = {
  pcm: {
    risky: ['I almost pay o 😭 Wahala Meter: {m}/10. Check your own deal before that wig money comot: {u}', 'I just meet {v} 😂 Wahala Meter {m}/10. Tag that friend wey dey always “pay first” 👀 {u}',
      'Wahala Meter {m}/10 🚩 Before you send money for Instagram vendor, check am here first: {u}'],
    calm: ['I check my deal before I pay. Wahala Meter {m}/10. Check your own before you send money: {u}', 'Small check before I pay, e no cost anything. Try am for your next deal: {u}',
      'I no dey pay first again. Check your deal before you send money: {u}'],
    risky_s: ['Buyer nearly use me 😭 Wahala Meter: {m}/10. Seller, check your buyer before you send that item: {u}', 'I just meet {v} 😂 Wahala Meter {m}/10. Tag that seller wey dey believe every screenshot 👀 {u}',
      'Wahala Meter {m}/10 🚩 Before you send goods because of “I don pay”, check am here: {u}'],
    calm_s: ['I check my buyer before I send. Wahala Meter {m}/10. Seller, check your own: {u}', 'Small check before I send the item, e no cost anything. Try am for your next order: {u}',
      'I no dey send before money land again. Check your buyer here: {u}'],
  },
  en: {
    risky: ['I almost paid 😭 Wahala Meter: {m}/10. Check your own deal before that wig money leaves: {u}', 'I just met {v} 😂 Wahala Meter {m}/10. Tag the friend who always “pays first” 👀 {u}',
      'Wahala Meter {m}/10 🚩 Before you pay that Instagram vendor, check here first: {u}'],
    calm: ['I checked my deal before paying. Wahala Meter {m}/10. Check yours before you send money: {u}', 'A quick check before I paid, and it’s free. Try it on your next deal: {u}',
      'I don’t pay first anymore. Check your deal before you send money: {u}'],
    risky_s: ['A buyer nearly got me 😭 Wahala Meter: {m}/10. Sellers, check your buyer before you send that item: {u}', 'I just met {v} 😂 Wahala Meter {m}/10. Tag the seller who believes every screenshot 👀 {u}',
      'Wahala Meter {m}/10 🚩 Before you send goods because of “I’ve paid”, check here: {u}'],
    calm_s: ['I checked my buyer before sending. Wahala Meter {m}/10. Sellers, check yours: {u}', 'A quick check before I sent the item, and it’s free. Try it on your next order: {u}',
      'I don’t send before the money lands anymore. Check your buyer here: {u}'],
  },
};
export const DARE_BUTTON = { pcm: '😂 Dare your friend make e check', en: '😂 Dare a friend to check' };

// Red Flag Bingo: the squares for each mode (3 by 3). Buyers: the 9 questions. Sellers: the 8 questions
// and "scam words" from the pasted message.
export const BINGO = {
  buyer: ['pay_first', 'deposit', 'too_cheap', 'pressure', 'no_video', 'name_mismatch', 'new_page', 'no_reviews', 'no_refund'],
  seller: ['fake_alert', 'overpay', 'ship_first', 'otp', 'pending', 's_pressure', 'address', 'new_account', 'words'],
};
export const BINGO_LABEL = {
  pcm: { pay_first: 'Pay first', deposit: 'Deposit first', too_cheap: 'Too cheap', pressure: 'Today only', no_video: 'No video', name_mismatch: 'Two names',
    new_page: 'New page', no_reviews: 'No testimony', no_refund: 'No refund', fake_alert: 'Fake alert', overpay: 'Overpaid', ship_first: 'Send first',
    otp: 'OTP ask', pending: 'E dey pending', s_pressure: 'Driver don reach', address: 'Address dey shift', new_account: 'New account', words: 'Scam words' },
  en: { pay_first: 'Pay first', deposit: 'Deposit first', too_cheap: 'Too cheap', pressure: 'Today only', no_video: 'No video', name_mismatch: 'Two names',
    new_page: 'New page', no_reviews: 'No reviews', no_refund: 'No refund', fake_alert: 'Fake alert', overpay: 'Overpaid', ship_first: 'Send first',
    otp: 'OTP request', pending: 'Pending', s_pressure: 'Driver is here', address: 'Moving address', new_account: 'New account', words: 'Scam words' },
};
export const BINGO_TEXT = {
  pcm: { title: 'Red Flag Bingo', got: (n, t) => `You catch ${n}/${t}`, bingo: 'BINGO! 😱 Full line of red flags' },
  en: { title: 'Red Flag Bingo', got: (n, t) => `You got ${n}/${t}`, bingo: 'BINGO! 😱 A full line of red flags' },
};
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const hasBingo = (on) => LINES.some((l) => l.every((i) => on[i]));

// Seasonal editions, by month (Lagos time is close enough to the phone's own clock here).
export function edition(d = new Date()) {
  const m = d.getMonth() + 1;
  if (m >= 9 && m <= 11) return 'ember';
  if (m === 12) return 'detty';
  if (m === 1) return 'newyear';
  return null;
}
export const EDITION = {
  ember: { pcm: ['Ember Months Edition 🍂', 'Ember months don come: scammers sef dey find Christmas money. No give them yours.'],
    en: ['Ember Months Edition 🍂', 'The ember months are here: scammers want Christmas money too. Don’t give them yours.'] },
  detty: { pcm: ['Detty December Edition 🎄', 'Christmas bonus no be for scammers 🎄'], en: ['Detty December Edition 🎄', 'Your Christmas bonus is not for scammers 🎄'] },
  newyear: { pcm: ['New Year Edition 🎉', 'New year, new rule: no more pay-first 🎉'], en: ['New Year Edition 🎉', 'New year, new rule: no more paying first 🎉'] },
};
