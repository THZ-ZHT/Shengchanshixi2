import { useRef } from 'react';
import { TWEEN, seekProgress } from '../../store/compositionStore';
import { useGsapTicker } from '../../hooks/useGsapTicker';
import styles from '../../styles/showcase.module.css';

/**
 * Bottom composition controller: ORIGINAL/FINAL endcaps, track, deep-green
 * fill, double-ring handle and live percentage. All per-frame values are
 * written straight to the DOM.
 */
export default function CompositionSlider(): JSX.Element {
  const fillRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useGsapTicker(() => {
    const p = TWEEN.progress;
    if (fillRef.current) fillRef.current.style.width = `${p}%`;
    if (handleRef.current) handleRef.current.style.left = `${p}%`;
    if (pctRef.current) pctRef.current.textContent = `${Math.round(p)}%`;
  });

  const seekFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    seekProgress(((clientX - rect.left) / rect.width) * 100);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekFromEvent(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div className={styles.controllerRow}>
      <span className={styles.endcap}>原图</span>
      <div
        ref={trackRef}
        className={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className={styles.trackLine} />
        <div ref={fillRef} className={styles.trackFill} />
        <div ref={handleRef} className={styles.handle}>
          <div className={styles.handleCore} />
        </div>
      </div>
      <span ref={pctRef} className={styles.pct}>
        0%
      </span>
      <span className={`${styles.endcap} ${styles.endcapRight}`}>成片</span>
    </div>
  );
}
