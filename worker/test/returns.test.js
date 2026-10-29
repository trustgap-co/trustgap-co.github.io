import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, PHOTO, DEAL } from './helpers.js';

const lastOrder = (t) => t.one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
const adminToken = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
const tokenOf = (url) => new URL(url).searchParams.get('t');

// A delivered order where the buyer then reports a damaged item (the rider has left).
async function deliveredThenReported(t) {
  const seller = await onboardSeller(t);
  const deal = await createDeal(t, seller);
  const { trackToken, track } = await buyerPays(t, deal.token);
  let order = await lastOrder(t);
  await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, size tag 42' }, seller);
  const rt = tokenOf(order.rider_url || (await lastOrder(t)).rider_url);
  await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
  await t.post(`/api/rider/${rt}/pin`, { pin: track.order.pin });
  await t.post(`/api/track/${trackToken}/dispute`, { category: 'damaged', description: 'Sole is torn on the left shoe', photos: [PHOTO] });
  order = await lastOrder(t);
  assert.equal(order.status, 'disputed');
  const admin = await adminToken(t);
  const dispute = await t.one('SELECT * FROM disputes');
  return { t, seller, admin, order, dispute, trackToken };
}

const decide = (t, admin, dispute, body) => t.post(`/api/admin/disputes/${dispute.id}/resolve`,
  { buyer_refund: '49957', seller_payout: '0', seller_charge: '6450', note: 'Photos show a torn sole. Item goes back to the seller.', ...body }, admin);

describe('returns after delivery', () => {
  test('a refund that needs the item back waits until the seller enters the return PIN', async () => {
    const { t, seller, admin, order, dispute, trackToken } = await deliveredThenReported(await boot());
    const r = await decide(t, admin, dispute, {});
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.waiting_for_return, true);
    assert.equal((await lastOrder(t)).status, 'disputed');
    assert.equal((await t.one('SELECT status FROM disputes')).status, 'awaiting_return');
    assert.equal((await t.one("SELECT COUNT(*) n FROM ledger WHERE kind = 'buyer_refund'")).n, 0);

    const ret = await t.one('SELECT * FROM returns');
    assert.equal(ret.kind, 'pickup');
    assert.equal(ret.status, 'booked');
    assert.ok(ret.deadline_at);
    const sms = (await t.db('SELECT to_phone, sms FROM outbox')).map((m) => m.sms);
    assert.ok(sms.some((m) => /a rider will collect .* to return it to the seller/.test(m)), 'buyer told a rider is coming');
    assert.ok(sms.some((m) => /refund is sent once the seller has the item back/.test(m)), 'both told the refund waits');

    // Buyer and seller pages show the return; only the seller sees the PIN.
    const buyerView = (await t.get(`/api/track/${trackToken}`)).data.return;
    assert.equal(buyerView.status, 'booked');
    assert.equal(buyerView.pin, undefined);
    const sellerView = (await t.get(`/api/seller/orders/${order.id}`, seller)).data.return;
    assert.match(sellerView.pin, /^\d{4}$/);

    // The return rider link: pick up at the buyer, deliver to the seller.
    const rt = tokenOf(ret.rider_url);
    const job = (await t.get(`/api/rider/${rt}`)).data.order;
    assert.equal(job.mode, 'return');
    assert.equal(job.pickup.address, order.delivery_address);
    assert.equal((await t.post(`/api/rider/${rt}/status`, { status: 'picked_up' })).status, 200);
    assert.equal((await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' })).status, 200);
    assert.equal((await t.post(`/api/rider/${rt}/pin`, { pin: sellerView.pin })).status, 400, 'a return link has no delivery PIN');
    assert.equal((await t.post(`/api/rider/${rt}/return-pin`, { pin: sellerView.pin })).status, 200);

    const o = await lastOrder(t);
    assert.equal(o.status, 'refunded');
    const refund = await t.one("SELECT amount FROM ledger WHERE kind = 'buyer_refund'");
    assert.equal(refund.amount, 4_995_700);
    assert.equal((await t.one('SELECT amount_owed FROM sellers')).amount_owed, 645_000);
    assert.equal((await t.one('SELECT status, received_by FROM returns')).received_by, 'rider');
    assert.equal((await t.get(`/api/seller/orders/${order.id}`, seller)).data.return.pin, undefined, 'PIN hidden once received');
  });

  test('the seller can confirm they have it back themselves', async () => {
    const { t, seller, admin, order, dispute } = await deliveredThenReported(await boot());
    await decide(t, admin, dispute, {});
    assert.equal((await t.post(`/api/seller/orders/${order.id}/return-received`, {}, seller)).status, 200);
    assert.equal((await lastOrder(t)).status, 'refunded');
    assert.equal((await t.post(`/api/seller/orders/${order.id}/return-received`, {}, seller)).status, 400, 'only once');
  });

  test('staff can cancel a return (buyer never handed it over) and decide again', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    await decide(t, admin, dispute, {});
    const ret = await t.one('SELECT * FROM returns');
    assert.equal((await t.post(`/api/admin/returns/${ret.id}/cancel`, { note: 'x' }, admin)).status, 400, 'needs a reason');
    assert.equal((await t.post(`/api/admin/returns/${ret.id}/cancel`, { note: 'Buyer did not hand it over in 3 days' }, admin)).status, 200);
    assert.equal((await t.one('SELECT status FROM disputes')).status, 'open');
    const again = await decide(t, admin, dispute, { buyer_refund: '0', seller_payout: '45000', seller_charge: '0', note: 'Buyer kept the item; seller is paid.' });
    assert.equal(again.data.waiting_for_return, false);
    assert.equal((await lastOrder(t)).status, 'completed');
  });

  test('every refund after delivery needs the item back; paying the seller moves money at once', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    const r = await decide(t, admin, dispute, { buyer_refund: '1000', note: 'Small refund, still needs the item back.' });
    assert.equal(r.data.waiting_for_return, true, 'no way to refund and let the buyer keep it');
    assert.equal((await t.one('SELECT COUNT(*) n FROM returns')).n, 1);
    const ret = await t.one('SELECT * FROM returns');
    await t.post(`/api/admin/returns/${ret.id}/cancel`, { note: 'Buyer did not hand it over' }, admin);
    const paySeller = await decide(t, admin, dispute, { buyer_refund: '0', seller_payout: '45000', seller_charge: '0', note: 'Buyer kept the item; seller is paid.' });
    assert.equal(paySeller.data.waiting_for_return, false);
    assert.equal((await lastOrder(t)).status, 'completed');
  });

  test('staff can mark a return received', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    await decide(t, admin, dispute, {});
    const ret = await t.one('SELECT * FROM returns');
    const view = (await t.get(`/api/admin/orders/${ret.order_id}`, admin)).data.return;
    assert.equal(view.status, 'booked');
    assert.equal(view.overdue, false);
    assert.equal((await t.post(`/api/admin/returns/${ret.id}/received`, {}, admin)).status, 200);
    assert.equal((await lastOrder(t)).status, 'refunded');
  });
});

