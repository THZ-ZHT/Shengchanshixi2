import { DEMO } from '../constants/layout';

const cache = new Map<string, HTMLImageElement>();

/** Load an image (deduped by src). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit && hit.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
    img.src = src;
  });
}

/** Preload every keyframe the showcase needs before entering interactive mode. */
export async function loadDemoAssets(): Promise<void> {
  await Promise.all(
    [DEMO.grayCity, DEMO.subject, DEMO.final, DEMO.matte].map((src) => loadImage(src)),
  );
}

export function getCachedImage(src: string): HTMLImageElement | null {
  const hit = cache.get(src);
  return hit && hit.complete && hit.naturalWidth > 0 ? hit : null;
}
