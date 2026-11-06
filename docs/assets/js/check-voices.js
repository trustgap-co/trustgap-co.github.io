// The safety check's many voices. The level (low, mid, high) always comes from the answers, so the
// same answers always give the same level; only the way it is said changes from one check to the next.
// Each list has the same number of lines in Pidgin and English, so switching language keeps the same
// "mood". {top} is replaced by the most serious red flag found, {top2} by the second, {n} by the count;
// a line that needs one only appears when there is one.

export const SHORT = {
  pcm: {
    pay_first: 'pay-first enter personal account', deposit: 'deposit first', too_cheap: 'price wey too sweet',
    pressure: '“na today only” rush', no_video: 'no video', name_mismatch: 'account name wey no match',
    new_page: 'new page', no_reviews: 'no real customer', no_refund: '“no refund” talk',
    fake_alert: 'alert wey no land', overpay: '“refund the extra” story', ship_first: 'send-before-pay',
    otp: 'OTP request', pending: '“e dey pending” story', s_pressure: '“driver don reach” rush',
    address: 'address wey dey change', new_account: 'new account',
  },
  en: {
    pay_first: 'paying first into a personal account', deposit: 'a deposit first', too_cheap: 'a too-good price',
    pressure: 'the “today only” rush', no_video: 'no video', name_mismatch: 'a mismatched account name',
    new_page: 'a brand-new page', no_reviews: 'no real customers', no_refund: 'the “no refund” rule',
    fake_alert: 'an alert that never landed', overpay: 'the “refund the extra” story', ship_first: 'send before paying',
    otp: 'an OTP request', pending: 'the “pending” story', s_pressure: 'the “driver is here” rush',
    address: 'a changing address', new_account: 'a brand-new account',
  },
};

// A second way to explain each red flag (the first is in check.js).
export const REASON_ALT = {
  pcm: {
    pay_first: 'Personal account no get anybody wey go answer you if wahala happen. Na why scammers like am.',
    deposit: 'Today na “deposit”, tomorrow na “clearing fee”, next tomorrow na “customs”. E no dey end.',
    too_cheap: 'If e cheap reach like that, ask yourself why dem no sell am for the normal price.',
    pressure: 'Real seller fit wait you small. Na scammer no wan make you think twice.',
    no_video: 'Picture fit come from anywhere for internet. Live video hard to fake.',
    name_mismatch: 'Business name one thing, account name another thing? Ask question before money comot.',
    new_page: 'Page wey born yesterday, with followers wey no dey talk, need extra care.',
    no_reviews: 'If nobody fit talk say “I don buy from them”, you go be the first person wey test am.',
    no_refund: 'Honest seller no dey fear return if the item correct.',
    fake_alert: 'Na only your bank app get the final say. Screenshot fit be Photoshop.',
    overpay: 'Nobody dey mistakenly pay extra then rush you to return am. Na the oldest trick.',
    ship_first: 'Once the item comot your hand without money, e hard to collect am back.',
    otp: 'Your OTP na your key. Who wan pay you no need am at all.',
    pending: 'Money wey “dey pending” no be money yet. Wait make e land.',
    s_pressure: 'Driver fit wait five minutes make you confirm. Rush na red flag.',
    address: 'If the address dey shift, the item fit enter where you no go find am again.',
    new_account: 'Account wey just open, no picture, no history: e fit be throwaway account.',
  },
  en: {
    pay_first: 'A personal account has no one to answer to if things go wrong. That’s why scammers love it.',
    deposit: 'Today it’s a “deposit”, tomorrow a “clearing fee”, then “customs”. It never ends.',
    too_cheap: 'If it’s that cheap, ask why they aren’t selling it at the normal price.',
    pressure: 'A real seller can give you a moment. Only a scammer needs you not to think twice.',
    no_video: 'Photos can come from anywhere online. A live video is hard to fake.',
    name_mismatch: 'One name on the page, another on the account? Ask before any money moves.',
    new_page: 'A page born yesterday, with followers who never comment, needs extra care.',
    no_reviews: 'If nobody can say “I bought from them”, you’d be the one testing it.',
    no_refund: 'An honest seller isn’t afraid of returns when the item is right.',
    fake_alert: 'Only your bank app has the final word. A screenshot can be edited.',
    overpay: 'Nobody “accidentally” pays extra and then rushes you to send it back. It’s the oldest trick.',
    ship_first: 'Once the item leaves your hands without money, it’s hard to get back.',
    otp: 'Your OTP is your key. Someone paying you never needs it.',
    pending: 'Money that’s “pending” isn’t money yet. Wait until it lands.',
    s_pressure: 'A driver can wait five minutes while you confirm. Rushing is the red flag.',
    address: 'If the address keeps moving, the item can end up somewhere you’ll never find it.',
    new_account: 'A brand-new account with no photo or history can be a throwaway.',
  },
};

