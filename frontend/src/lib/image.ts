// Normalizes a screenshot on the phone: one image at a time, decoded once (browser applies EXIF rotation),
// re-encoded as JPEG (which drops metadata), long edge <= 1,600 px, <= 2.56 MP and <= 1.2 MB.
// The resulting Blob is exactly what the person previews, consents to, and what is sent.

export const MAX_SOURCE_BYTES = 12_000_000;
export const MAX_UPLOAD_BYTES = 1_200_000;
const LONG_EDGE = 1600;
const MAX_PIXELS = 2_560_000;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  dark: boolean;
}

export class ImageError extends Error {}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError("unreadable"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError("encode"))), "image/jpeg", quality),
  );
}

function isDark(canvas: HTMLCanvasElement): boolean {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  c.width = c.height = 0;
  return sum / (data.length / 4) < 60;
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.size === 0) throw new ImageError("empty");
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError("tooBig");
  if (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ImageError("type");
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h || Math.max(w, h) > 8192 || w * h > 16_000_000) throw new ImageError("tooBig");

  let scale = Math.min(1, LONG_EDGE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("canvas");
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.floor(w * scale));
      canvas.height = Math.max(1, Math.floor(h * scale));
      ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await toBlob(canvas, quality);
        if (blob.size <= MAX_UPLOAD_BYTES) return { blob, width: canvas.width, height: canvas.height, dark: isDark(canvas) };
      }
      scale *= 0.8;
    }
    throw new ImageError("tooBig");
  } finally {
    canvas.width = canvas.height = 0; // release the bitmap promptly on low-memory phones
  }
}