describe('the seller is never paid as well as getting the item back', () => {
  test('door refusal: once the parcel is going back, a payout to the seller is refused', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    await buyerPays(t, deal.token);
    let order = await lastOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box' }, seller);
    order = await lastOrder(t);
    const rt = tokenOf(order.rider_url);
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    await t.post(`/api/rider/${rt}/status`, { status: 'refused', note: 'Buyer changed their mind' });
    const admin = await adminToken(t);
    const dispute = await t.one('SELECT * FROM disputes');
    const pay = await decide(t, admin, dispute, { buyer_refund: '0', seller_payout: '45000', seller_charge: '0', note: 'Item was correct, pay the seller.' });
    assert.equal(pay.status, 400);
    assert.match(pay.data.error, /back with the seller.*can’t also be paid/);
    const ok = await decide(t, admin, dispute, { buyer_refund: String((order.amount - 2 * order.delivery_fee) / 100), seller_payout: '0', seller_charge: '0', note: 'Correct item refused: refund minus both trips.' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
  });

  test('after delivery: a refund and a seller payout can’t be combined', async () => {
    const { t, admin, dispute } = await deliveredThenReported(await boot());
    const both = await decide(t, admin, dispute, { buyer_refund: '20000', seller_payout: '20000', note: 'Split it down the middle somehow.' });
    assert.match(both.data.error, /refund means the item goes back.*not both/);
    assert.equal((await t.one('SELECT COUNT(*) n FROM returns')).n, 0, 'nothing booked');
  });
});

describe('a returned item that isn’t what was delivered', () => {
  test('the seller reports it before giving the PIN: received, refund held, case reviewed again', async () => {
    const { t, seller, admin, order, dispute, trackToken } = await deliveredThenReported(await boot());
    await decide(t, admin, dispute, {});
    const ret = await t.one('SELECT * FROM returns');
    const stamp = (await t.get(`/api/seller/orders/${order.id}/photo-stamp`, seller)).data.stamp;
    assert.match(stamp.text, new RegExp(`TrustGap · ${order.ref} · .* · ${stamp.code}$`));

    assert.match((await t.post(`/api/seller/orders/${order.id}/return-problem`, { description: 'Different shoe', photos: [] }, seller)).data.error, /at least one photo/);
    const r = await t.post(`/api/seller/orders/${order.id}/return-problem`,
      { description: 'This is a size 40 with a torn box, not the size 42 I sent.', photos: [{ data: PHOTO, source: 'camera', stamp_token: stamp.token }] }, seller);
    assert.equal(r.status, 200, JSON.stringify(r.data));

    const back = await t.one('SELECT * FROM returns');
    assert.deepEqual([back.status, back.received_by], ['received', 'seller']);
    assert.ok(back.problem_at);
    assert.equal((await lastOrder(t)).status, 'disputed', 'no refund while the case is reviewed');
    const buyerView = (await t.get(`/api/track/${trackToken}`)).data;
    assert.deepEqual(buyerView.dispute.photos, [], 'the buyer doesn’t see the seller’s photos as their own');
    assert.equal(buyerView.return.problem, true);
    assert.equal((await t.one("SELECT COUNT(*) n FROM ledger WHERE kind = 'buyer_refund'")).n, 0);
    const disputes = await t.db('SELECT status, category, opened_by FROM disputes ORDER BY id');
    assert.deepEqual(disputes.map((d) => d.status), ['superseded', 'open']);
    assert.equal(disputes[1].category, 'returned_item_problem');

    const view = (await t.get(`/api/admin/orders/${order.id}`, admin)).data;
    const photo = view.disputes[1].photos[0];
    assert.equal(photo.source, 'camera');
    assert.equal(photo.stamp_code, stamp.code);
    assert.deepEqual(photo.warnings, [], 'a stamped camera photo has nothing to flag');

    // The rider can still enter the PIN afterwards; nothing more happens.
    const rt = tokenOf(ret.rider_url);
    const pin = (await t.get(`/api/seller/orders/${order.id}`, seller)).data.return.pin;
    assert.match(pin, /^\d{4}$/, 'still shown after a problem report, so a Fez rider can close the job');
    assert.equal((await t.post(`/api/rider/${rt}/return-pin`, { pin: '0000' }, null)).status, 400);
    assert.equal((await lastOrder(t)).status, 'disputed');

    // Seller turns out to be right: they can be paid, despite having the item back.
    const paid = await decide(t, admin, view.disputes[1], { buyer_refund: '0', seller_payout: '20000', seller_charge: '0', note: 'Buyer swapped the item; seller compensated, no refund.' });
    assert.equal(paid.status, 200, JSON.stringify(paid.data));
    assert.equal((await lastOrder(t)).status, 'completed');
  });
});

describe('evidence photo checks', () => {
  test('stamps, other orders, old uploads and copies of the listing photo are flagged for review', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller, { ...DEAL, photos: [{ data: PHOTO, phash: 'f0f0f0f0f0f0f0f0' }] });
    const { trackToken } = await buyerPays(t, deal.token);
    const order = await lastOrder(t);
    const stamp = (await t.get(`/api/track/${trackToken}/photo-stamp`)).data.stamp;
    const photos = [
      { data: PHOTO, source: 'camera', stamp_token: stamp.token, phash: '0123456789abcdef' },
      { data: PHOTO.replace('Q8Q', 'Q8Q'), source: 'camera', stamp_token: stamp.token.replace(/.$/, 'x'), phash: 'f0f0f0f0f0f0f0f1' },
    ];
    const r = await t.post(`/api/track/${trackToken}/dispute`, { category: 'damaged', description: 'Box was crushed and item scratched', photos });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const admin = await adminToken(t);
    const shown = (await t.get(`/api/admin/orders/${order.id}`, admin)).data.disputes[0].photos;
    assert.deepEqual(shown[0].warnings.filter((w) => !/twice/.test(w)), []);
    assert.equal(shown[0].stamp_code, stamp.code);
    assert.ok(shown[1].warnings.includes('Camera stamp doesn’t check out (expired or altered)'));
    assert.ok(shown[1].warnings.includes('Looks like the seller’s listing photo 1'));
  });

  test('an upload with an old capture time or no camera details is flagged', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken } = await buyerPays(t, deal.token);
    const order = await lastOrder(t);
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'damaged', description: 'Box was crushed and item scratched', photos: [
      { data: PHOTO, source: 'upload', taken_at: '2026-01-02T10:00:00Z', camera_info: true },
      { data: PHOTO, source: 'upload' },
    ] });
    const shown = (await t.get(`/api/admin/orders/${order.id}`, await adminToken(t))).data.disputes[0].photos;
    assert.ok(shown[0].warnings.some((w) => /phone says it was taken .*Jan 2026/.test(w)), JSON.stringify(shown[0].warnings));
    assert.ok(shown[1].warnings.includes('No camera details: could be a screenshot, a forwarded or edited picture'));
  });
});

