// Checks on evidence photos (problem reports, and returned items the seller says aren't right).
// Nothing here blocks a photo: it records how the photo was taken and flags anything that needs a
// closer look, for whoever decides the dispute.
import { signLink, verifyLink, randomToken } from './crypto.js';

const STAMP_MINUTES = 30; // how long a camera stamp stays valid after the camera opens
const OLD_PHOTO_MINUTES = 60; // uploaded photos taken earlier than this before the report are flagged
const SAME_PICTURE_DISTANCE = 8; // fingerprints this close (of 64 bits) are the same picture

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const lagosTime = (d) => d.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

// Issued when the in-page camera opens. The page burns `text` into each photo; the signed token goes
// back with the photo, proving it was taken through TrustGap, for this order, within 30 minutes.
export async function issueStamp(ctx, order) {
  const code = Array.from(randomToken(8)).map((c) => CODE_ALPHABET[c.charCodeAt(0) % CODE_ALPHABET.length]).join('').slice(0, 4);
  const now = ctx.now();
  const token = await signLink(ctx.config.appSecret, `stamp-${order.id}-${code}-${Math.floor(now.getTime() / 1000)}`, new Date(now.getTime() + STAMP_MINUTES * 60_000));
  return { code, token, text: `TrustGap · ${order.ref} · ${lagosTime(now)} · ${code}`, valid_minutes: STAMP_MINUTES };
}

const hamming = (a, b) => {
  let n = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
};

// Adds { source, stamp_code, captured_at, phash, flags } to each parsed photo. `listing` and
// `earlier` are the order's listing photos and its earlier evidence photos ({ position, phash }).
export async function checkEvidence(ctx, order, photos, { listing = [], earlier = [] } = {}) {
  const now = ctx.now();
  return Promise.all(photos.map(async (p) => {
    const flags = [];
    let stampCode = null;
    let capturedAt = null;
    if (p.source === 'camera') {
      const data = p.stampToken && (await verifyLink(ctx.config.appSecret, p.stampToken, now));
      const m = data && /^stamp-(\d+)-([A-Z0-9]{4})-(\d+)$/.exec(data);
      if (!m) flags.push('stamp_invalid');
      else if (Number(m[1]) !== order.id) flags.push('stamp_other_order');
      else { stampCode = m[2]; capturedAt = new Date(Number(m[3]) * 1000).toISOString(); }
    } else {
      flags.push('not_camera');
      if (!p.takenAt || !p.cameraInfo) flags.push('no_camera_info');
      else if (now.getTime() - new Date(p.takenAt).getTime() > OLD_PHOTO_MINUTES * 60_000) flags.push(`taken:${p.takenAt}`);
    }
    if (p.phash) {
      for (const l of listing) if (l.phash && hamming(p.phash, l.phash) <= SAME_PICTURE_DISTANCE) flags.push(`matches_listing:${l.position}`);
      if (earlier.some((e) => e.phash && hamming(p.phash, e.phash) <= SAME_PICTURE_DISTANCE)) flags.push('matches_earlier_evidence');
    }
    if (photos.filter((q) => q.sha256 === p.sha256).length > 1) flags.push('duplicate_in_report');
    return { ...p, stamp_code: stampCode, captured_at: capturedAt, flags };
  }));
}

// Plain-words versions of the flags, for the admin and team pages.
export function describeFlags(flags, { lagos = lagosTime } = {}) {
  return (flags || []).map((f) => {
    if (f === 'not_camera') return 'Chosen from the phone, not taken with the TrustGap camera';
    if (f === 'no_camera_info') return 'No camera details: could be a screenshot, a forwarded or edited picture';
    if (f.startsWith('taken:')) return `The phone says it was taken ${lagos(new Date(f.slice(6)))}, well before the report`;
    if (f === 'stamp_invalid') return 'Camera stamp doesn’t check out (expired or altered)';
    if (f === 'stamp_other_order') return 'Camera stamp is from a different order';
    if (f.startsWith('matches_listing:')) return `Looks like the seller’s listing photo ${f.split(':')[1]}`;
    if (f === 'matches_earlier_evidence') return 'Looks like a photo already sent in this case';
    if (f === 'duplicate_in_report') return 'The same picture was sent twice';
    return f;
  });
}
