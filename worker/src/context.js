import { loadConfig } from './config.js';
import { createMockPayments } from './providers/payments/mock.js';
import { createFlutterwavePayments } from './providers/payments/flutterwave.js';
import { createMockIdentity } from './providers/identity/mock.js';
import { createMonnifyIdentity } from './providers/identity/monnify.js';
import { createManualLogistics } from './providers/logistics/manual.js';
import { createFezLogistics } from './providers/logistics/fez.js';
import { createNotifier } from './providers/notify/make.js';

const pick = (name, options, kind) => {
  const make = options[name];
  if (!make) throw new Error(`${kind} is "${name}", which isn't one of: ${Object.keys(options).join(', ')}. Fix it under Settings → Variables.`);
  return make;
};

// Everything a request needs: settings, database, clock and the provider adapters.
export function createContext(env, execCtx) {
  const ctx = {
    env,
    config: loadConfig(env),
    // Tests inject a controllable clock through env.__clock.
    now: env.__clock || (() => new Date()),
    waitUntil: (promise) => (execCtx?.waitUntil ? execCtx.waitUntil(promise) : promise),
  };
  ctx.payments = pick(ctx.config.paymentProvider, { mock: createMockPayments, flutterwave: createFlutterwavePayments }, 'PAYMENT_PROVIDER')(ctx);
  ctx.identity = pick(ctx.config.identityProvider, { mock: createMockIdentity, monnify: createMonnifyIdentity }, 'IDENTITY_PROVIDER')(ctx);
  ctx.logistics = pick(ctx.config.logisticsProvider, { manual: createManualLogistics, fez: createFezLogistics }, 'LOGISTICS_PROVIDER')(ctx);
  ctx.notify = createNotifier(ctx);
  return ctx;
}