describe('the buyer refuses during delivery (from their tracking page)', () => {
  async function outForDelivery(t) {
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken } = await buyerPays(t, deal.token);
    let order = await lastOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, size tag 42' }, seller);
    order = await lastOrder(t);
    const rt = tokenOf(order.rider_url);
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    return { seller, trackToken, order, rt, admin: await adminToken(t) };
  }
  const report = (t, trackToken, extra = {}) => t.post(`/api/track/${trackToken}/dispute`,
    { category: 'not_as_described', description: 'Size tag says 40, not 42', photos: [PHOTO], ...extra });

  test('they must say where the parcel is', async () => {
    const t = boot();
    const { trackToken } = await outForDelivery(t);
    assert.match((await report(t, trackToken)).data.error, /where the parcel is now/);
    assert.equal((await lastOrder(t)).status, 'shipping');
  });

  test('"I still have it": a collection is booked straight away, and the refund waits for it', async () => {
    const t = boot();
    const { seller, trackToken, order, admin } = await outForDelivery(t);
    assert.equal((await report(t, trackToken, { parcel: 'buyer' })).status, 200);
    const ret = await t.one('SELECT * FROM returns');
    assert.deepEqual([ret.kind, ret.status], ['pickup', 'booked']);
    assert.equal((await t.get(`/api/track/${trackToken}`)).data.return.status, 'booked');
    assert.ok((await t.db('SELECT sms FROM outbox')).some((m) => /a rider will collect/.test(m.sms)));
    const dispute = await t.one('SELECT * FROM disputes');
    assert.equal(dispute.parcel_location, 'buyer');
    const r = await decide(t, admin, dispute, {});
    assert.equal(r.data.waiting_for_return, true, 'no refund while the buyer still has it');
    const pin = (await t.get(`/api/seller/orders/${order.id}`, seller)).data.return.pin;
    assert.equal((await t.post(`/api/rider/${tokenOf(ret.rider_url)}/return-pin`, { pin })).status, 200);
    assert.equal((await lastOrder(t)).status, 'refunded');
  });

  test('"The rider took it back": the rider’s page switches to the hand-back with the seller’s PIN', async () => {
    const t = boot();
    const { seller, trackToken, order, rt } = await outForDelivery(t);
    assert.equal((await report(t, trackToken, { parcel: 'rider' })).status, 200);
    const ret = await t.one('SELECT * FROM returns');
    assert.deepEqual([ret.kind, ret.status], ['door', 'with_rider']);
    assert.equal((await lastOrder(t)).delivery_status, 'refused');
    const job = (await t.get(`/api/rider/${rt}`)).data.order;
    assert.equal(job.return.open, true);
    const pin = (await t.get(`/api/seller/orders/${order.id}`, seller)).data.return.pin;
    assert.equal((await t.post(`/api/rider/${rt}/return-pin`, { pin })).status, 200);
    assert.equal((await t.one('SELECT status FROM returns')).status, 'received');
  });

  test('staff can book a collection by hand for an order stuck without one', async () => {
    const t = boot();
    const { trackToken, order, admin } = await outForDelivery(t);
    // "Item not delivered" doesn't ask about the parcel; it turns out the buyer has it.
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'not_delivered', description: 'Rider says delivered but it was left at the gate' });
    assert.equal((await t.one('SELECT COUNT(*) n FROM returns')).n, 0);
    const r = await t.post(`/api/admin/orders/${order.id}/book-return`, {}, admin);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await t.one('SELECT status FROM returns')).status, 'booked');
    assert.match((await t.post(`/api/admin/orders/${order.id}/book-return`, {}, admin)).data.error, /already exists/);
  });
});

