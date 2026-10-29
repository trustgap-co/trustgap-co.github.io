// Item and evidence photos: shrunk on the phone before upload, so they send quickly on mobile data.
// Re-drawing a photo also drops the camera's hidden details, such as GPS location.
import { html, show } from './core.js';

// Loads a photo from the phone and returns it as a JPEG data URL, at most 1280px on its longest side
// and under ~450 KB. Browsers apply the photo's rotation when drawing it, so it comes out upright.
export async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; // transparent PNGs get a white background instead of black
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out;
    for (const quality of [0.82, 0.72, 0.62, 0.5]) {
      out = canvas.toDataURL('image/jpeg', quality);
      if (out.length * 0.75 < 450 * 1024) break;
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A picture fingerprint (64-bit "difference hash" as 16 hex characters): close for the same picture
// even after resizing or recompression. The Worker compares it with the listing photos and earlier
// evidence, to spot a photo copied from the listing or sent twice.
export async function fingerprint(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 9, 8);
  const px = g.getImageData(0, 0, 9, 8).data;
  const lum = (x, y) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (lum(x, y) > lum(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

// When the phone says a JPEG was taken, and whether it has camera details at all (screenshots,
// forwarded WhatsApp pictures and edited images usually don't). Only a hint: phones can be wrong.
export async function photoDetails(file) {
  try {
    const b = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (b.getUint16(0) !== 0xffd8) return { taken_at: null, camera_info: false };
    let i = 2;
    while (i + 4 < b.byteLength) {
      const marker = b.getUint16(i);
      const len = b.getUint16(i + 2);
      if (marker === 0xffe1 && b.getUint32(i + 4) === 0x45786966) return readExif(b, i + 10);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      i += 2 + len;
    }
  } catch { /* unreadable: treated as no details */ }
  return { taken_at: null, camera_info: false };
}
function readExif(b, tiff) {
  const le = b.getUint16(tiff) === 0x4949;
  const u16 = (o) => b.getUint16(tiff + o, le);
  const u32 = (o) => b.getUint32(tiff + o, le);
  const ascii = (o, n) => { let t = ''; for (let k = 0; k < n - 1; k++) t += String.fromCharCode(b.getUint8(tiff + o + k)); return t; };
  const entries = (ifd) => Array.from({ length: u16(ifd) }, (_, k) => ifd + 2 + k * 12);
  let camera = false;
  let when = null;
  let exifIfd = null;
  for (const e of entries(u32(4))) {
    const tag = u16(e);
    if (tag === 0x010f || tag === 0x0110) camera = true; // Make, Model
    if (tag === 0x8769) exifIfd = u32(e + 8);
  }
  if (exifIfd) {
    for (const e of entries(exifIfd)) {
      if (u16(e) === 0x9003 && u32(e + 4) === 20) when = ascii(u32(e + 8), 20); // DateTimeOriginal
    }
  }
  const m = when && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(when);
  // Phones record local time without a zone; read it as the phone's own time.
  const takenAt = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
  return { taken_at: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt.toISOString() : null, camera_info: camera };
}

// A photo chosen from the phone, ready to send: shrunk, fingerprinted, with what the phone says.
export async function uploadedPhoto(file) {
  const [data, details] = await Promise.all([shrinkPhoto(file), photoDetails(file)]);
  return { data, source: 'upload', phash: await fingerprint(data), ...details };
}

// ---------------------------------------------------------------- TrustGap camera
// Opens the phone's camera inside the page, so the photo is taken now, not picked from the gallery.
// Each photo gets the order's stamp (reference, time and a code from TrustGap) burned into it.
// Resolves with the photos taken ({ data, source: 'camera', stamp_token, phash }), possibly none.
export const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

export async function openCamera({ stamp, max = 1 }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
  });
  return new Promise((resolve) => {
    const shots = [];
    const dlg = document.createElement('dialog');
    dlg.className = 'modal camera-modal';
    dlg.innerHTML = String(html`<div class="camera">
      <video playsinline autoplay muted></video>
      <p class="camera-stamp">${stamp.text}</p>
      <p class="small camera-count" aria-live="polite">Point at the item and take the photo. Up to ${max}.</p>
      <div class="camera-actions">
        <button type="button" class="btn camera-shoot">Take photo</button>
        <button type="button" class="btn btn-secondary camera-done">Done</button>
      </div>
    </div>`);
    document.body.appendChild(dlg);
    const video = dlg.querySelector('video');
    video.srcObject = stream;
    const finish = () => { stream.getTracks().forEach((t) => t.stop()); dlg.close(); dlg.remove(); resolve(shots); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
    dlg.querySelector('.camera-done').addEventListener('click', finish);
    dlg.querySelector('.camera-shoot').addEventListener('click', async () => {
      if (!video.videoWidth) return;
      const data = stampedFrame(video, stamp.text);
      shots.push({ data, source: 'camera', stamp_token: stamp.token, phash: await fingerprint(data) });
      dlg.querySelector('.camera-count').textContent = `${shots.length} photo${shots.length > 1 ? 's' : ''} taken.${shots.length >= max ? '' : ' Take another, or tap Done.'}`;
      if (shots.length >= max) finish();
    });
    dlg.showModal();
  });
}

function stampedFrame(video, text) {
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  const g = c.getContext('2d');
  g.drawImage(video, 0, 0, c.width, c.height);
  const size = Math.max(14, Math.round(c.width / 38));
  const band = size * 2;
  g.fillStyle = 'rgba(11,27,61,.78)';
  g.fillRect(0, c.height - band, c.width, band);
  g.fillStyle = '#fff';
  g.font = `600 ${size}px Roboto, Arial, sans-serif`;
  g.textBaseline = 'middle';
  g.fillText(text, size * 0.6, c.height - band / 2, c.width - size * 1.2);
  let out;
  for (const quality of [0.82, 0.72, 0.62]) {
    out = c.toDataURL('image/jpeg', quality);
    if (out.length * 0.75 < 450 * 1024) break;
  }
  return out;
}

// A small picker: thumbnails with × to remove, and a note. With `getStamp`, the main button opens the
// TrustGap camera, and choosing from the phone stays available only as a flagged fallback.
// Returns { list() } with the photos ready to send.
export function photoPicker({ grid, input, add, note, max, hint, getStamp, cameraButton, fallback }) {
  const photos = [];
  const draw = () => {
    show(grid, html`${photos.map((p, i) => html`<figure><img src="${p.data}" alt="Photo ${i + 1}">
      ${p.source === 'camera' ? html`<span class="photo-tag">TrustGap camera</span>` : ''}
      <button type="button" class="photo-del" data-del="${i}" aria-label="Remove photo ${i + 1}">×</button></figure>`)}`);
    add.hidden = photos.length >= max;
    if (cameraButton) cameraButton.hidden = photos.length >= max;
    note.textContent = photos.length ? `${photos.length} of ${max} photo${max > 1 ? 's' : ''} added.` : hint;
  };
  input.addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, max - photos.length);
    e.target.value = '';
    note.textContent = 'Preparing photos…';
    for (const file of files) {
      try {
        photos.push(await uploadedPhoto(file));
      } catch {
        draw();
        note.textContent = `“${file.name}” couldn’t be read. Try a JPG or PNG photo.`;
        return;
      }
    }
    draw();
  });
  if (cameraButton && getStamp) {
    if (!cameraSupported()) {
      cameraButton.hidden = true;
      if (fallback) fallback.open = true;
    }
    cameraButton.addEventListener('click', async () => {
      try {
        const stamp = await getStamp();
        photos.push(...await openCamera({ stamp, max: max - photos.length }));
        draw();
      } catch (err) {
        note.textContent = err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or use “Can’t use the camera?” below.'
          : 'The camera couldn’t start on this phone. Use “Can’t use the camera?” below.';
        if (fallback) fallback.open = true;
      }
    });
  }
  grid.addEventListener('click', (e) => {
    const i = e.target.closest('[data-del]')?.dataset.del;
    if (i == null) return;
    photos.splice(Number(i), 1);
    draw();
  });
  draw();
  return { list: () => [...photos] };
}
