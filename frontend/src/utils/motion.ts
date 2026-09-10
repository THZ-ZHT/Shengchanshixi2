import gsap from 'gsap';
import { prefersReducedMotion } from '../store/compositionStore';

/**
 * Reusable GSAP motion primitives.
 *
 * Every primitive follows the same contract:
 * 1. It never triggers React state updates (DOM / GSAP only).
 * 2. When `prefers-reduced-motion: reduce` is active it jumps straight to the
 *    final visual state and returns a no-op cleanup (loops never start).
 * 3. It returns a cleanup function that kills tweens and detaches listeners.
 */

/** Cleanup handle returned by every primitive. */
export type Cleanup = () => void;

const NOOP: Cleanup = () => {};

/** Normalize a loose element collection into a dense HTMLElement array. */
function toElements(
  input: ArrayLike<Element | null> | Element | null | undefined,
): HTMLElement[] {
  if (!input) return [];
  if (input instanceof Element) return [input as HTMLElement];
  const out: HTMLElement[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const el = input[i];
    if (el instanceof HTMLElement) out.push(el);
  }
  return out;
}

/** Clamp helper (kept local so this module has no extra imports). */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/* ------------------------------------------------------------------ */
/* entrance                                                            */
/* ------------------------------------------------------------------ */

export interface RevealOptions {
  /** Vertical offset the element rises from, in px. */
  y?: number;
  /** Tween duration in seconds. */
  duration?: number;
  /** Tween delay in seconds. */
  delay?: number;
  /** GSAP ease string. */
  ease?: string;
}

/**
 * Fade + rise a single element into view. `transform` is cleared when the
 * tween finishes so the element never keeps a stale containing block.
 */
export function revealIn(el: Element | null, opts: RevealOptions = {}): Cleanup {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return NOOP;
  const { y = 18, duration = 0.7, delay = 0, ease = 'power2.out' } = opts;
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0, clearProps: 'transform' });
    return NOOP;
  }
  const tween = gsap.fromTo(
    el,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration, delay, ease, clearProps: 'transform' },
  );
  return () => {
    tween.kill();
  };
}

export interface StaggerOptions extends RevealOptions {
  /** Delay between consecutive elements, in seconds. */
  stagger?: number;
}

/** Fade + rise a group of elements with a small offset between each. */
export function staggerIn(
  els: ArrayLike<Element | null> | Element | null | undefined,
  opts: StaggerOptions = {},
): Cleanup {
  const list = toElements(els);
  if (list.length === 0) return NOOP;
  const { y = 18, duration = 0.7, delay = 0, ease = 'power2.out', stagger = 0.08 } = opts;
  if (prefersReducedMotion()) {
    gsap.set(list, { opacity: 1, y: 0, clearProps: 'transform' });
    return NOOP;
  }
  const tween = gsap.fromTo(
    list,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration, delay, ease, stagger, clearProps: 'transform' },
  );
  return () => {
    tween.kill();
  };
}

/* ------------------------------------------------------------------ */
/* numeric readouts                                                    */
/* ------------------------------------------------------------------ */

