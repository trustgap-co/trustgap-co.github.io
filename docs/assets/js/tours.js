// The words and targets of each guided tour (see tour.js). Short, plain sentences: written for
// someone who has never paid or sold through a link like this before. Tours run only in the seller's
// account (dashboard, new link, price calculator, settings, order page) and for buyers on their deal
// link (step 1 and step 2) and tracking page: never on the public pages.
const visible = (sel) => () => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length) || null;
const fieldsetOf = (sel) => () => document.querySelector(sel)?.closest('fieldset') || null;
const headingNamed = (text) => () => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes(text)); return h ? h.closest('section') || h : null; };
const headingText = (text) => () => [...document.querySelectorAll('h1, h2')].find((h) => h.textContent.includes(text)) || null;
const summaryNamed = (text) => () => [...document.querySelectorAll('summary')].find((s) => s.textContent.includes(text))?.closest('details') || null;

export const TOURS = {

  dashboard: {
    invite: 'New here? Take a quick tour of your seller dashboard.',
    steps: [
      { el: '.stats', title: 'Your numbers at a glance', text: 'Orders to pack and ship, the money held for you, and deals completed.' },
      { el: 'a.btn[href*="seller/new.html"]', title: 'Create a payment link', text: 'Do this for every deal you agree on WhatsApp or Instagram, then send the link to the buyer.' },
      { el: 'a.btn[href*="seller/price.html"]', title: 'Price calculator', text: 'Not ready to make a link? Work out the exact price first, including delivery, and send the buyer the total.' },
      { el: headingNamed('Orders'), title: 'Your orders', text: 'When a buyer pays, the order appears here. Tap it to pack the item and book the courier.' },
      { el: headingNamed('Links waiting'), title: 'Links waiting for payment', text: 'Links you have sent that the buyer hasn’t paid yet. Open one to copy it again or change it.' },
      { el: visible('.app-nav a[href*="seller/settings.html"]'), title: 'Settings', text: 'Your bank account for payouts, your identity check and your invite link live here. Payout and identity must be done before you can create links.' },
    ],
  },

  'new-link': {
    invite: 'First payment link? Take a quick tour of this form.',
    steps: [
      { el: '[name=item_title]', title: 'Name the item', text: 'Exactly as you agreed with the buyer, e.g. “iPhone 13, 128GB, Midnight”.' },
      { el: '.photo-field', title: 'Take live photos', text: 'Photograph the actual item now with your phone camera. The buyer checks the item against these photos at the door, so they protect you too.' },
      { el: '[name=item_description]', title: 'Describe it honestly', text: 'Colour, size, model, what’s in the box and any defects. A clear description prevents disputes.' },
      { el: '[name=item_price]', title: 'The price you agreed', text: 'Type the item price. Fees and delivery are worked out for you below.' },
      { el: fieldsetOf('[name=pickup_address]'), title: 'Where the courier collects it', text: 'Your pickup address. Only the courier sees it, never the buyer.' },
      { el: fieldsetOf('[name=delivery_address]'), title: 'Where it’s going', text: 'Copy the buyer’s address from your chat. They will check it before paying.' },
      { el: fieldsetOf('[name=delivery_payer]'), title: 'Who pays what', text: 'Choose who pays delivery and who pays the fees, as you agreed: the buyer, you, or half each.' },
      { el: '#preview', title: 'The exact price', text: 'This box shows what the buyer pays and what you receive after delivery. It’s exactly what the link will charge.' },
      { el: '#deal > button.btn', title: 'Create and share', text: 'Tap Create link, then send it to the buyer in your chat. You’re paid after delivery and the buyer’s inspection.' },
    ],
  },

  price: {
    invite: 'Want to know the exact price before making a link? Take a quick tour.',
    steps: [
      { el: '[name=item_price]', title: 'The price you’re discussing', text: 'Type the item price you and the buyer are talking about.' },
      { el: fieldsetOf('[name=pickup_state]'), title: 'From you', text: 'Your pickup address and state. Delivery is priced between the two states.' },
      { el: fieldsetOf('[name=delivery_state]'), title: 'To the buyer', text: 'The buyer’s address and state, from your chat.' },
      { el: fieldsetOf('[name=delivery_payer]'), title: 'Who pays what', text: 'Try different choices and watch the total change, so you can agree the best deal.' },
      { el: '#result', title: 'The full price', text: 'What the buyer pays, what you receive, and the dispute fee rule, exactly as the link will charge.' },
      { el: '#for-buyer', title: 'Message for the buyer', text: 'A ready-made message with the total. Tap Copy message and paste it in your chat.' },
      { el: '#make', title: 'Make the link in one tap', text: 'Everything you typed here is carried to the payment link form. Add photos and the description, and you’re done.' },
    ],
  },

  pay: {
    invite: 'First time paying with TrustGap? Take a 30-second tour.',
    steps: [
      { el: '.seller-line', title: 'Who you’re buying from', text: 'The seller’s business name, and whether TrustGap has checked their identity.' },
      { el: '.seller-record', title: 'The seller’s record', text: 'How long they’ve been on TrustGap, their completed orders, and any disputes decided against them.' },
      { el: '.gallery', title: 'The item', text: 'The seller’s photos and description. At delivery you check the item matches these before giving your code.' },
      { el: '.callout.info', title: 'Your delivery address', text: 'Make sure it’s right. If it isn’t, don’t continue: ask the seller for a corrected link.' },
      { el: '.breakdown', title: 'Exactly what you pay', text: 'Item, delivery and fees, all shown now. Nothing is added later.' },
      { el: '.facts', title: 'Timing', text: 'When the seller must send it, and how long you have after delivery to check it and report a problem.' },
      { el: summaryNamed('protected'), title: 'How your money is protected', text: 'The seller is paid only after delivery and your inspection. If the item is wrong, damaged or fake, you get a refund.' },
      { el: '.confirm-box', title: 'Ready? Pay safely', text: 'Tick the box, confirm, then pay on the secure payment page. Your money is held until you have the item.' },
    ],
  },

  track: {
    invite: 'New to TrustGap? Take a quick tour of your order page.',
    steps: [
      { el: '.journey', title: 'Where your order is', text: 'Each step lights up as your order moves. Tap any step to see what it means.' },
      { el: '.next-step', title: 'What happens next', text: 'This line always tells you what’s happening now and whether you need to do anything.' },
      { el: '.pinbox', title: 'Your delivery code', text: 'The rider can’t complete the delivery without it. Open the parcel and check the item first, then give the code.' },
      { el: '#accept', title: 'All good? Release the payment', text: 'When you’re happy with the item, tap here and the seller is paid. If you do nothing, the seller is paid when your inspection time ends.' },
      { el: summaryNamed('Report a problem'), title: 'Something wrong?', text: 'Report it here with photos, before your inspection time ends. Your money stays held while TrustGap reviews.' },
      { el: () => [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Timeline') || null, title: 'Everything on record', text: 'Every step of your order, with the time. Keep this page: the link is in your SMS too.' },
    ],
  },

  'seller-order': {
    invite: 'First order? Take a quick tour of what to do.',
    steps: [
      { el: '.journey', title: 'Where the order is', text: 'Each step lights up as the order moves. Tap any step to see what it means for you.' },
      { el: '.next-step', title: 'Your next job', text: 'This line always tells you what to do now.' },
      { el: '[name=packing_note]', title: 'Write a packing note', text: 'Serial or IMEI number, colour, size, what’s in the box. It’s your evidence if there’s ever a dispute.' },
      { el: '#book button', title: 'Book the pickup', text: 'Once it’s packed, tap here. The courier collects it from your pickup address. Send it before the ship-by date.' },
      { el: () => [...document.querySelectorAll('p.small')].find((p) => p.textContent.startsWith('At handover')) || null, title: 'At the buyer’s door', text: 'The buyer checks the item, then gives the rider their delivery code. Never ask for the code before they have the item.' },
      { el: '.case-box', title: 'If there’s a dispute', text: 'Add your side with photos here. Packing photos or a video help most. TrustGap reads both sides before deciding.' },
    ],
  },

  settings: {
    invite: 'Setting up your account? Take a quick tour of this page.',
    steps: [
      { el: headingText('Payout account'), title: 'Where you get paid', text: 'Add the bank account your payouts go to. It must be in your own name or your business name; we check the name with the bank.' },
      { el: headingText('Identity'), title: 'Verify your identity', text: 'Enter your NIN and date of birth once. Buyers see a “✓ Identity verified” badge on your links, which helps them trust you.' },
      { el: '#marketing', title: 'News and offers', text: 'Optional. Messages about your deals and payouts always come, whatever you choose here.' },
      { el: '#invite', title: 'Invite sellers, earn free deals', text: 'Share your link with other sellers. Their first deals have no TrustGap fee, and you earn a free deal when they complete one.' },
      { el: visible('.app-nav a[href*="seller/new.html"]'), title: 'You’re ready', text: 'Once both are done, create your first payment link here or from your dashboard.' },
    ],
  },

  // Step 2 of a deal link. Buyers who finished the step 1 tour go straight on into this one.
  'pay-details': {
    after: 'pay',
    invite: 'Almost there. Want a quick tour of this last step?',
    steps: [
      { el: '[name=buyer_name]', title: 'Your name', text: 'As it appears on your bank account, so a refund can reach you if one is ever due.' },
      { el: '[name=buyer_phone]', title: 'Your phone number', text: 'The rider calls this number, and your delivery code and updates come here by SMS. Use a number you’ll have with you.' },
      { el: fieldsetOf('[name=refund_bank_code]'), title: 'Refund account', text: 'Only used if you’re owed a refund. It must be in your own name, and the seller never sees it.' },
      { el: '.pay-name-note', title: 'Who you’re paying', text: 'Pay only to the account or payment page TrustGap gives you, never to a seller’s own account.' },
      { el: '#pay > button.btn', title: 'Pay safely', text: 'Bank transfer gives you an account number for this order only, to pay from your bank app. Or pay with card. Either way, your money is held until you have the item and have checked it.' },
    ],
  },
};
