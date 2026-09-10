import { useEffect, useRef } from 'react';

export type TickFn = (t: number) => void;

const fns = new Set<TickFn>();
let rafId = 0;
let lastT = 0;
let frames = 0;
let fpsWindowStart = 0;
const fpsState = { value: 0 };

/** Global FPS reading (updated twice a second). */
export function getFps(): number {
  return fpsState.value;
}

function loop(t: number): void {
  lastT = lastT || t;
  frames += 1;
  if (t - fpsWindowStart >= 500) {
    fpsState.value = Math.round((frames * 1000) / (t - fpsWindowStart));
    frames = 0;
    fpsWindowStart = t;
  }
  fns.forEach((fn) => fn(t));
  rafId = requestAnimationFrame(loop);
}

/**
 * Shared rAF ticker. All per-frame DOM/canvas writes go through this single
 * loop (one frame, many callbacks) so progress rendering never triggers React.
 */
export function useGsapTicker(fn: TickFn): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const cb: TickFn = (t) => ref.current(t);
    fns.add(cb);
    if (fns.size === 1) {
      lastT = 0;
      frames = 0;
      fpsWindowStart = performance.now();
      rafId = requestAnimationFrame(loop);
    }
    return () => {
      fns.delete(cb);
      if (fns.size === 0) cancelAnimationFrame(rafId);
    };
  }, []);
}
