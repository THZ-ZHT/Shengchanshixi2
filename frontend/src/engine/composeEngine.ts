import { drawSubjectWithRelief } from '../utils/composePreview';

/**
 * Local demo compose engine.
 *
 * Offscreen canvas pipeline: salient matting -> checkerboard matte -> background
 * compose -> warm light -> contact shadow -> color harmonize. Demo-grade quality;
 * the UI labels it "本地演示引擎".
 */

export interface ComposeParams {
  tempK: number;
  shadowIntensity: number;
  harmonizeStrength: number;
  exposure: number;
  edgeFeather: number;
}

export interface EngineOutput {
  mask: HTMLCanvasElement;
  matte: HTMLCanvasElement;
  subject: HTMLCanvasElement;
  background: HTMLCanvasElement;
  result: HTMLCanvasElement;
  bbox: { x: number; y: number; w: number; h: number };
}

export const ENGINE_W = 1536;
export const ENGINE_H = 854;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  return ctx;
}

/** Draw image covering the canvas (center crop). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  W: number,
  H: number,
): void {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/** Estimate background color from image border pixels. */
function estimateBackground(data: Uint8ClampedArray, W: number, H: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const strip = Math.max(2, Math.round(Math.min(W, H) * 0.04));
  const sample = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < strip || x >= W - strip || y < strip || y >= H - strip) sample(x, y);
    }
  }
  return [r / n, g / n, b / n];
}

/** Morphological pass with a 3x3 kernel. `dilate` grows, otherwise erodes. */
function morph(bin: Float32Array, W: number, H: number, dilate: boolean): Float32Array {
  const out = new Float32Array(bin.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = Math.min(H - 1, Math.max(0, y + dy));
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const v = bin[yy * W + xx];
          acc = dilate ? Math.max(acc, v) : Math.min(acc, v);
        }
      }
      out[y * W + x] = acc;
    }
  }
  return out;
}

/** Simple box blur used as edge feathering. */
function blurAlpha(a: Float32Array, W: number, H: number, radius: number): Float32Array {
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < H; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = sum / (2 * r + 1);
      const outX = Math.min(W - 1, x + r + 1);
      const inX = Math.max(0, x - r);
      sum += a[y * W + outX] - a[y * W + inX];
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / (2 * r + 1);
      const outY = Math.min(H - 1, y + r + 1);
      const inY = Math.max(0, y - r);
      sum += tmp[outY * W + x] - tmp[inY * W + x];
    }
  }
  return out;
}

interface AlphaResult {
  alpha: Float32Array;
  bbox: { x: number; y: number; w: number; h: number };
}

