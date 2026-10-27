// Client-side image preparation. Images are resized and normalized in the browser
// so uploaded logos, signatures and photos stay small and embed cleanly in PDFs.
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export function assertImageFile(file) {
  if (!file) throw new Error('No file selected.');
  const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!ok.includes(String(file.type).toLowerCase())) {
    throw new Error('Please choose a PNG, JPG, or WebP image.');
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is larger than 8 MB. Please choose a smaller file.');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read. Try a different file.'));
    };
    img.src = url;
  });
}

/**
 * Resize an image to fit within maxWidth × maxHeight, preserving aspect ratio.
 * `format` is 'jpeg' (flattened on white) or 'png' (keeps transparency).
 */
export async function prepareImage(file, { maxWidth = 900, maxHeight = 400, format = 'png', quality = 0.9 } = {}) {
  assertImageFile(file);
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('That image has no readable dimensions.');
  const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, quality);
  return { dataUrl, width, height, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight };
}

export const prepareLogo = (file) => prepareImage(file, { maxWidth: 900, maxHeight: 400, format: 'png' });
export const prepareSignature = (file) => prepareImage(file, { maxWidth: 700, maxHeight: 300, format: 'png' });
export const preparePhoto = (file) => prepareImage(file, { maxWidth: 1200, maxHeight: 1200, format: 'jpeg', quality: 0.82 });

/** Pick a file through a hidden input and resolve with the File. */
export function pickFile({ accept = 'image/png,image/jpeg,image/webp' } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) reject(new Error('cancelled'));
      else resolve(file);
    });
    document.body.appendChild(input);
    input.click();
  });
}
