import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { prefersReducedMotion } from '../store/compositionStore';

export interface UseRevealOptions {
  /** Reveal only once (default) or re-hide when scrolled out of view. */
  once?: boolean;
  /** IntersectionObserver threshold. */
  threshold?: number;
  /** IntersectionObserver rootMargin. */
  rootMargin?: string;
  /**
   * Optional selector for descendants that should be revealed with a stagger
   * instead of the observed element itself (e.g. `[data-reveal-item]`).
   */
  childSelector?: string;
  /** Stagger step between children, in ms. */
  stagger?: number;
  /** Called once the element becomes visible (use for custom GSAP work). */
  onReveal?: (el: HTMLElement) => void;
}

/** Global class names declared in `styles/global.css`. */
const REVEAL_IN = 'revealIn';

/**
 * Scroll reveal via IntersectionObserver.
 *
 * The target (or its `childSelector` descendants) must carry the global
 * `reveal` class for the hidden start state; this hook adds `revealIn` when the
 * element enters the viewport. Under `prefers-reduced-motion: reduce` the final
 * state is applied immediately and no observer is created.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  opts: UseRevealOptions = {},
): RefObject<T> {
  const ref = useRef<T>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const {
      once = true,
      threshold = 0.15,
      rootMargin = '0px 0px -8% 0px',
      childSelector,
      stagger = 80,
    } = optsRef.current;

    const targets = (): HTMLElement[] =>
      childSelector
        ? Array.from(el.querySelectorAll<HTMLElement>(childSelector))
        : [el as HTMLElement];

    const reduced = prefersReducedMotion();

    const show = (): void => {
      targets().forEach((t, i) => {
        t.style.transitionDelay = reduced ? '0ms' : `${i * stagger}ms`;
        t.classList.add(REVEAL_IN);
      });
      optsRef.current.onReveal?.(el as HTMLElement);
    };

    const hide = (): void => {
      targets().forEach((t) => {
        t.style.transitionDelay = '0ms';
        t.classList.remove(REVEAL_IN);
      });
    };

    if (reduced || typeof IntersectionObserver === 'undefined') {
      show();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            show();
            if (once) io.disconnect();
          } else if (!once) {
            hide();
          }
        });
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
