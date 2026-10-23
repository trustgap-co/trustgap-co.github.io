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

export function createMockPayments(ctx) {
  const { env, config } = ctx;
  return {
    name: 'mock',
    isTest: true,
    async listBanks() {
      return NIGERIAN_BANKS;
    },
    async resolveAccount({ accountNumber }) {
      const accountName = MOCK_ACCOUNTS[accountNumber];
      if (!accountName) throw new Error('Account not found. In test mode use one of the test account numbers.');
      return { accountName };
    },
    async createCheckout({ order }) {
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
      const tx = await first(env, 'SELECT * FROM mock_transactions WHERE tx_ref = ?', txRef);
      if (!tx) return { status: 'not_found' };
      return { status: tx.status, amount: tx.amount, currency: 'NGN', providerTxId: 'mock-' + txRef };
    },
    async setMockStatus(txRef, status) {
      await run(env, 'UPDATE mock_transactions SET status = ? WHERE tx_ref = ?', status, txRef);
    },
    async parseWebhook() {
      return null;
    },
    async verifyTransfer() {
      return { status: 'success' };
    },
    async transfer({ reference }) {
      return { status: 'success', providerRef: 'mock-transfer-' + reference };
    },
  };
}
