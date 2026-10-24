// Item photos. The website shrinks each photo on the seller's phone to a ~1280px JPEG before upload;
// the Worker checks it really is a JPEG, removes any metadata the phone may have left in it (camera
// details, GPS location), and stores it in D1 next to the deal.
import { UserError } from './http.js';

export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 600 * 1024;

// Turns the uploaded data URLs ("data:image/jpeg;base64,…") into clean JPEG bytes.
export async function parsePhotos(input) {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  if (list.length > MAX_PHOTOS) throw new UserError(`Add up to ${MAX_PHOTOS} photos.`);
  const photos = [];
  for (const item of list) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(item));
    if (!m) throw new UserError('Each photo must be a JPEG image. Try adding it again.');
    let bytes;
    try {
      bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    } catch {
      throw new UserError('A photo could not be read. Try adding it again.');
    }
    if (bytes.length > MAX_PHOTO_BYTES) throw new UserError('A photo is too large. Try a smaller one.');
    const clean = stripJpegMetadata(bytes);
    photos.push({ mime: 'image/jpeg', data: clean, bytes: clean.length, sha256: await sha256Bytes(clean) });
  }
  return photos;
}

// Removes APP1 (EXIF/XMP, which can hold GPS location) and APP13 (IPTC) segments and comments from
// a JPEG, keeping the image data unchanged. Throws if the file isn't a well-formed JPEG.
export function stripJpegMetadata(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new UserError('Each photo must be a JPEG image. Try adding it again.');
  const out = [b.subarray(0, 2)];
  let i = 2;
  let imageData = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new UserError('A photo is damaged. Try adding it again.');
    const marker = b[i + 1];
    if (marker === 0xda) { out.push(b.subarray(i)); imageData = true; break; } // start of image data: copy the rest as is
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) throw new UserError('A photo is damaged. Try adding it again.');
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (!imageData) throw new UserError('A photo is damaged. Try adding it again.');
  const size = out.reduce((n, p) => n + p.length, 0);
  const clean = new Uint8Array(size);
  let at = 0;
  for (const p of out) { clean.set(p, at); at += p.length; }
  return clean;
}

async function sha256Bytes(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Public addresses of a deal's photos (served by GET /api/deals/:token/photos/:n). The short hash in
// the address lets browsers cache each photo for good: a deal's photos never change.
export const photoUrls = (ctx, deal, rows) =>
  rows.map((p) => `${ctx.config.apiUrl}/api/deals/${encodeURIComponent(deal.token)}/photos/${p.position}?v=${p.sha256.slice(0, 10)}`);
