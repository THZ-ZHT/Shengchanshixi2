import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './AppBackground.module.css';

/** Pointer parallax amplitude, in px. */
const AMP_A = 34;
const AMP_B = 24;

/**
 * Shared ambient background mounted once for the whole app.
 *
 * Layers: two blurred light blooms (deep green + gold) with slow CSS drift and
 * a smooth pointer parallax, a masked hairline grid and a faint grain.
 * Under `prefers-reduced-motion: reduce` the parallax listener is never
 * attached and the CSS drift is neutralised by the global reduced-motion rule,
 * leaving a completely static gradient.
 */
export default function AppBackground(): JSX.Element {
  const blobARef = useRef<HTMLDivElement>(null);
  const blobBRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const a = blobARef.current;
    const b = blobBRef.current;
    if (!a || !b || reduced) return;

    const axTo = gsap.quickTo(a, 'x', { duration: 1.4, ease: 'power3.out' });
    const ayTo = gsap.quickTo(a, 'y', { duration: 1.4, ease: 'power3.out' });
    const bxTo = gsap.quickTo(b, 'x', { duration: 1.8, ease: 'power3.out' });
    const byTo = gsap.quickTo(b, 'y', { duration: 1.8, ease: 'power3.out' });

    const onMove = (e: PointerEvent): void => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nx = (e.clientX / w) * 2 - 1;
      const ny = (e.clientY / h) * 2 - 1;
      axTo(nx * AMP_A);
      ayTo(ny * AMP_A * 0.7);
      bxTo(-nx * AMP_B);
      byTo(-ny * AMP_B * 0.7);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      gsap.killTweensOf([a, b]);
      gsap.set([a, b], { x: 0, y: 0 });
    };
  }, [reduced]);

  return (
    <div className={styles.root} aria-hidden="true">
      <div ref={blobARef} className={styles.blobWrapA}>
        <div className={styles.blobA} />
      </div>
      <div ref={blobBRef} className={styles.blobWrapB}>
        <div className={styles.blobB} />
      </div>
      <div className={styles.grid} />
      <div className={styles.noise} />
    </div>
  );
}
