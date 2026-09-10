/**
 * Lightweight in-browser subject extraction.
 *
 * Strategy: estimate the background colour from the outer 6% border of the
 * image (trimmed mean for robustness), then for each pixel compute its
 * Euclidean distance to that colour and map it to an alpha channel. The
 * resulting alpha is softened via a 3x3 blur followed by another 3x3 blur
 * and then a soft erode that pulls the boundary inward, producing a
 * feathered edge that blends naturally into the new background.
 *
 * Quality is "good enough for demo": strong on near-uniform backgrounds
 * (people, products), graceful on busy scenes (still produces a usable mask).
 * For production we would call BiRefNet / SAM-2; here we ship zero deps.
 */

export interface MattingInput {
  dataURL: string;
  /** Optional override for background colour (RGB 0–255). */
  bgHint?: [number, number, number];
  /** Optional outer-border fraction to sample (default 0.06). */
  borderFraction?: number;
  /** Output max dimension (downscaled for performance, default 1280). */
  maxDim?: number;
}

export interface MattingResult {
  subject: string; // RGBA PNG DataURL
  width: number;
  height: number;
  /** Mean alpha 0..255 — diagnostic for how "extractable" the photo was. */
  coverage: number;
}

interface LoadedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

async function loadImage(dataURL: string): Promise<LoadedImage> {
  const blob = await (await fetch(dataURL)).blob();
  const bitmap = await createImageBitmap(blob);
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

function sampleBorderColor(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  borderFraction: number,
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const band = Math.max(2, Math.floor(Math.min(w, h) * borderFraction));
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const onEdge = x < band || y < band || x >= w - band || y >= h - band;
      if (!onEdge) continue;
      const i = (y * w + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  // trimmed mean (drop top/bottom 10%) for robust background estimate.
  const trim = (arr: number[]) => {
    arr.sort((a, b) => a - b);
    const lo = Math.floor(arr.length * 0.1);
    const hi = arr.length - lo;
    let sum = 0;
    let cnt = 0;
    for (let i = lo; i < hi; i += 1) {
      sum += arr[i];
      cnt += 1;
    }
    return cnt > 0 ? sum / cnt : 0;
  };
  return [trim(rs), trim(gs), trim(bs)];
}

function dist2(r: number, g: number, b: number, bg: [number, number, number]): number {
  const dr = r - bg[0];
  const dg = g - bg[1];
  const db = b - bg[2];
  return dr * dr + dg * dg + db * db;
}

/** In-place box blur over the alpha channel. */
function blurAlpha(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  const src = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) src[p] = data[i + 3];
  const tmp = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          sum += src[ny * w + nx];
          cnt += 1;
        }
      }
      tmp[y * w + x] = sum / cnt;
    }
  }
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) data[i + 3] = tmp[p];
}

/** Pull alpha boundary inward so the cut feels more natural on the new bg. */
function erodeAlpha(data: Uint8ClampedArray, w: number, h: number, strength: number): void {
  const src = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) src[p] = data[i + 3];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = src[y * w + x];
      const v = a < 220 ? Math.max(0, a - strength) : a;
      data[i + 3] = v;
    }
  }
}

export async function extractSubject(input: MattingInput): Promise<MattingResult> {
  const { dataURL } = input;
  const borderFraction = input.borderFraction ?? 0.06;
  const maxDim = input.maxDim ?? 1280;
  const { bitmap, width, height } = await loadImage(dataURL);
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(bitmap, 0, 0, sw, sh);
  const imgData = ctx.getImageData(0, 0, sw, sh);
  const data = imgData.data;

  const bg = input.bgHint ?? sampleBorderColor(data, sw, sh, borderFraction);
  let totalAlpha = 0;

  // wider transition band gives a smoother edge that blends into any background.
  const threshold = 50 * 50;
  const full = 150 * 150;
  for (let i = 0; i < data.length; i += 4) {
    const d = dist2(data[i], data[i + 1], data[i + 2], bg);
    let a: number;
    if (d <= threshold) a = 0;
    else if (d >= full) a = 255;
    else a = Math.round(((d - threshold) / (full - threshold)) * 255);
    data[i + 3] = a;
    totalAlpha += a;
  }

  // 2-pass blur for a feathered edge:
  blurAlpha(data, sw, sh, 1);
  blurAlpha(data, sw, sh, 1);
  erodeAlpha(data, sw, sh, 12);

  ctx.putImageData(imgData, 0, 0);

  const subject = canvas.toDataURL('image/png');
  bitmap.close?.();
  return { subject, width: sw, height: sh, coverage: totalAlpha / (sw * sh * 255) };
}

/** Read a File / Blob into a DataURL string. */
export function fileToDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}