/** Salient matting: border color distance + center gaussian weight. */
function computeAlpha(data: Uint8ClampedArray, W: number, H: number): AlphaResult {
  const [br, bg, bb] = estimateBackground(data, W, H);
  const alpha = new Float32Array(W * H);
  const cx = W / 2;
  const cy = H * 0.55;
  const norm = Math.sqrt(W * W + H * H);
  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dr = data[i] - br;
      const dg = data[i + 1] - bg;
      const db = data[i + 2] - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;
      const dx = (x - cx) / norm;
      const dy = (y - cy) / norm;
      const weight = 0.55 + 0.45 * Math.exp(-(dx * dx + dy * dy) * 8);
      let a = (dist - 0.06) / 0.18;
      a = Math.max(0, Math.min(1, a)) * weight;
      alpha[y * W + x] = a;
    }
  }
  // binarize -> open (erode then dilate) -> feather
  const bin = new Float32Array(W * H);
  for (let i = 0; i < bin.length; i++) bin[i] = alpha[i] > 0.5 ? 1 : 0;
  const opened = morph(morph(bin, W, H, false), W, H, true);
  const soft = blurAlpha(opened, W, H, 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.max(soft[y * W + x], alpha[y * W + x] * 0.85);
      alpha[y * W + x] = Math.max(0, Math.min(1, v));
      if (v > 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bbox =
    maxX > minX
      ? { x: minX / W, y: minY / H, w: (maxX - minX) / W, h: (maxY - minY) / H }
      : { x: 0.2, y: 0.1, w: 0.4, h: 0.8 };
  return { alpha, bbox };
}

function alphaToMaskCanvas(alpha: Float32Array, W: number, H: number): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < alpha.length; i++) {
    const v = Math.round(alpha[i] * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const p = makeCanvas(16, 16);
  const pctx = ctx2d(p);
  pctx.fillStyle = '#e8e8e6';
  pctx.fillRect(0, 0, 16, 16);
  pctx.fillStyle = '#c9c9c5';
  pctx.fillRect(0, 0, 8, 8);
  pctx.fillRect(8, 8, 8, 8);
  return ctx.createPattern(p, 'repeat') as CanvasPattern;
}

export interface ComposeInput {
  source?: HTMLImageElement | null;
  sourceUrl?: string;
  bgUrl?: string;
  bgImage?: HTMLImageElement | null;
  params: ComposeParams;
  /** Skip salient matting when the source already carries an alpha channel. */
  skipMatting?: boolean;
}

/** Apply a blur filter to a canvas for soft-expanding the subject edge. */
function featherCanvas(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  if (radius <= 0) {
    ctx.drawImage(src, 0, 0);
    return c;
  }
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Apply a brightness filter to a canvas for exposure correction. */
function adjustExposure(src: HTMLCanvasElement, exposure: number): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  ctx.filter = `brightness(${exposure})`;
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Full local pipeline. Returns every intermediate canvas as an artifact. */
export async function compose(input: ComposeInput): Promise<EngineOutput> {
  const { loadImage } = await import('./layers');
  const source = input.source ?? (input.sourceUrl ? await loadImage(input.sourceUrl) : null);
  if (!source) throw new Error('compose: source image required');
  const bgImg = input.bgImage ?? (input.bgUrl ? await loadImage(input.bgUrl) : null);
  if (!bgImg) throw new Error('compose: background image required');

  const W = ENGINE_W;
  const H = ENGINE_H;

  // 1. sample source pixels
  const srcCanvas = makeCanvas(W, H);
  const srcCtx = ctx2d(srcCanvas);
  drawCover(srcCtx, source, W, H);
  const srcData = srcCtx.getImageData(0, 0, W, H);

  // 2. alpha mask
  let alpha: Float32Array;
  let bbox: EngineOutput['bbox'];
  if (input.skipMatting) {
    alpha = new Float32Array(W * H);
    bbox = { x: 0.19, y: 0.05, w: 0.4, h: 0.93 };
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = srcData.data[i * 4 + 3] / 255;
    }
  } else {
    const r = computeAlpha(srcData.data, W, H);
    alpha = r.alpha;
    bbox = r.bbox;
  }
  const mask = alphaToMaskCanvas(alpha, W, H);

  // 3. subject layer = source masked by alpha
  const subject = makeCanvas(W, H);
  const subjCtx = ctx2d(subject);
  subjCtx.drawImage(srcCanvas, 0, 0);
  subjCtx.globalCompositeOperation = 'destination-in';
  subjCtx.drawImage(mask, 0, 0);
  subjCtx.globalCompositeOperation = 'source-over';

  // 4. checkerboard matte visualization
  const matte = makeCanvas(W, H);
  const matteCtx = ctx2d(matte);
  matteCtx.fillStyle = checkerPattern(matteCtx);
  matteCtx.fillRect(0, 0, W, H);
  matteCtx.drawImage(subject, 0, 0);

  // 5. background layer
  const background = makeCanvas(W, H);
  drawCover(ctx2d(background), bgImg, W, H);

  // 6. final composite: bg + subject + warm light + contact shadow + grade
  const result = makeCanvas(W, H);
  const rctx = ctx2d(result);
  rctx.drawImage(background, 0, 0);

  // soft-feather the subject edge if requested (outpainting-style adaptation)
  const subjectToUse =
    input.params.edgeFeather > 0 ? featherCanvas(subject, input.params.edgeFeather) : subject;
  drawSubjectWithRelief(rctx, subjectToUse, 0, 0, W, H);

  // warm key light from upper-right (sun direction)
  const light = rctx.createRadialGradient(W * 0.76, H * 0.4, 0, W * 0.76, H * 0.4, W * 0.55);
  const warmth = input.params.tempK >= 5000 ? 0.4 : 0.18;
  light.addColorStop(0, `rgba(255,196,120,${warmth})`);
  light.addColorStop(1, 'rgba(255,196,120,0)');
  rctx.fillStyle = light;
  rctx.fillRect(0, 0, W, H);

  // contact shadow ellipse at subject feet
  const feetX = (bbox.x + bbox.w / 2) * W;
  const feetY = Math.min(H - 8, (bbox.y + bbox.h) * H);
  rctx.save();
  rctx.translate(feetX, feetY);
  rctx.scale(1, 0.22);
  const shadow = rctx.createRadialGradient(0, 0, 0, 0, 0, bbox.w * W * 0.65);
  shadow.addColorStop(0, `rgba(20,16,12,${0.45 * input.params.shadowIntensity})`);
  shadow.addColorStop(1, 'rgba(20,16,12,0)');
  rctx.fillStyle = shadow;
  rctx.beginPath();
  rctx.arc(0, 0, bbox.w * W * 0.65, 0, Math.PI * 2);
  rctx.fill();
  rctx.restore();

  // harmonize grade pass (apply filter through an intermediate canvas)
  const hs = input.params.harmonizeStrength;
  if (hs > 0) {
    const graded = makeCanvas(W, H);
    const gctx = ctx2d(graded);
    gctx.filter = `saturate(${(1 + 0.06 * hs).toFixed(3)}) contrast(${(1 + 0.05 * hs).toFixed(3)}) sepia(${(0.07 * hs).toFixed(3)})`;
    gctx.drawImage(result, 0, 0);
    rctx.clearRect(0, 0, W, H);
    rctx.drawImage(graded, 0, 0);
    rctx.fillStyle = `rgba(255,170,90,${0.08 * hs})`;
    rctx.fillRect(0, 0, W, H);
  }

  // 7. overall exposure correction
  const finalResult =
    input.params.exposure !== 1 && input.params.exposure > 0
      ? adjustExposure(result, input.params.exposure)
      : result;

  return { mask, matte, subject, background, result: finalResult, bbox };
}
