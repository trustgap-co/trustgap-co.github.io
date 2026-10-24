// WebCrypto helpers. Everything here runs on Cloudflare Workers and Node 22.
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const randomToken = (bytes = 18) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export function randomDigits(n) {
  const bytes = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(bytes, (b) => b % 10).join('');
}

// Unambiguous characters for references people read out on the phone.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function humanRef(prefix, length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return `${prefix}-${Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmac(secret, message) {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message)));
}

export async function hmacHex(secret, message) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Time-limited, tamper-proof links (same idea as the CEA listing links): "<data>.<expiry>.<signature>".
export async function signLink(secret, data, expiresAt) {
  const body = `${data}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${body}.${await hmac(secret, 'link:' + body)}`;
}

export async function verifyLink(secret, token, now) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [data, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(secret, `link:${data}.${exp}`))) return null;
  if (Number(exp) * 1000 < now.getTime()) return null;
  return data;
}

// AES-256-GCM for data we must read back later (refund account numbers, delivery PINs).
async function aesKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('trustgap-encryption:' + secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(plaintext, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(String(plaintext)));
  return `${b64url(iv)}.${b64url(data)}`;
}

export async function decrypt(payload, secret) {
  const [iv, data] = String(payload).split('.').map(fromB64url);
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(secret), data));
}
