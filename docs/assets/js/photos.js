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

// A small picker: "+ Add photo" button, thumbnails with × to remove, and a note.
// Returns { list() } with the chosen photos as JPEG data URLs.
export function photoPicker({ grid, input, add, note, max, hint }) {
  const photos = [];
  const draw = () => {
    show(grid, html`${photos.map((src, i) => html`<figure><img src="${src}" alt="Photo ${i + 1}">
      <button type="button" class="photo-del" data-del="${i}" aria-label="Remove photo ${i + 1}">×</button></figure>`)}`);
    add.hidden = photos.length >= max;
    note.textContent = photos.length ? `${photos.length} of ${max} photo${max > 1 ? 's' : ''} added.` : hint;
  };
  input.addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, max - photos.length);
    e.target.value = '';
    note.textContent = 'Preparing photos…';
    for (const file of files) {
      try {
        photos.push(await shrinkPhoto(file));
      } catch {
        draw();
        note.textContent = `“${file.name}” couldn’t be read. Try a JPG or PNG photo, or a screenshot of it.`;
        return;
      }
    }
    draw();
  });
  grid.addEventListener('click', (e) => {
    const i = e.target.closest('[data-del]')?.dataset.del;
    if (i == null) return;
    photos.splice(Number(i), 1);
    draw();
  });
  draw();
  return { list: () => [...photos] };
}
