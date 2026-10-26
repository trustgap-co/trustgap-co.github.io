import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboardSeller, createDeal, buyerCheckout, buyerPays, DEAL, PHOTO, API } from './helpers.js';
import { stripJpegMetadata } from '../src/lib/photos.js';

const bytesOf = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

describe('item photos', () => {
  test('a link needs at least one photo, at most four, and only JPEGs', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    assert.match((await t.post('/api/seller/deals', { ...DEAL, photos: [] }, seller)).data.error, /at least one photo/);
    assert.match((await t.post('/api/seller/deals', { ...DEAL, photos: Array(5).fill(PHOTO) }, seller)).data.error, /up to 4/);
    assert.match((await t.post('/api/seller/deals', { ...DEAL, photos: ['data:image/png;base64,iVBORw0KGgo='] }, seller)).data.error, /JPEG/);
    assert.match((await t.post('/api/seller/deals', { ...DEAL, photos: ['data:image/jpeg;base64,AAAA'] }, seller)).data.error, /JPEG/);
    assert.equal((await t.one('SELECT COUNT(*) AS n FROM deals')).n, 0, 'nothing saved when a photo is rejected');
  });

  test('the buyer sees the photos on the deal page, and they are served without the phone’s metadata', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller, { ...DEAL, photos: [PHOTO, PHOTO] });
    assert.equal(deal.photos.length, 2, 'seller sees them on their link page');
    const view = (await t.get(`/api/deals/${deal.token}`)).data.deal;
    assert.equal(view.photos.length, 2);
    assert.ok(view.photos[0].startsWith(`${API}/api/deals/${deal.token}/photos/1?v=`));

    const res = await t.get(new URL(view.photos[0]).pathname);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'image/jpeg');
    assert.match(res.headers.get('Cache-Control'), /immutable/);
    const served = Buffer.from(res.data, 'latin1');
    const original = bytesOf(PHOTO);
    assert.ok(original.includes('TestCam-GPS'), 'the test photo really has a location marker');
    assert.equal((await t.one('SELECT bytes FROM deal_photos WHERE position = 1')).bytes < original.length, true);
    const stored = new Uint8Array((await t.one('SELECT data FROM deal_photos WHERE position = 1')).data);
    assert.ok(!Buffer.from(stored).includes('TestCam-GPS'), 'EXIF removed before storing');
    assert.ok(!served.includes('TestCam-GPS'));
    assert.equal((await t.get(`/api/deals/${deal.token}/photos/9`)).status, 404);
  });

  test('the photos are part of the terms the buyer accepts, and stay visible after payment', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    const { track } = await buyerPays(t, deal.token);
    assert.equal(track.order.photos.length, 1, 'buyer’s tracking page shows the photo');
    const order = await t.one('SELECT terms_json FROM orders');
    const stored = await t.one('SELECT sha256 FROM deal_photos');
    assert.deepEqual(JSON.parse(order.terms_json).item.photos_sha256, [stored.sha256]);
    assert.equal((await t.get(new URL(track.order.photos[0]).pathname)).status, 200, 'still served once the link is paid');
  });

  test('revising a link keeps the old photos unless new ones are added', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const first = await createDeal(t, seller, { ...DEAL, photos: [PHOTO, PHOTO] });
    const { photos, ...noPhotos } = DEAL;
    const revised = await createDeal(t, seller, { ...noPhotos, item_price: '44,000', replaces: first.id });
    assert.equal(revised.photos.length, 2, 'copied from the replaced link');
    const again = await createDeal(t, seller, { ...DEAL, item_price: '43,000', replaces: revised.id });
    assert.equal(again.photos.length, 1, 'new photos replace the old ones');
  });

  test('photos of links nobody paid are deleted after 30 days; paid deals keep theirs', async () => {
    const t = boot();
    const seller = await onboardSeller(t);
    const unpaid = await createDeal(t, seller);
    const paid = await createDeal(t, seller);
    await buyerPays(t, paid.token);
    t.advanceHours(31 * 24);
    await t.scheduled();
    const left = await t.db('SELECT deal_id FROM deal_photos');
    assert.deepEqual(left.map((r) => r.deal_id), [paid.id]);
    assert.equal(unpaid.id !== paid.id, true);
  });

  test('metadata stripping keeps the image and rejects broken files', () => {
    const original = new Uint8Array(bytesOf(PHOTO));
    const clean = stripJpegMetadata(original);
    assert.equal(clean[0], 0xff); assert.equal(clean[1], 0xd8);
    assert.deepEqual(clean.subarray(clean.length - 2), original.subarray(original.length - 2), 'image data intact');
    assert.throws(() => stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x01])), /damaged/);
  });
});

describe('buyer evidence photos on a reported problem', () => {
  const adminToken = async (t) => (await t.post('/api/admin/login', { password: 'test-admin-password' })).data.token;
  async function paidOrder(t) {
    const seller = await onboardSeller(t);
    const deal = await createDeal(t, seller);
    return (await buyerPays(t, deal.token)).trackToken;
  }

  test('item problems need a photo, at most two; "not delivered" needs none', async () => {
    const t = boot();
    const track = await paidOrder(t);
    const report = (body) => t.post(`/api/track/${track}/dispute`, { description: 'Screen is cracked on the left side', ...body });
    assert.match((await report({ category: 'damaged' })).data.error, /at least one photo/);
    assert.match((await report({ category: 'damaged', photos: [PHOTO, PHOTO, PHOTO] })).data.error, /up to 2/);
    assert.equal((await t.one('SELECT COUNT(*) AS n FROM disputes')).n, 0);
    const t2 = boot();
    const track2 = await paidOrder(t2);
    assert.equal((await t2.post(`/api/track/${track2}/dispute`, { category: 'not_delivered', description: 'Nothing came' })).status, 200);
  });

  test('admin sees the photos straight away through private, expiring links', async () => {
    const t = boot();
    const track = await paidOrder(t);
    const r = await t.post(`/api/track/${track}/dispute`, { category: 'damaged', description: 'Screen is cracked on the left side', photos: [PHOTO, PHOTO] });
    assert.equal(r.status, 200);
    const order = await t.one('SELECT id FROM orders');
    const view = (await t.get(`/api/admin/orders/${order.id}`, await adminToken(t))).data;
    const urls = view.disputes[0].photos;
    assert.equal(urls.length, 2);
    assert.ok(urls[0].startsWith(`${API}/api/evidence/`));
    const img = await t.get(new URL(urls[0]).pathname);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('Content-Type'), 'image/jpeg');
    assert.match(img.headers.get('Cache-Control'), /private/);
    assert.ok(!Buffer.from(img.data, 'latin1').includes('TestCam-GPS'), 'location data removed');
    assert.equal((await t.get(`/api/track/${track}`)).data.dispute.photos.length, 2, 'the buyer sees what they sent');

    const token = new URL(urls[0]).pathname.split('/').pop();
    const forged = token.replace(/^dp\d+/, `dp${999}`);
    assert.equal((await t.get(`/api/evidence/${forged}`)).status, 404, 'a changed link is refused');
    assert.equal((await t.get('/api/evidence/dp1')).status, 404, 'an unsigned id is refused');
    t.advanceHours(3);
    assert.equal((await t.get(new URL(urls[0]).pathname)).status, 404, 'links expire');
    const fresh = (await t.get(`/api/admin/orders/${order.id}`, await adminToken(t))).data.disputes[0].photos[0];
    assert.equal((await t.get(new URL(fresh).pathname)).status, 200, 'reloading the page gives fresh links');
  });
});
