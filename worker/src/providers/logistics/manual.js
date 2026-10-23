import { signLink } from '../../lib/crypto.js';

// Concierge courier for the pilot: your own rider opens a signed, time-limited rider link to update
// the parcel and enter the buyer's delivery PIN.
export function createManualLogistics(ctx) {
  return {
    name: 'manual',
    async book({ order }) {
      const expires = new Date(ctx.now().getTime() + ctx.config.riderLinkDays * 86_400_000);
      const token = await signLink(ctx.config.appSecret, `rider-${order.id}`, expires);
      return { deliveryRef: 'MAN-' + order.ref, riderUrl: `${ctx.config.siteUrl}/rider.html?t=${encodeURIComponent(token)}` };
    },
  };
}
