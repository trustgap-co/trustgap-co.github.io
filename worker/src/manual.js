// The TrustGap team manual. Served only to the admin and signed-in team members (GET /api/manual),
// never published on the website. Edit the wording here and redeploy the Worker. Bump `updated`.
// Each section is plain HTML: headings, paragraphs, lists and tables only.

export const MANUAL = {
  updated: '2026-10-31',  // dispute fee, deal limit, delivery as a TrustGap service
  sections: [
    {
      id: 'start',
      title: 'Start here',
      html: `
<p>This manual explains how TrustGap works from end to end, so you can answer buyers and sellers, follow an order and know when to pass something to the admin. Read it once fully, then keep it open while you work.</p>
<h3>TrustGap in one paragraph</h3>
<p>Buyers on WhatsApp and Instagram are afraid to pay first; sellers are afraid to ship first. TrustGap sits in the middle. The seller sends a TrustGap payment link. The buyer reviews the deal and pays TrustGap. The money is held while the item is delivered and checked. The seller is paid only after delivery and the inspection window. If something goes wrong, TrustGap reviews the evidence and decides who gets what, using rules both sides agreed to before paying.</p>
<h3>Your role</h3>
<ul>
<li>You talk to buyers and sellers, find out what happened, collect evidence and keep them informed.</li>
<li>You work through the tasks the admin assigns you on the team portal.</li>
<li><strong>You decide a dispute only when the admin gives you a “Decide a dispute” task for that order.</strong> Then you can decide that one dispute, with the same rules and checks as the admin, until the task is done. Every decision is recorded under your name. Otherwise you never decide or move money: you tell people what the rules say and what happens next, not what the decision will be.</li>
</ul>
<h3>Words we use, and words we never use</h3>
<ul>
<li>Say: “payment secured”, “held by TrustGap”, “released to the seller”, “refunded to your account”.</li>
<li>Never say “escrow”, “guaranteed” or “insured”. TrustGap is not a bank and does not guarantee items or sellers. It runs a defined process.</li>
<li>Never promise an outcome (“you will definitely get your money back”). Say what the rules are and that TrustGap reviews the evidence.</li>
</ul>`,
    },
    {
      id: 'people',
      title: 'Who is involved',
      html: `
<table>
<tr><th>Who</th><th>What they do</th></tr>
<tr><td>Seller</td><td>Signs up, verifies their identity (NIN) and payout bank account, creates payment links, packs and hands the item to the courier.</td></tr>
<tr><td>Buyer</td><td>Gets a link from the seller. No account. Reviews the deal, pays, gives the rider a PIN after checking the item, reports problems.</td></tr>
<tr><td>Rider / courier</td><td>Fez Delivery (or our own rider during the pilot). Collects from the seller, delivers, takes the buyer’s PIN, brings returns back.</td></tr>
<tr><td>Admin</td><td>Runs TrustGap: decides disputes, moves money, manages sellers, assigns your tasks.</td></tr>
<tr><td>You (team)</td><td>Customer relations: contact, follow-up, evidence, explaining the process.</td></tr>
</table>
<h3>Partners behind the scenes</h3>
<ul>
<li><strong>Flutterwave</strong>: takes the buyer’s payment and sends payouts and refunds. Its checkout page shows our registered business name, <em>Tubalcain Ads Enterprise</em>, not “TrustGap”. That is normal; reassure buyers it is us.</li>
<li><strong>Monnify</strong>: checks a seller’s NIN matches their name.</li>
<li><strong>Fez Delivery</strong>: the courier. Each delivery and each return is a Fez order.</li>
<li><strong>Make.com and KudiSMS</strong>: send our SMS and emails.</li>
<li><strong>Google Sheets</strong>: a read-only copy of the data for reports. Changing the sheet changes nothing in the system.</li>
</ul>`,
    },
    {
      id: 'deal',
      title: 'A deal from start to finish',
      html: `
<ol>
<li><strong>Seller signs up.</strong> Name, business name, phone and email; ticks the Terms of Service and Seller Terms (required). Logs in with a code by SMS, no password. Adds a payout account in their own name and verifies their NIN.</li>
<li><strong>Seller creates a link.</strong> Item, condition, price, 1 to 4 photos, the buyer’s delivery address, parcel weight, who pays delivery and fees, how many days to hand it to the courier (1 to 7), and when the link expires (1, 6, 24 or 72 hours). They confirm in a pop-up that the item is in the condition described, and that if it isn’t they pay both delivery trips. The deal amount is limited to ₦300,000 during the pilot.</li>
<li><strong>Buyer, step 1: review.</strong> The buyer sees the item, photos, seller, address, every fee and the rules. They must tick “I agree to the Terms of Service…” and accept a pop-up: changing their mind or refusing a correct item costs twice the delivery fee (the naira amount is shown). Both are saved with the order.</li>
<li><strong>Buyer, step 2: pay.</strong> Name, phone, email and a refund account in their own name (we check the name matches). They pay on Flutterwave’s page.</li>
<li><strong>Payment secured.</strong> Both get an SMS. The buyer gets a 4-digit delivery PIN (SMS and tracking page). The seller must book pickup before the ship-by time.</li>
<li><strong>Seller books pickup.</strong> They write a packing note (serial number, colour, size, what is in the box). That note is evidence later.</li>
<li><strong>Delivery.</strong> The buyer checks the item at the door, then gives the rider the PIN. That marks it delivered.</li>
<li><strong>Inspection window</strong> (currently 24 hours) starts at delivery. The buyer can confirm everything is fine, or report a problem.</li>
<li><strong>Seller paid.</strong> When the buyer confirms or the window ends with no report, the payout goes to the seller’s account. Flutterwave settles our collections the next working day, so payouts go out the working day after the buyer paid, at the earliest.</li>
</ol>
<p>If anyone asks “where is my money?”, find the order and tell them which of these steps it is at.</p>`,
    },
    {
      id: 'statuses',
      title: 'Order statuses',
      html: `
<table>
<tr><th>Status</th><th>Means</th><th>What to tell people</th></tr>
<tr><td>Awaiting payment</td><td>The buyer started paying but it hasn’t been confirmed.</td><td>If they paid, it usually confirms within minutes. Checkouts not paid within about 2 hours are cancelled; the buyer can try again from the link if it hasn’t expired.</td></tr>
<tr><td>Paid</td><td>Money held. Waiting for the seller to book pickup.</td><td>Seller: book pickup before the ship-by time. Buyer: the seller has until that time.</td></tr>
<tr><td>Shipping</td><td>With the courier.</td><td>Check the item before giving the PIN.</td></tr>
<tr><td>Delivered</td><td>PIN given; inspection window running.</td><td>Report any problem before the window ends, with photos.</td></tr>
<tr><td>Disputed</td><td>A problem was reported, or the seller missed the ship-by time, or the parcel was refused or returned. Money held.</td><td>TrustGap is reviewing. Collect their evidence for the admin.</td></tr>
<tr><td>Completed</td><td>The seller has been paid (or paid part, after a decision).</td><td>Payout timing as above.</td></tr>
<tr><td>Refunded</td><td>The buyer has been refunded (in full or in part).</td><td>Refunds go to the account they gave in step 2. Allow up to a working day after settlement.</td></tr>
<tr><td>Cancelled</td><td>Checkout never paid.</td><td>Nothing was taken.</td></tr>
<tr><td>Duplicate refunded</td><td>The deal was paid twice; the second payment was refunded in full.</td><td>The refund is automatic.</td></tr>
</table>`,
    },
    {
      id: 'fees',
      title: 'Fees and the early-access code',
      html: `
<ul>
<li><strong>TrustGap fee:</strong> 1.5% of the item price, minimum ₦100, maximum ₦3,000.</li>
<li><strong>Payment processing:</strong> Flutterwave’s charge passed on at cost: 2% (capped at ₦2,000) plus up to ₦57.79 payout fee.</li>
<li>The two together are never more than ₦5,058, however big the deal.</li>
<li><strong>Delivery:</strong> the courier’s price for the route and weight, shown before the link is sent.</li>
<li><strong>Minimum price:</strong> the item price must be at least twice the delivery fee for that route, so if a buyer refuses a correct item, what they paid covers both delivery trips. Sellers see the minimum on the create-link screen.</li>
<li>For each of delivery and fees, the seller chooses who pays: the buyer, the seller, or half each. The buyer sees it all before paying.</li>
</ul>
<h3>Early-access code EARLYGAP</h3>
<ul>
<li>Removes the TrustGap fee (never the processing or delivery) from one deal.</li>
<li>A seller can use it on one link; a buyer on one order (it removes the buyer’s share of the fee only).</li>
<li>It doesn’t work if the seller pays the fee, or the link already has no TrustGap fee. It ends on 31 January 2027 or after 1,000 uses.</li>
</ul>`,
    },
    {
      id: 'problems',
      title: 'Problems and disputes',
      html: `
<h3>How a problem is reported</h3>
<ul>
<li>The buyer uses <strong>Report a problem</strong> on their tracking page: before delivery, or within the inspection window after it.</li>
<li>For wrong, damaged, fake or not-as-described items, at least one photo is required (up to 2).</li>
<li>Disputes also open automatically when the seller misses the ship-by time, when the buyer refuses the parcel at the door, or when the courier returns it.</li>
</ul>
<h3>One case, every side’s account</h3>
<p>There is only ever one case per problem. Whoever reports first opens it; the buyer, the seller and the rider (or Fez) then <strong>add their side</strong> to it from their own page, with photos. Nobody is told “a problem can’t be reported”. On the order page, <strong>Accounts</strong> lists every account in order, with photos and their checks, and says who hasn’t been heard from yet. If the accounts disagree about where the parcel is (e.g. the rider says they have it, the buyer says it was left with them), a warning shows: check with both and use <em>Book a return from the buyer</em> if needed.</p>
<h3>What you do</h3>
<ol>
<li>Contact anyone not heard from yet (the order page lists them) and ask them to add their side on their page. Be neutral; don’t take sides.</li>
<li>Ask for evidence: live photos taken with the <strong>TrustGap camera</strong> (on the buyer’s tracking page, and on the seller’s order page for a return), the chat where the item was described, and the seller’s packing photos or video.</li>
<li>Write what you found in the task notes, with dates and who said what.</li>
<li>Mark the task done and tell the admin it is ready to decide.</li>
</ol>
<h3>How disputes are decided (by the admin, or by you with a “Decide a dispute” task)</h3>
<table>
<tr><th>Finding</th><th>Usual outcome</th></tr>
<tr><td>Seller at fault (wrong, fake, damaged, not as described, didn’t ship)</td><td>Full refund to the buyer. The seller is charged both delivery trips, added to what they owe.</td></tr>
<tr><td>Buyer refused a correct item, or changed their mind</td><td>Refund minus twice the delivery fee (the buyer accepted this in step 1).</td></tr>
<tr><td>Claim not supported</td><td>The seller is paid as normal.</td></tr>
</table>
<p>A seller who owes a charge sees <strong>Pay now</strong> on their dashboard; otherwise it comes out of their next payout. They can’t create new links while they owe money.</p>`,
    },
    {
      id: 'returns',
      title: 'Returns',
      html: `
<p><strong>Every item goes back to the seller before any refund is paid, whatever it costs.</strong> No refund while the buyer still has the item. Nobody sends anything back on their own: TrustGap books every return.</p>
<h3>The return PIN</h3>
<p>It works like delivery in reverse. The seller gets a 4-digit return PIN by SMS and on their order page. When the item arrives, they check it, then give the rider the PIN. That is the record that they have it back, and it releases any refund that was waiting.</p>
<h3>Refused at the door</h3>
<ol>
<li>The buyer checks the item, keeps their delivery PIN and refuses: the rider records it, or the buyer reports it on their tracking page and says where the parcel is.</li>
<li>If the rider has it, the same rider takes it straight back. If it was left with the buyer, a collection is booked automatically. The seller gives the return PIN on arrival.</li>
<li>If a refused parcel is with the buyer and no return shows on the order (e.g. a courier error), the admin uses <strong>Book a return from the buyer</strong> on the order page.</li>
<li>The admin reviews and decides who pays what. Money moves once the seller has it back and the decision is made.</li>
</ol>
<h3>Problem found during the inspection window</h3>
<ol>
<li>The buyer reports it with photos. The admin reviews and decides.</li>
<li>If the buyer is to be refunded, TrustGap books a courier to collect the item from the buyer. The buyer has <strong>3 days</strong> to hand it over, packed with everything that came with it.</li>
<li>The seller checks it and gives the rider the return PIN. The refund is then sent automatically.</li>
</ol>
<h3>When a return gets stuck</h3>
<ul>
<li><strong>Buyer not handing it over:</strong> remind them the refund waits for the item. After 3 days the admin page shows it as overdue; tell the admin.</li>
<li><strong>Seller not confirming:</strong> the seller can also tap “I already have it back”. If they say they have it but won’t confirm, tell the admin, who can mark it received.</li>
<li><strong>Item that came back isn’t right</strong> (swapped, damaged, parts missing): the seller <em>accepts</em> the parcel, but before giving the PIN taps “It came back, but it isn’t right” on their order page, describes the problem and takes photos with the TrustGap camera. The return is recorded as received (the item stays with the seller), the earlier decision is set aside, and a new dispute “Returned item isn’t what was delivered” opens. The refund stays on hold. The seller then gives the rider the PIN so the courier can close the job. If the seller already gave the PIN, it’s too late: the refund has gone, so they must check first.</li>
</ul>`,
    },
    {
      id: 'deciding',
      title: 'Deciding a dispute',
      html: `
<p>Only when the admin has assigned you a <strong>Decide a dispute</strong> task for that order. The task’s button opens the order with the evidence and the decision form. Your decision moves real money, so take your time.</p>
<h3>Before you decide</h3>
<ol>
<li><strong>Read the report</strong>: the category, the buyer’s description and their photos (tap to open full size).</li>
<li><strong>Read the deal</strong>: the item description and condition, the seller’s packing note, and the seller’s condition pledge.</li>
<li><strong>Check delivery</strong>: when it was delivered, the courier’s status, the rider’s note if it was refused.</li>
<li><strong>Hear the seller</strong>: ask for their packing photos or video and the chat where they described the item. Give them a fair chance to answer (a few hours, or a day if not urgent).</li>
<li><strong>Write down what you found</strong> in the task notes before deciding.</li>
</ol>
<h3>Reading the photo checks</h3>
<p>Under each evidence photo the order page says how it was taken:</p>
<ul>
<li><strong>✓ Taken with the TrustGap camera</strong>, with a stamp code and time: taken live, for this order, at that moment. The same code is printed on the photo itself; check they match.</li>
<li><strong>⚠ Chosen from the phone</strong>: the person didn’t use the camera (it may not work on their phone). Give it less weight, and ask for a live photo if it matters.</li>
<li><strong>⚠ No camera details</strong> or <strong>taken days earlier</strong>: possibly a screenshot, a forwarded picture or an old photo.</li>
<li><strong>⚠ Looks like the seller’s listing photo</strong> or <strong>a photo already sent</strong>: someone may be reusing a picture instead of showing the real item. Treat as a red flag.</li>
</ul>
<p>A warning isn’t proof of lying, and a clean photo isn’t proof of the truth. Weigh the photos with the packing note, the courier’s records and what both sides say.</p>
<h3>Choosing the outcome</h3>
<table>
<tr><th>What the evidence shows</th><th>Preset to use</th></tr>
<tr><td>Wrong item, fake, damaged, not as described, missing parts, or the seller didn’t ship</td><td><em>Seller at fault</em>: full refund, seller charged both delivery trips.</td></tr>
<tr><td>The item matches the description and the buyer refused it or changed their mind</td><td><em>Buyer refused a correct item</em>: refund minus both delivery trips (the buyer accepted this before paying).</td></tr>
<tr><td>No real problem shown (e.g. normal wear, a size the buyer chose, no evidence)</td><td><em>Claim not supported</em>: the seller is paid as normal.</td></tr>
</table>
<p><strong>Returned item isn’t what was delivered</strong> (opened by the seller): compare the seller’s photos of what came back with the buyer’s photos and the listing. If the buyer swapped or damaged it, refuse or reduce the refund; the seller may be paid even though they have the item, because it isn’t the item they sent. If the seller’s claim doesn’t hold up, refund the buyer as originally decided.</p>
<p>The presets only fill in the amounts; you can adjust the deductions or the seller charge. The system refuses amounts that add up to more than the buyer paid. <strong>When the item goes back to the seller</strong> (refused at the door, or any refund after delivery), the seller can’t also be paid: they get the item back instead. So on a door refusal there is no “pay the seller” option: if the item was correct, use <em>Buyer refused a correct item</em>.</p>
<h3>Who is at fault, and the dispute fee</h3>
<p>Every decision says who is at fault. Each deal shows its dispute fee (10% of the item price, between ₦1,000 and ₦3,000; older deals have none). The presets choose a fault for you; check it.</p>
<ul>
<li><strong>The buyer</strong>: the fee comes out of their refund. If they get nothing back, it isn’t charged.</li>
<li><strong>The seller</strong>: the fee comes out of their payout, or is added to what they owe (they can’t create links until it’s paid).</li>
<li><strong>The courier</strong> (lost or damaged it in transit) or <strong>no one / both</strong>: no fee. Use “no one” too when the buyer and seller agreed a solution between themselves.</li>
</ul>
<p>Enter the refund, payout and charge <em>before</em> the fee; the system applies it. The decision SMS tells both sides who was at fault and the fee.</p>
<h3>The decision note</h3>
<p>Both sides get it by SMS, so write it plainly: what the evidence showed and why these amounts. Example: “The buyer’s photos show a torn sole on the left shoe, and the seller’s packing note doesn’t mention damage. Full refund; the seller pays both delivery trips.” Never write anything rude, personal or a guess.</p>
<h3>After you decide</h3>
<ul>
<li>If the buyer is refunded and had the item, a courier is booked to collect it, and the refund is sent once the seller has it back (see Returns).</li>
<li>Your task is marked done automatically, with the decision in its notes. The decision shows your name on the order.</li>
<li>A decision can’t be undone. If you’re unsure, add a note to the task and ask the admin instead of deciding.</li>
</ul>`,
    },
    {
      id: 'scripts',
      title: 'Common questions and how to answer',
      html: `
<dl>
<dt>“The payment page says Tubalcain Ads Enterprise. Is this a scam?”</dt>
<dd>No. Tubalcain Ads Enterprise is the registered business that runs TrustGap; Flutterwave shows the registered name. Only pay through the TrustGap link the seller sent.</dd>
<dt>“I’ve paid. Where is my item?”</dt>
<dd>Check the order. If Paid: the seller has until the ship-by time to hand it to the courier, or the case comes to TrustGap. If Shipping: give the courier status.</dd>
<dt>“I lost my delivery PIN.”</dt>
<dd>It is in their SMS and on their tracking page (the link in their SMS). <strong>Never ask for the PIN and never read it out</strong>; only the buyer gives it to the rider.</dd>
<dt>“The rider wants the PIN before I see the item.”</dt>
<dd>Don’t give it. Check the item first. If the rider won’t wait, refuse the delivery and contact us.</dd>
<dt>“The seller asked me to pay them directly to make it faster.”</dt>
<dd>Don’t. Outside the TrustGap link we can’t help. Note the seller in your task so the admin can review them.</dd>
<dt>“When will I get my refund?”</dt>
<dd>After the decision and, if the item is coming back, once the seller has it. Then it goes out once Flutterwave has settled the original payment (the working day after it was paid, at the earliest), to the account they gave in step 2.</dd>
<dt>“When will I get paid?” (seller)</dt>
<dd>When the buyer confirms, or automatically when the inspection window ends with no problem reported. Then the next working day after settlement. Weekends and holidays add time.</dd>
<dt>“Can I cancel?” (buyer, before dispatch)</dt>
<dd>Take the details and pass to the admin. Once dispatched, they follow the refusal or return process instead.</dd>
</dl>`,
    },
    {
      id: 'rules',
      title: 'Rules for the team',
      html: `
<ul>
<li><strong>Never ask for</strong> a card PIN, OTP, password, delivery PIN, return PIN or login code. Nobody at TrustGap ever needs them.</li>
<li><strong>Privacy:</strong> never give a buyer’s address, phone or refund account to the seller, or the seller’s details to the buyer, beyond what the order already shows them. Don’t copy customer data into personal chats or notes.</li>
<li>Use the official TrustGap phone or WhatsApp and email, not your personal accounts.</li>
<li>Write everything important in the task notes: who you spoke to, when, what they said, what evidence you got. The notes are the record if a case is challenged.</li>
<li>Be polite and neutral. Don’t argue, don’t blame, don’t promise outcomes.</li>
<li>Decide a dispute only with a “Decide a dispute” task for that order, and never one involving a friend, relative or a business you have a link to. If that happens, tell the admin and don’t decide it.</li>
<li>If a seller tells you their account is suspended: they can’t create links, their open links don’t take payments and their payouts are held until the admin lifts it. They should still send items buyers have already paid for. Only the admin suspends or unsuspends; pass questions to them.</li>
<li><strong>Pass to the admin straight away</strong> if: someone threatens legal action or the police; you suspect fraud or a fake identity; someone asks to change bank details; a payment looks missing or doubled; anyone is in danger; a journalist or regulator contacts you.</li>
<li>Marketing messages go only to people who ticked “Send me TrustGap news and offers” (the Marketing contacts tab). Never add anyone else.</li>
</ul>`,
    },
    {
      id: 'portal',
      title: 'Using the team portal',
      html: `
<ol>
<li>Log in at <strong>/team/</strong> with your email and password. The first time, and after a reset, you must choose a new password (at least 10 characters).</li>
<li><strong>My tasks</strong> shows what the admin assigned you: high priority and soonest due first. Overdue tasks are marked.</li>
<li>Move a task to <em>In progress</em> when you start and <em>Done</em> when finished. Add notes as you go.</li>
<li>A <strong>Decide a dispute</strong> task has a button <em>Review evidence and decide</em>. See the section “Deciding a dispute”.</li>
<li>If a task is about an order, <strong>Open order</strong> shows its status, item, both sides’ contact details, delivery, any dispute and return, and the timeline. It is read only, and you can only open orders your tasks are about.</li>
<li>Pages update themselves every 30 seconds while open (“Live · updated …” at the top). If you’re typing when something changes, a bar offers the update instead, so you never lose what you wrote.</li>
<li>Log out when you finish, especially on a shared device. Sessions end after 12 hours.</li>
</ol>
<p>Forgot your password? Ask the admin to reset it.</p>`,
    },
    {
      id: 'glossary',
      title: 'Glossary',
      html: `
<dl>
<dt>Deal link</dt><dd>The payment link a seller creates for one item and one buyer.</dd>
<dt>Delivery PIN</dt><dd>The buyer’s 4-digit code given to the rider after checking the item. Marks the order delivered.</dd>
<dt>Return PIN</dt><dd>The seller’s 4-digit code given to the rider when a returned item reaches them.</dd>
<dt>Inspection window</dt><dd>Time after delivery (currently 24 hours) to report a hidden problem.</dd>
<dt>Ship-by time</dt><dd>The deadline for the seller to hand the item to the courier.</dd>
<dt>Packing note</dt><dd>The seller’s description of what they packed, written when booking pickup.</dd>
<dt>Settlement</dt><dd>Flutterwave moving the buyer’s payment into our account, the next working day.</dd>
<dt>Seller charge / debt</dt><dd>An amount a seller owes after losing a dispute. Paid on the dashboard or taken from the next payout.</dd>
<dt>Dispute fee</dt><dd>Paid only by whoever is at fault when TrustGap decides a dispute: 10% of the item price, between ₦1,000 and ₦3,000. Shown on the deal before anyone pays.</dd>
<dt>Deal limit</dt><dd>Sellers can create links up to ₦1,000,000. For more, they contact support; the admin checks the deal and raises that seller’s limit.</dd>
<dt>Delivery fee</dt><dd>TrustGap’s price for booking, tracking and handling the delivery. If asked, it covers TrustGap arranging and following the delivery for them, so they don’t deal with the courier.</dd>
<dt>Test mode</dt><dd>A demonstration setup where no real money moves. A yellow bar shows at the bottom of every page.</dd>
</dl>`,
    },
  ],
};