// Headlines: [buyer][level], [seller][level]
export const HEAD = {
  pcm: {
    buyer: {
      low: ['E look calm, but shine your eye', 'So far so good 👀', 'Small small, e dey okay', 'No wahala yet, but no relax'],
      mid: ['Hold your money small', 'Hmm, dis one need second look 🤔', '{top}? Ask question first', 'Wait first, no rush am'],
      high: ['Omo, no pay yet!', '{top} + {top2}? Dis one get as e be 😬', 'Red light! 🚨 Hold your money', 'Abeg no send that money yet'],
    },
    seller: {
      low: ['E look okay, but confirm the money', 'So far so good 👀', 'E dey calm, just check your bank app', 'No wahala yet, but confirm first'],
      mid: ['Confirm the money first', 'Hmm, dis buyer need second look 🤔', '{top}? Check am well first', 'No send anything yet, check first'],
      high: ['Omo, no send the item!', '{top} + {top2}? Dis one na pure red flag 😬', 'Red light! 🚨 Hold your goods', 'Abeg keep the item for your hand'],
    },
  },
  en: {
    buyer: {
      low: ['Looks calm, but stay alert', 'So far, so good 👀', 'Mostly fine, keep watching', 'Nothing alarming yet, but don’t relax'],
      mid: ['Hold your money for now', 'Hmm, this one needs a second look 🤔', '{top}? Ask questions first', 'Pause before you pay'],
      high: ['Don’t pay yet!', '{top} and {top2}? That’s a bad mix 😬', 'Red light! 🚨 Hold your money', 'Please don’t send that money yet'],
    },
    seller: {
      low: ['Looks okay, but confirm the money', 'So far, so good 👀', 'Calm so far, just check your bank app', 'Nothing alarming yet, but confirm first'],
      mid: ['Confirm the money first', 'Hmm, this buyer needs a second look 🤔', '{top}? Check carefully first', 'Don’t send anything yet'],
      high: ['Don’t send the item!', '{top} and {top2}? Pure red flags 😬', 'Red light! 🚨 Hold your goods', 'Keep the item in your hands'],
    },
  },
};

// The line under the headline.
export const NOTE = {
  pcm: {
    buyer: {
      low: [
        'We no see plenty red flag. But scam fit still happen: pay through protection make your money dey safe till the item reach you.',
        'The deal look normal from wetin you tell us. Even so, money wey you send straight to account no get way back.',
        'E no look like scam for now. But na when e look sweet pass, people dey fall. Protect yourself anyway.',
        'You don ask the right questions. Make the last step safe too: pay with protection.',
      ],
      mid: [
        'Some things no too clear. No send money straight to anybody account. Ask make una use protection.',
        'No be say na scam, but e get gap wey fit pain you. Close the gap before you pay.',
        'Small doubt dey for this one. If the seller serious, e no go fear protection.',
        'Your mind dey talk to you for a reason. Slow down small, ask for TrustGap link.',
      ],
      high: [
        'Many things for this deal na the way scammers dey do am. Do not send money to their account. If dem no gree use protection, waka.',
        'We don see this kind story before, and e no dey end well. Make you no be the next person.',
        '{n} red flags na plenty. Real seller go understand if you ask for protection. Scammer go vex or disappear.',
        'Your money too important to gamble. If dem no gree TrustGap, na your answer be that.',
      ],
    },
    seller: {
      low: [
        'E look okay. But no send the item until the money don truly land, no be screenshot.',
        'Buyer look normal from wetin you tell us. Still, na bank app you go believe, no be talk.',
        'Nothing serious for now. Make the payment pass protection and you go sleep well.',
        'Good questions you ask. One more step: collect through TrustGap and no worry about fake alert.',
      ],
      mid: [
        'Some things no too clear. Confirm the money for your bank app, no be alert or screenshot, before you send anything.',
        'E no mean say na scam, but e get gap. No let your goods enter that gap.',
        'Serious buyer no go fear to pay through protection. Ask am.',
        'Take am easy. Na people wey rush dey lose goods.',
      ],
      high: [
        'Many things for this deal na the way fake buyers dey do am. No send the item and no refund any “extra”. Ask make dem pay through protection.',
        'This one get all the signs. Keep your goods. Real buyer go pay first through TrustGap.',
        '{n} red flags for one buyer na too much. No let sweet mouth carry your goods.',
        'Fake buyers dey count on rush and pity. No give them either.',
      ],
    },
  },
  en: {
    buyer: {
      low: [
        'We didn’t see many red flags. Scams can still happen, so pay with protection and your money stays safe until the item reaches you.',
        'The deal looks normal from what you told us. Even so, money sent straight to an account has no way back.',
        'Nothing looks like a scam right now. But people fall when it looks sweetest. Protect yourself anyway.',
        'You asked the right questions. Make the last step safe too: pay with protection.',
      ],
      mid: [
        'Some things aren’t clear. Don’t send money straight to anyone’s account. Ask to use protection.',
        'It may not be a scam, but there’s a gap that could hurt you. Close it before you pay.',
        'There’s some doubt here. A serious seller won’t be afraid of protection.',
        'Your gut is telling you something. Slow down and ask for a TrustGap link.',
      ],
      high: [
        'Much of this deal looks like how scammers work. Don’t send money to their account. If they refuse protection, walk away.',
        'We’ve seen this story before, and it doesn’t end well. Don’t be the next one.',
        '{n} red flags is a lot. A real seller will understand if you ask for protection. A scammer will get angry or disappear.',
        'Your money matters too much to gamble. If they refuse TrustGap, that’s your answer.',
      ],
    },
    seller: {
      low: [
        'Looks fine. Still, don’t send the item until the money has really arrived, not just a screenshot.',
        'The buyer seems normal from what you told us. Still, trust your bank app, not their word.',
        'Nothing serious for now. Run the payment through protection and sleep well.',
        'Good questions. One more step: collect through TrustGap and stop worrying about fake alerts.',
      ],
      mid: [
        'Some things aren’t clear. Confirm the money in your bank app, not an alert or screenshot, before you send anything.',
        'It doesn’t mean it’s a scam, but there’s a gap. Don’t let your goods fall into it.',
        'A serious buyer won’t mind paying through protection. Ask them.',
        'Take it easy. People who rush are the ones who lose goods.',
      ],
      high: [
        'Much of this deal looks like how fake buyers work. Don’t send the item and don’t refund any “extra”. Ask them to pay through protection.',
        'This one has all the signs. Keep your goods. A real buyer will pay first through TrustGap.',
        '{n} red flags from one buyer is too many. Don’t let sweet talk carry your goods away.',
        'Fake buyers count on rush and pity. Give them neither.',
      ],
    },
  },
};

