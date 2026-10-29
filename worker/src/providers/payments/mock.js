import { first, run, insert } from '../../lib/db.js';
import { NIGERIAN_BANKS } from './banks.js';

// Test accounts the simulated bank lookup knows. Any other number fails, like a mistyped one would.
export const MOCK_ACCOUNTS = {
  '0000000001': 'ADEBAYO OLUWASEUN JOHN',
  '0000000002': 'CHIOMA NGOZI OKAFOR',
  '0000000003': 'MUSA IBRAHIM BELLO',
  '0000000004': 'FUNMILAYO GRACE ADEYEMI',
  '0000000005': 'EMEKA PETER NWOSU',
};

// The simulator only works in test mode (TEST_MODE=true, with the yellow test bar on every page).
// With TEST_MODE=false every payment action refuses, so a fake "payment" can never look real.
export const MOCK_LOCKED = 'Payments are set to TrustGap’s simulator (PAYMENT_PROVIDER = mock) but TEST_MODE is false. Set TEST_MODE = true to test with the simulator, or PAYMENT_PROVIDER = flutterwave to take real payments.';

export function createMockPayments(ctx) {
  const { env, config } = ctx;
  const blocked = config.testMode ? null : MOCK_LOCKED;
  const guard = () => { if (blocked) throw Object.assign(new Error(blocked), { definite: false, locked: true }); };
  return {
    name: 'mock',
    isTest: true,
    blocked,
    async listBanks() {
      return NIGERIAN_BANKS;
    },
    async resolveAccount({ accountNumber }) {
      guard();
      const accountName = MOCK_ACCOUNTS[accountNumber];
      if (!accountName) throw new Error('Account not found. In test mode use one of the test account numbers.');
      return { accountName };
    },
    async createCheckout({ order }) {
      guard();
      await run(env, 'DELETE FROM mock_transactions WHERE tx_ref = ?', order.tx_ref);
      await insert(env, 'mock_transactions', {
        tx_ref: order.tx_ref,
        amount: order.amount,
        status: 'pending',
        created_at: ctx.now().toISOString(),
      });
      return { url: `${config.apiUrl}/mock/pay/${encodeURIComponent(order.tx_ref)}` };
    },
    async verify(txRef) {
      guard();
      const tx = await first(env, 'SELECT * FROM mock_transactions WHERE tx_ref = ?', txRef);
      if (!tx) return { status: 'not_found' };
      return { status: tx.status, amount: tx.amount, currency: 'NGN', providerTxId: 'mock-' + txRef };
    },
    async setMockStatus(txRef, status) {
      guard();
      await run(env, 'UPDATE mock_transactions SET status = ? WHERE tx_ref = ?', status, txRef);
    },
    async parseWebhook() {
      return null;
    },
    async verifyTransfer() {
      guard();
      return { status: 'success' };
    },
    async transfer({ reference }) {
      guard();
      return { status: 'success', providerRef: 'mock-transfer-' + reference };
    },
  };
}
