import type { NodeVersion } from '../types';
import type { WorkspaceParams as StoreParams } from '../store/workspaceStore';

export type ExportFormat = 'png' | 'jpg';
export type ExportSize = 1024 | 2048;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return ctx;
}

/** Draw a source image/canvas cover-cropped into a square-ish target size. */
export function drawCoverScaled(
  source: HTMLCanvasElement | HTMLImageElement,
  size: ExportSize,
  aspect = 1536 / 854,
): HTMLCanvasElement {
  const W = size;
  const H = Math.round(size / aspect);
  const out = makeCanvas(W, H);
  const ctx = ctx2d(out);
  const iw = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const ih = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  if (source instanceof HTMLImageElement) {
    ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  return out;
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Export an asset source (canvas or image URL) as PNG/JPG at a given size.
 * Falls back to the demo final frame when no canvas is available.
 */
export async function exportImage(
  source: HTMLCanvasElement | string | null,
  format: ExportFormat,
  size: ExportSize,
  name: string,
): Promise<void> {
  const { loadImage } = await import('../engine/layers');
  let drawn: HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) {
    drawn = drawCoverScaled(source, size);
  } else {
    const src = source ?? '/assets/demo/kf_final.png';
    const img = await loadImage(src);
    drawn = drawCoverScaled(img, size);
  }
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const url = drawn.toDataURL(mime, 0.92);
  downloadDataUrl(url, `${name}.${format}`);
}

/** Download run metadata next to the image. */
export function exportMetadata(
  params: StoreParams,
  versions: NodeVersion[],
  format: ExportFormat,
  size: ExportSize,
): void {
  const meta = {
    format,
    size,
    createdAt: new Date().toISOString(),
    params,
    versionsCount: versions.length,
    versions: versions.map((v) => ({ versionId: v.versionId, params: v.params })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
  );
  downloadDataUrl(url, 'imagecompose-metadata.json');
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
