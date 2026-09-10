/**
 * Heightmap utilities for local image-to-3D.
 * Deliberately three.js-free: the caller builds geometry with a dynamic import.
 */

export interface Heightmap {
  size: number;
  /** normalized height values in [0,1], row-major */
  data: Float32Array;
  /** downsampled color texture (data URL) for the mesh material */
  textureDataUrl: string;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Build a sculpted heightmap at `size` x `size`.
 *
 * The depth field is driven primarily by the subject's alpha so the cut-out
 * reads as a raised bas-relief rather than a luminance-only heightmap:
 *   - background (alpha 0) is flattened to 0,
 *   - the subject (alpha 1) rises to 0.55..1.0,
 *   - luminance adds fine surface detail on top (0.45 * lum),
 *   - a radial "center bulge" adds a subtle convex form typical of a torso/head.
 *
 * `maskImage` (optional) further modulates height by its alpha channel.
 */
export function buildHeightmap(
  img: HTMLImageElement,
  size = 128,
  maskImage?: HTMLImageElement | null,
): Heightmap {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(img, 0, 0, size, size);
  const color = ctx.getImageData(0, 0, size, size);

  let mask: Uint8ClampedArray | null = null;
  if (maskImage) {
    const mc = makeCanvas(size, size);
    const mctx = mc.getContext('2d');
    if (mctx) {
      mctx.drawImage(maskImage, 0, 0, size, size);
      mask = mctx.getImageData(0, 0, size, size).data;
    }
  }

  // Convex "center bulge" centred slightly above mid so the head/torso dome out.
  const cx = size * 0.5;
  const cy = size * 0.42;
  const data = new Float32Array(size * size);
  for (let i = 0; i < data.length; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const r = color.data[i * 4];
    const g = color.data[i * 4 + 1];
    const b = color.data[i * 4 + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const w = mask ? mask[i * 4 + 3] / 255 : 1;
    const dx = (x - cx) / size;
    const dy = (y - cy) / size;
    const bulge = 1 + 0.18 * Math.exp(-(dx * dx + dy * dy) * 6);
    data[i] = w * (0.55 + 0.45 * lum) * bulge;
  }

  return { size, data, textureDataUrl: c.toDataURL('image/png') };
}