describe('one case, each side’s account', () => {
  async function outForDelivery(t) {
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { trackToken } = await buyerPays(t, deal.token);
    let order = await lastOrder(t);
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue box, size tag 42' }, seller);
    order = await lastOrder(t);
    const rt = tokenOf(order.rider_url);
    await t.post(`/api/rider/${rt}/status`, { status: 'out_for_delivery' });
    return { seller, trackToken, order, rt, admin: await adminToken(t) };
  }

  test('buyer first, then the rider: the rider’s refusal is added to the same case, not an error', async () => {
    const t = boot();
    const { seller, trackToken, order, rt, admin } = await outForDelivery(t);
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'not_as_described', description: 'Size 40, not 42', photos: [PHOTO], parcel: 'rider' });
    const r = await t.post(`/api/rider/${rt}/status`, { status: 'refused', note: 'Buyer opened the box and refused: wrong size' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.added_to_case, true);
    assert.equal((await t.one('SELECT COUNT(*) n FROM disputes')).n, 1, 'still one case');
    const view = (await t.get(`/api/admin/orders/${order.id}`, admin)).data.disputes[0].case;
    assert.deepEqual(view.parties_heard, ['buyer', 'rider']);
    assert.deepEqual(view.statements.map((x) => x.party), ['buyer', 'rider']);
    assert.equal(view.statements[0].opening, true);
    assert.equal(view.statements[0].photos.length, 1, 'the report’s own photos');
    assert.equal(view.parcel_conflict, null, 'both say the rider has it');

    // The seller adds theirs too; the buyer sees the rider’s account but not the seller’s.
    assert.equal((await t.post(`/api/seller/orders/${order.id}/statement`, { body: 'I packed size 42, packing note says so.', photos: [{ data: PHOTO, source: 'upload' }] }, seller)).status, 200);
    const buyerCase = (await t.get(`/api/track/${trackToken}`)).data.case;
    assert.deepEqual(buyerCase.statements.map((s) => s.party), ['buyer', 'rider']);
    const sellerCase = (await t.get(`/api/seller/orders/${order.id}`, seller)).data.case;
    assert.deepEqual(sellerCase.statements.map((s) => s.party), ['rider', 'seller']);
    const staffCase = (await t.get(`/api/admin/orders/${order.id}`, admin)).data.disputes[0].case;
    assert.equal(staffCase.statements[2].photos.length, 1);
    assert.equal(staffCase.statements[2].photos[0].source, 'upload');
  });

  test('rider first, then the buyer: the buyer’s report becomes their side; different parcel claims are flagged', async () => {
    const t = boot();
    const { trackToken, order, rt, admin } = await outForDelivery(t);
    await t.post(`/api/rider/${rt}/status`, { status: 'refused', note: 'Buyer refused, I have the parcel' });
    assert.equal((await t.get(`/api/track/${trackToken}`)).data.case.statements[0].party, 'rider', 'the buyer sees the rider’s account');
    const r = await t.post(`/api/track/${trackToken}/dispute`, { category: 'wrong_item', description: 'It was the wrong colour, the rider left it with me', photos: [PHOTO], parcel: 'buyer' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.added_to_case, true);
    assert.equal((await t.one('SELECT COUNT(*) n FROM disputes')).n, 1);
    const view = (await t.get(`/api/admin/orders/${order.id}`, admin)).data.disputes[0].case;
    assert.match(view.parcel_conflict, /Rider: the rider has it · Buyer: the buyer has it/);
    assert.equal((await t.one('SELECT COUNT(*) n FROM returns')).n, 1, 'no second return while they disagree');
  });

  test('the rider can add an account later, e.g. that they left the parcel with the buyer', async () => {
    const t = boot();
    const { trackToken, rt, order } = await outForDelivery(t);
    await t.post(`/api/track/${trackToken}/dispute`, { category: 'other', description: 'Not what I ordered', parcel: 'rider' });
    // (the buyer said the rider has it, so a door return started)
    assert.equal((await t.get(`/api/rider/${rt}`)).data.order.case.open, true);
    assert.equal((await t.post(`/api/rider/${rt}/statement`, { body: 'Left it at the gate as asked', parcel: 'buyer' })).status, 200);
    const mine = (await t.get(`/api/rider/${rt}`)).data.order.case.mine;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].parcel_label, 'I still have it');
    assert.equal(order.id > 0, true);
  });
});
