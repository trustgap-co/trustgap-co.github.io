// Fez Delivery adapter: NOT IMPLEMENTED.
// Fill this in once Fez gives you API credentials and written answers on:
//   - order creation fields, pricing endpoint, webhook events and how they are signed
//   - whether riders can collect a delivery PIN / OTP at handover
//   - refused-delivery, return-trip and failed-pickup handling and charges
//   - loss/damage claims and settlement timing
// book() must return { deliveryRef, riderUrl? }; status updates must be fed into
// core/orders.applyDeliveryUpdate() from a /webhooks/fez route.
export function createFezLogistics() {
  return {
    name: 'fez',
    async book() {
      throw new Error('Fez integration is not configured yet. Use LOGISTICS_PROVIDER=manual for the pilot.');
    },
  };
}
