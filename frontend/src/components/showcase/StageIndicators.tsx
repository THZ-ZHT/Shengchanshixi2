import { useRef } from 'react';
import { TWEEN, seekProgress } from '../../store/compositionStore';
import { useGsapTicker } from '../../hooks/useGsapTicker';
import { STAGES, STAGE_LABELS } from '../../constants/stages';
import styles from '../../styles/showcase.module.css';

/** Seven stage chips; active state is synced per-frame without React renders. */
export default function StageIndicators(): JSX.Element {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastActive = useRef<string>('');

  useGsapTicker(() => {
    const p = TWEEN.progress;
    let activeIdx = STAGES.length - 1;
    for (let i = 0; i < STAGES.length; i++) {
      if (p < STAGES[i].end) {
        activeIdx = i;
        break;
      }
    }
    const id = STAGES[activeIdx].id;
    if (id === lastActive.current) return;
    lastActive.current = id;
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      if (i === activeIdx) el.classList.add(styles.indActive);
      else el.classList.remove(styles.indActive);
    });
  });

  return (
    <div className={styles.indicators}>
      {STAGES.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className={styles.indItem}
          onClick={() => seekProgress(s.start)}
          title={`${STAGE_LABELS[s.id]} · ${s.start}%–${s.end}%`}
        >
          <span className={styles.indDot} />
          <span>{STAGE_LABELS[s.id]}</span>
        </button>
      ))}
    </div>
  );
}
