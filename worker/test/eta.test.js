import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerPays, DEAL } from './helpers.js';
import { deliveryEstimate, addWorkingDays, estimateText } from '../src/lib/eta.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({});
const lagos = { pickup_state: 'Lagos', delivery_state: 'Lagos', delivery_days: 2 };
const kano = { ...lagos, delivery_state: 'Kano' };
// Monday 9 November 2026, 10:00 Lagos time
const MON = new Date('2026-11-09T09:00:00Z');

describe('delivery estimates', () => {
  test('working days skip the weekend', () => {
    const fri = new Date('2026-11-13T09:00:00Z');
    assert.equal(addWorkingDays(fri, 1).toISOString().slice(0, 10), '2026-11-16'); // Monday
    assert.equal(addWorkingDays(fri, 3).toISOString().slice(0, 10), '2026-11-18');
  });

  test('after pickup: same state 24-48 hours, another state 3-7 working days', () => {
    const order = { status: 'shipping', picked_up_at: MON.toISOString(), delivery_state: 'Lagos' };
    const same = deliveryEstimate(config, MON, lagos, order);
    assert.equal(same.basis, 'pickup');
    assert.equal(same.earliest, '2026-11-10T09:00:00.000Z');
    assert.equal(same.latest, '2026-11-11T09:00:00.000Z');
    assert.match(same.transit, /1–2 days after pickup within the state, up to 3 for remote areas/);
    const far = deliveryEstimate(config, MON, kano, { ...order, delivery_state: 'Kano' });
    assert.equal(far.earliest.slice(0, 10), '2026-11-12'); // Thursday
    assert.equal(far.latest.slice(0, 10), '2026-11-18'); // the next Wednesday
    assert.match(far.transit, /3–7 working days after pickup to another state/);
  });

  test('the estimate narrows as the order moves, and disappears once delivered', () => {
    const quote = deliveryEstimate(config, MON, lagos);
    assert.equal(quote.basis, 'quote');
    assert.equal(quote.latest, '2026-11-13T09:00:00.000Z', 'ships within 2 days, then up to 48 hours');
    const paid = deliveryEstimate(config, MON, lagos, { status: 'paid', paid_at: MON.toISOString(), ship_by: '2026-11-10T09:00:00Z', delivery_state: 'Lagos' });
    assert.equal(paid.basis, 'paid');
    assert.equal(paid.latest, '2026-11-12T09:00:00.000Z');
    assert.equal(deliveryEstimate(config, MON, lagos, { status: 'delivered', delivered_at: MON.toISOString() }), null);
    assert.equal(quote.busy, true, 'busy season until 31 January 2027');
    assert.equal(deliveryEstimate(loadConfig({ ETA_BUSY_UNTIL: '' }), MON, lagos).busy, false);
  });

  test('settings change the timelines', () => {
    const c = loadConfig({ ETA_SAME_STATE_HOURS: '12-24', ETA_OTHER_STATE_WORKING_DAYS: '2-5' });
    const order = { status: 'shipping', picked_up_at: MON.toISOString(), delivery_state: 'Lagos' };
    assert.equal(deliveryEstimate(c, MON, lagos, order).latest, '2026-11-10T09:00:00.000Z');
  });

  test('shown on the deal link, in the payment and pickup texts, and on the tracking page', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const q = await t.post('/api/seller/quote', DEAL, seller);
    assert.equal(q.data.eta.basis, 'quote');
    const deal = await createDeal(t, seller);
    assert.equal((await t.get(`/api/deals/${deal.token}`)).data.deal.eta.basis, 'quote');
    const { trackToken } = await buyerPays(t, deal.token);
    const paidSms = (await t.db("SELECT sms FROM outbox WHERE event = 'payment_received_buyer'"))[0].sms;
    assert.match(paidSms, /Estimated delivery: \w{3},? \d+ \w{3}/);
    assert.equal((await t.get(`/api/track/${trackToken}`)).data.order.eta.basis, 'paid');
    const order = await t.one('SELECT * FROM orders');
    await t.post(`/api/seller/orders/${order.id}/book`, { packing_note: 'Blue sneakers size 42' }, seller);
    assert.equal((await t.get(`/api/seller/orders/${order.id}`, seller)).data.order.eta.basis, 'booked');
    const rt = new URL((await t.one('SELECT rider_url FROM orders')).rider_url).searchParams.get('t');
    await t.post(`/api/rider/${rt}/status`, { status: 'picked_up' });
    assert.ok((await t.one('SELECT picked_up_at FROM orders')).picked_up_at);
    assert.equal((await t.get(`/api/track/${trackToken}`)).data.order.eta.basis, 'pickup');
    assert.match((await t.db("SELECT sms FROM outbox WHERE event = 'delivery_picked_up'"))[0].sms, /Expected delivery: /);
    assert.ok(estimateText((await t.get(`/api/track/${trackToken}`)).data.order.eta));
  });
});
