// Monnify NIN Verification (https://developers.monnify.com, "Verifying your Customers").
// POST /api/v1/vas/nin-verification with { nin }. Live environment only; ₦60 per successful
// request, paid from your Monnify wallet (requests fail if the balance is too low).
// Auth: POST /api/v1/auth/login with Basic base64(apiKey:secretKey) returns a bearer token.

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

// Monnify returns dates like "01-Jan-1990"; we compare as "1990-01-01".
export function parseMonnifyDate(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

let cachedToken = null; // { key, token, expiresAt }, reused across requests in the same Worker instance

export function createMonnifyIdentity({ env, now }) {
  const apiKey = env.MONNIFY_API_KEY;
  const secretKey = env.MONNIFY_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error('MONNIFY_API_KEY and MONNIFY_SECRET_KEY are required when IDENTITY_PROVIDER=monnify');
  const base = String(env.MONNIFY_BASE_URL || 'https://api.monnify.com').replace(/\/$/, '');

  // `retryable` errors (network, Monnify or the NIN registry down) don't use up a seller's attempts.
  const fail = (message, retryable) => Object.assign(new Error(message), { retryable });

  async function request(path, init) {
    let res;
    try {
      res = await fetch(base + path, init);
    } catch {
      throw fail('The identity service could not be reached. Please try again in a few minutes.', true);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.requestSuccessful === false || (body.responseCode !== undefined && String(body.responseCode) !== '0')) {
      const message = body.responseMessage || `Identity service error (${res.status})`;
      throw fail(message, res.status >= 500 || /unavailable|timeout|try again/i.test(message));
    }
    return body.responseBody;
  }

  async function token() {
    const key = `${base}|${apiKey}`;
    if (cachedToken?.key === key && cachedToken.expiresAt > now().getTime() + 60_000) return cachedToken.token;
    const data = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${apiKey}:${secretKey}`)}` },
    });
    cachedToken = { key, token: data.accessToken, expiresAt: now().getTime() + Number(data.expiresIn || 3000) * 1000 };
    return cachedToken.token;
  }

  return {
    name: 'monnify',
    async verify({ idNumber }) {
      const data = await request('/api/v1/vas/nin-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nin: idNumber }),
      });
      return {
        firstName: data.firstName || '',
        middleName: data.middleName || '',
        lastName: data.lastName || '',
        dob: parseMonnifyDate(data.dateOfBirth),
        phone: data.phoneNumber || '',
        providerRef: `monnify-nin-${idNumber.slice(-4)}`,
      };
    },
  };
}