export interface CountUpOptions {
  /** Starting value (defaults to 0). */
  from?: number;
  duration?: number;
  delay?: number;
  /** Fixed decimals written to the DOM. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  ease?: string;
}

/**
 * Animate a numeric readout by writing `textContent` on every frame.
 * No React state is involved, so this is safe inside render-heavy views.
 */
export function countUp(el: Element | null, to: number, opts: CountUpOptions = {}): Cleanup {
  if (!(el instanceof HTMLElement)) return NOOP;
  const {
    from = 0,
    duration = 0.9,
    delay = 0,
    decimals = 0,
    prefix = '',
    suffix = '',
    ease = 'power2.out',
  } = opts;
  const write = (v: number): void => {
    el.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
  };
  if (prefersReducedMotion()) {
    write(to);
    return NOOP;
  }
  const box = { v: from };
  write(from);
  const tween = gsap.to(box, {
    v: to,
    duration,
    delay,
    ease,
    onUpdate: () => write(box.v),
    onComplete: () => write(to),
  });
  return () => {
    tween.kill();
  };
}

/* ------------------------------------------------------------------ */
/* pointer-driven micro motion                                         */
/* ------------------------------------------------------------------ */

export interface TiltOptions {
  /** Maximum rotation on each axis, in degrees. */
  max?: number;
  /** CSS perspective applied to the tilted element. */
  perspective?: number;
  /** Tween duration for the follow easing, in seconds. */
  duration?: number;
}

/**
 * 3D tilt that follows the pointer inside `el`. Also publishes `--mx` / `--my`
 * (pointer position in percent) so descendants can drive a surface highlight.
 */
export function tilt(el: Element | null, opts: TiltOptions = {}): Cleanup {
  if (!(el instanceof HTMLElement)) return NOOP;
  const { max = 6, perspective = 900, duration = 0.5 } = opts;
  el.style.setProperty('--mx', '50%');
  el.style.setProperty('--my', '50%');
  if (prefersReducedMotion()) return NOOP;

  gsap.set(el, { transformPerspective: perspective, transformOrigin: '50% 50%' });
  const rotX = gsap.quickTo(el, 'rotationX', { duration, ease: 'power3.out' });
  const rotY = gsap.quickTo(el, 'rotationY', { duration, ease: 'power3.out' });

  let rect = el.getBoundingClientRect();
  const refresh = (): void => {
    rect = el.getBoundingClientRect();
  };

  const onMove = (e: PointerEvent): void => {
    if (rect.width === 0 || rect.height === 0) refresh();
    if (rect.width === 0 || rect.height === 0) return;
    const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    el.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
    rotY((px - 0.5) * 2 * max);
    rotX(-(py - 0.5) * 2 * max);
  };

  const onLeave = (): void => {
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
    rotX(0);
    rotY(0);
  };

  el.addEventListener('pointerenter', refresh);
  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerleave', onLeave);
  window.addEventListener('scroll', refresh, { passive: true });
  window.addEventListener('resize', refresh);

  return () => {
    el.removeEventListener('pointerenter', refresh);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('scroll', refresh);
    window.removeEventListener('resize', refresh);
    gsap.killTweensOf(el);
    gsap.set(el, { rotationX: 0, rotationY: 0, clearProps: 'transform' });
  };
}

export interface MagneticOptions {
  /** Maximum displacement in px. */
  strength?: number;
  /** Extra pull radius outside the element box, in px. */
  radius?: number;
}

/** Subtle magnetic pull: the element leans toward a nearby pointer. */
export function magnetic(el: Element | null, opts: MagneticOptions = {}): Cleanup {
  if (!(el instanceof HTMLElement)) return NOOP;
  if (prefersReducedMotion()) return NOOP;
  const { strength = 6, radius = 90 } = opts;
  const xTo = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' });

  let rect = el.getBoundingClientRect();
  const refresh = (): void => {
    rect = el.getBoundingClientRect();
  };

  const onMove = (e: PointerEvent): void => {
    if (rect.width === 0) refresh();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const reach = radius + Math.max(rect.width, rect.height) / 2;
    const dist = Math.hypot(dx, dy);
    if (dist > reach) {
      xTo(0);
      yTo(0);
      return;
    }
    const falloff = 1 - dist / reach;
    xTo(clamp((dx / reach) * strength * 2, -strength, strength) * falloff);
    yTo(clamp((dy / reach) * strength * 2, -strength, strength) * falloff);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('scroll', refresh, { passive: true });
  window.addEventListener('resize', refresh);

  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('scroll', refresh);
    window.removeEventListener('resize', refresh);
    gsap.killTweensOf(el);
    gsap.set(el, { x: 0, y: 0, clearProps: 'transform' });
  };
}

/**
 * Click ripple. Injects a temporary span (global class `ic-ripple`, animated by
 * a CSS keyframe) and removes it as soon as the animation ends.
 * The host element must be `position: relative; overflow: hidden`.
 */
export function ripple(
  event: { clientX: number; clientY: number },
  el: Element | null,
): void {
  if (!(el instanceof HTMLElement)) return;
  if (prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const size = Math.max(rect.width, rect.height) * 1.15;
  const span = document.createElement('span');
  span.className = 'ic-ripple';
  span.style.width = `${size.toFixed(1)}px`;
  span.style.height = `${size.toFixed(1)}px`;
  span.style.left = `${(event.clientX - rect.left - size / 2).toFixed(1)}px`;
  span.style.top = `${(event.clientY - rect.top - size / 2).toFixed(1)}px`;
  el.appendChild(span);
  const remove = (): void => {
    if (span.parentNode) span.parentNode.removeChild(span);
  };
  span.addEventListener('animationend', remove, { once: true });
  window.setTimeout(remove, 900);
}

/* ------------------------------------------------------------------ */
/* decorative loops                                                    */
/* ------------------------------------------------------------------ */

export interface FloatOptions {
  /** Peak offset in px (the element travels ±amplitude). */
  amplitude?: number;
  duration?: number;
  delay?: number;
}

/** Gentle vertical float for decorative elements only. */
export function floatLoop(el: Element | null, opts: FloatOptions = {}): Cleanup {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return NOOP;
  if (prefersReducedMotion()) return NOOP;
  const { amplitude = 4, duration = 2.5, delay = 0 } = opts;
  const tween = gsap.fromTo(
    el,
    { y: -amplitude },
    { y: amplitude, duration, delay, ease: 'sine.inOut', yoyo: true, repeat: -1 },
  );
  return () => {
    tween.kill();
    gsap.set(el, { y: 0, clearProps: 'transform' });
  };
}

/* ------------------------------------------------------------------ */
/* SVG                                                                 */
/* ------------------------------------------------------------------ */

export interface DrawStrokeOptions {
  duration?: number;
  delay?: number;
  ease?: string;
}

/** Draw an SVG path by animating `stroke-dashoffset` from full length to 0. */
export function drawStroke(
  el: SVGGeometryElement | null,
  opts: DrawStrokeOptions = {},
): Cleanup {
  if (!el || typeof el.getTotalLength !== 'function') return NOOP;
  let length = 0;
  try {
    length = el.getTotalLength();
  } catch {
    length = 0;
  }
  if (length <= 0) return NOOP;
  el.style.strokeDasharray = `${length}`;
  if (prefersReducedMotion()) {
    el.style.strokeDashoffset = '0';
    return NOOP;
  }
  el.style.strokeDashoffset = `${length}`;
  const tween = gsap.to(el, {
    strokeDashoffset: 0,
    duration: opts.duration ?? 1.2,
    delay: opts.delay ?? 0,
    ease: opts.ease ?? 'power2.inOut',
  });
  return () => {
    tween.kill();
  };
}