// While the page "thinks" (about a second).
export const THINKING = {
  pcm: { buyer: ['Dey look the account matter…', 'Dey check the price…', 'Dey read wetin dem talk…', 'Dey count the red flags…'],
    seller: ['Dey look the payment matter…', 'Dey check the buyer story…', 'Dey read wetin dem talk…', 'Dey count the red flags…'] },
  en: { buyer: ['Looking at the payment details…', 'Checking the price…', 'Reading what they said…', 'Counting the red flags…'],
    seller: ['Looking at the payment…', 'Checking the buyer’s story…', 'Reading what they said…', 'Counting the red flags…'] },
};

// Ready WhatsApp messages to the other side (one picked each time).
export const WA = {
  pcm: {
    buyer: [
      (u) => `Hello! I like the item and I ready to buy. Abeg make we do am through TrustGap: my money go dey safe till the item reach me, and you go collect your money once I confirm. E no dey cost you anything to start: ${u}`,
      (u) => `Good day! I don ready to pay, but I dey use TrustGap now for online deals. You go see the money before you send, and I go see the item before you collect. Fair for both of us: ${u}`,
      (u) => `Hi! Abeg no vex, I no dey pay straight to account again. If you fit send me TrustGap link, I go pay sharp sharp: ${u}`,
    ],
    seller: [
      (u) => `Hello! To make am safe for both of us, abeg pay through TrustGap. Your money go dey safe till the item reach you, and I go send immediately the payment confirm: ${u}`,
      (u) => `Hi! I dey sell with TrustGap now: you pay, TrustGap hold am, I send, you check, then I collect. Nobody fit cheat anybody: ${u}`,
      (u) => `Good day! Abeg I no dey send before payment confirm. Pay through TrustGap make we both rest: ${u}`,
    ],
  },
  en: {
    buyer: [
      (u) => `Hello! I like the item and I’m ready to buy. Can we do it through TrustGap? My money stays safe until the item reaches me, and you’re paid once I confirm. It costs you nothing to start: ${u}`,
      (u) => `Good day! I’m ready to pay, but I use TrustGap for online deals now. You see the money before you send, and I see the item before you’re paid. Fair for both of us: ${u}`,
      (u) => `Hi! No offence, but I don’t pay straight into accounts anymore. If you can send me a TrustGap link, I’ll pay right away: ${u}`,
    ],
    seller: [
      (u) => `Hello! To keep it safe for both of us, please pay through TrustGap. Your money stays safe until the item reaches you, and I’ll send as soon as the payment is confirmed: ${u}`,
      (u) => `Hi! I sell with TrustGap now: you pay, TrustGap holds it, I send, you check, then I’m paid. Nobody can cheat anybody: ${u}`,
      (u) => `Good day! I don’t send before payment is confirmed. Please pay through TrustGap so we can both relax: ${u}`,
    ],
  },
};

// The line on the shared picture.
export const CARD = {
  pcm: { buyer: ['Before you pay, ask for TrustGap link.', 'No pay straight to account. Use TrustGap.', 'Shine your eye. Pay with protection.'],
    seller: ['Before you send the item, make dem pay through TrustGap.', 'No send before money land. Use TrustGap.', 'Fake alert no go catch you. Use TrustGap.'] },
  en: { buyer: ['Before you pay, ask for a TrustGap link.', 'Don’t pay straight into accounts. Use TrustGap.', 'Stay sharp. Pay with protection.'],
    seller: ['Before you send the item, ask them to pay through TrustGap.', 'Don’t send before the money lands. Use TrustGap.', 'No more fake alerts. Use TrustGap.'] },
};
