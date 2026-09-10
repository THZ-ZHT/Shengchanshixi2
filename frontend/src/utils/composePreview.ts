/**
 * Browser-side preview composition: place the extracted subject onto a chosen
 * background with sensible scaling, centering, contact shadow, and a soft
 * color-grading pass to help the subject blend with the new lighting.
 */

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载图片失败: ${src}`));
    img.src = src;
  });

/** Draw a soft elliptical contact shadow under the subject. */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  grad.addColorStop(0, 'rgba(20, 26, 24, 0.55)');
  grad.addColorStop(0.55, 'rgba(20, 26, 24, 0.22)');
  grad.addColorStop(1, 'rgba(20, 26, 24, 0)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.filter = 'blur(6px)';
  ctx.fill();
  ctx.restore();
}

/** Build a slight color matrix that warms + saturates the subject to match a typical evening photo. */
function colorGradeSubject(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Use a temporary offscreen layer to apply filter only to the subject
  // (already drawn at the top of the canvas).
  const sample = ctx.getImageData(0, 0, w, h);
  const d = sample.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    // mild saturation boost + warm tint
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    d[i] = Math.min(255, lum + (r - lum) * 1.06 + 6);
    d[i + 1] = Math.min(255, lum + (g - lum) * 1.04 + 2);
    d[i + 2] = Math.min(255, lum + (b - lum) * 1.02);
  }
  ctx.putImageData(sample, 0, 0);
}

/** Pre-blur the subject's alpha edge so it soft-expands into the background. */
function featherSubject(subject: HTMLImageElement, radius: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = subject.naturalWidth;
  c.height = subject.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.filter = `blur(${Math.max(0, radius)}px)`;
  ctx.drawImage(subject, 0, 0);
  return c;
}

/**
 * Draw the subject with a subtle "relief" treatment so it reads as a solid
 * object rather than a flat paper cut-out:
 *   1. a darkened, downward-offset copy = lifted thickness / parallax edge
 *   2. a top highlight -> bottom shadow vertical ramp = cylindrical volume
 *   3. (optional) a soft contact rim around the silhouette.
 *
 * Rendering happens on an offscreen canvas so the shading is clipped to the
 * subject alpha and never bleeds onto the background.
 */
export function drawSubjectWithRelief(
  ctx: CanvasRenderingContext2D,
  subject: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const o = off.getContext('2d');
  if (!o) return;

  // 1. thickness — a darkened copy shifted down, clipped to the subject shape.
  const depth = Math.max(2, Math.round(sh * 0.014));
  o.save();
  o.drawImage(subject, sx, sy + depth, sw, sh);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = 'rgba(10, 15, 18, 0.5)';
  o.fillRect(0, 0, W, H);
  o.restore();

  // 2. the subject body on top.
  o.drawImage(subject, sx, sy, sw, sh);

  // 3. cylindrical volume shading, clipped to the subject alpha.
  o.globalCompositeOperation = 'source-atop';
  const grad = o.createLinearGradient(0, sy, 0, sy + sh);
  grad.addColorStop(0, 'rgba(255, 242, 216, 0.16)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(8, 13, 16, 0.34)');
  o.fillStyle = grad;
  o.fillRect(0, 0, W, H);

  // 4. soft contact rim — dark halo hugging the silhouette edge.
  o.globalCompositeOperation = 'source-over';
  o.save();
  o.shadowColor = 'rgba(8, 12, 14, 0.5)';
  o.shadowBlur = Math.max(2, Math.round(sh * 0.02));
  o.drawImage(subject, sx, sy, sw, sh);
  o.restore();

  ctx.drawImage(off, 0, 0);
}

export interface ComposeOptions {
  /** Background image URL or DataURL. */
  backgroundSrc: string;
  /** Subject RGBA PNG DataURL. */
  subjectDataURL: string;
  /** Original image dimensions hint (used for canvas size). */
  width?: number;
  height?: number;
  /** How much of the background the subject should occupy (0..1, default 0.55). */
  subjectScale?: number;
  /** Vertical position: 0 = top, 1 = bottom. Default 0.7 (lower-half). */
  subjectAnchorY?: number;
  /** Whether to add a soft contact shadow under the subject (default true). */
  withShadow?: boolean;
  /** Whether to apply a mild color-grade to the subject (default true). */
  withGrade?: boolean;
  /** Whether to apply the relief/volume treatment (default true). */
  withRelief?: boolean;
  /** Overall exposure multiplier, e.g. 0.9 = darker, 1.1 = brighter (default 1). */
  exposure?: number;
  /** Feather radius around the subject silhouette for softer integration (default 0). */
  edgeFeather?: number;
}

export async function composeUserPreview(opts: ComposeOptions): Promise<string> {
  const [subject, background] = await Promise.all([
    loadImage(opts.subjectDataURL),
    loadImage(opts.backgroundSrc),
  ]);

  // Use the background's intrinsic dimensions as the canvas size so the
  // composition reads at the user's intended output resolution.
  const w = opts.width ?? background.naturalWidth;
  const h = opts.height ?? background.naturalHeight;
  const scale = Math.max(1, Math.min(1.5, opts.subjectScale ?? 0.55));
  const anchorY = Math.max(0, Math.min(1, opts.subjectAnchorY ?? 0.72));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d 不可用');

  // 1. Background with cover fit.
  const bgScale = Math.max(w / background.naturalWidth, h / background.naturalHeight);
  const bgW = background.naturalWidth * bgScale;
  const bgH = background.naturalHeight * bgScale;
  ctx.drawImage(background, (w - bgW) / 2, (h - bgH) / 2, bgW, bgH);

  // 2. Subject sized to scale*background-height, centered horizontally.
  const subjH = h * scale;
  const aspect = subject.naturalWidth / Math.max(1, subject.naturalHeight);
  const subjW = subjH * aspect;
  const sx = (w - subjW) / 2;
  const sy = h * anchorY - subjH * 0.85; // anchor at upper third of subject

  // 3. Feather the subject silhouette if requested (soft extension into bg).
  const edgeFeather = Math.max(0, opts.edgeFeather ?? 0);
  const subjectToDraw: CanvasImageSource =
    edgeFeather > 0 ? featherSubject(subject, edgeFeather) : subject;

  // 4. Soft shadow under the subject (slightly elliptical).
  if (opts.withShadow !== false) {
    const shadowY = sy + subjH * 0.95;
    drawContactShadow(ctx, w / 2, shadowY, subjW * 0.5, subjH * 0.08);
  }

  // 5. Subject on top, with its alpha respected (plus a relief/volume pass).
  if (opts.withRelief === false) {
    ctx.drawImage(subjectToDraw, sx, sy, subjW, subjH);
  } else {
    drawSubjectWithRelief(ctx, subjectToDraw, sx, sy, subjW, subjH);
  }

  // 6. Mild color grading to help the subject blend with the new lighting.
  if (opts.withGrade !== false) colorGradeSubject(ctx, w, h);

  // 7. Overall exposure correction.
  if (opts.exposure && opts.exposure !== 1) {
    const exposed = document.createElement('canvas');
    exposed.width = w;
    exposed.height = h;
    const ectx = exposed.getContext('2d');
    if (ectx) {
      ectx.filter = `brightness(${opts.exposure})`;
      ectx.drawImage(canvas, 0, 0);
      return exposed.toDataURL('image/png');
    }
  }

  return canvas.toDataURL('image/png');
}