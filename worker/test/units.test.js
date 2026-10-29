import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nairaToKobo, quote, platformFee, splitCharges, formatNaira } from '../src/lib/money.js';
import { namesMatch } from '../src/lib/names.js';
import { encrypt, decrypt, signLink, verifyLink, safeEqual } from '../src/lib/crypto.js';
import { parseMonnifyDate } from '../src/providers/identity/monnify.js';

const fee = { percent: 1.5, minKobo: 10_000, maxKobo: 300_000 };
const processing = { percent: 2, payoutFeeKobo: 5_779, capKobo: 200_000 };

test('nairaToKobo parses amounts people type', () => {
  assert.equal(nairaToKobo('45,000'), 4_500_000);
  assert.equal(nairaToKobo('₦1,250.5'), 125_050);
  assert.equal(nairaToKobo('12.345'), null);
  assert.equal(nairaToKobo('abc'), null);
  assert.equal(formatNaira(5_023_800), '₦50,238');
});

test('TrustGap fee has a minimum and a ₦3,000 cap', () => {
  assert.equal(platformFee(500_000, fee), 10_000); // 1.5% of ₦5,000 = ₦75 -> min ₦100
  assert.equal(platformFee(4_500_000, fee), 67_500);
  assert.equal(platformFee(20_000_000, fee), 300_000); // ₦200,000 -> exactly ₦3,000
  assert.equal(platformFee(25_000_000, fee), 300_000); // ₦250,000 -> ₦3,750, capped at ₦3,000
  assert.equal(platformFee(50_000_000, { ...fee, maxKobo: 0 }), 750_000); // cap 0 = no cap
});

test('quote: totals balance and TrustGap always keeps its fee after Flutterwave costs', () => {
  for (const itemPrice of [50_000, 4_500_001, 9_500_000, 30_000_000]) {
    for (const deliveryPayer of ['buyer', 'seller']) {
      for (const feePayer of ['buyer', 'seller', 'split']) {
        const q = quote({ itemPrice, deliveryFee: 350_000, deliveryPayer, feePayer }, fee, processing);
        const label = `${itemPrice}/${deliveryPayer}/${feePayer}`;
        assert.equal(q.buyerTotal - q.sellerPayout, q.deliveryFee + q.platformFee + q.processingFee, label);
        const flutterwaveCost = Math.min(Math.ceil(q.buyerTotal * 0.02), processing.capKobo) + processing.payoutFeeKobo;
        assert.ok(q.processingFee >= flutterwaveCost, `${label}: processing ${q.processingFee} < cost ${flutterwaveCost}`);
        assert.ok(q.processingFee - flutterwaveCost < 200, `${label}: over-charging by more than ₦2`);
      }
    }
  }
  const q = quote({ itemPrice: 4_500_000, deliveryFee: 350_000, deliveryPayer: 'buyer', feePayer: 'buyer' }, fee, processing);
  assert.equal(q.platformFee, 67_500);
  assert.equal(q.processingFee, 106_300);
  assert.equal(q.buyerTotal, 5_023_800);
  assert.equal(q.sellerPayout, 4_500_000);

  // A ₦250,000 deal: both fees capped, ₦3,000 + ₦2,000 + the ₦57.79 payout fee (rounded up to ₦2,058).
  const big = quote({ itemPrice: 25_000_000, deliveryFee: 350_000, deliveryPayer: 'buyer', feePayer: 'buyer' }, fee, processing);
  assert.equal(big.platformFee, 300_000);
  assert.equal(big.processingFee, 205_800);
  assert.equal(big.buyerTotal, 25_000_000 + 350_000 + 505_800);
});

test('Monnify dates are read correctly', () => {
  assert.equal(parseMonnifyDate('01-Jan-1990'), '1990-01-01');
  assert.equal(parseMonnifyDate('5-Nov-1988'), '1988-11-05');
  assert.equal(parseMonnifyDate('1994-06-02T00:00:00'), '1994-06-02');
  assert.equal(parseMonnifyDate(''), '');
});

test('names match despite order, middle names and case', () => {
  assert.ok(namesMatch('Chioma Okafor', 'CHIOMA NGOZI OKAFOR'));
  assert.ok(namesMatch('okafor chioma', 'CHIOMA NGOZI OKAFOR'));
  assert.ok(!namesMatch('Chioma Adeyemi', 'CHIOMA NGOZI OKAFOR'));
  assert.ok(!namesMatch('Chioma', 'CHIOMA NGOZI OKAFOR'));
});

test('encryption round-trips and fails with the wrong key', async () => {
  const enc = await encrypt('0123456789', 's3cret');
  assert.notEqual(enc, '0123456789');
  assert.equal(await decrypt(enc, 's3cret'), '0123456789');
  await assert.rejects(() => decrypt(enc, 'wrong'));
});

test('signed links verify, expire and resist tampering', async () => {
  const now = new Date('2026-10-22T10:00:00Z');
  const token = await signLink('k', 'rider-7', new Date(now.getTime() + 3_600_000));
  assert.equal(await verifyLink('k', token, now), 'rider-7');
  assert.equal(await verifyLink('k', token.replace('rider-7', 'rider-8'), now), null);
  assert.equal(await verifyLink('other', token, now), null);
  assert.equal(await verifyLink('k', token, new Date(now.getTime() + 7_200_000)), null);
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
});

test('a 50/50 split never shows kobo and the halves add up', () => {
  for (const amount of [322_500, 322_550, 105_700, 99]) {
    const q = splitCharges({ itemPrice: 4_500_000, deliveryFee: amount, deliveryPayer: 'split', feePayer: 'split', platformFee: 67_500, processingFee: amount });
    assert.equal(q.buyerDelivery % 100, 0);
    assert.equal(q.buyerProcessingShare % 100, 0);
    assert.equal(q.buyerDelivery + q.sellerDelivery, amount);
  }
});
