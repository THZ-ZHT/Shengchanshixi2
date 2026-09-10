import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompositionStore } from '../../store/compositionStore';
import { CRITIC_SCORES } from '../../constants/layout';
import { countUp } from '../../utils/motion';
import styles from '../../styles/showcase.module.css';

/** State D panel: AI CHECK five-dimension scores + actions. */
export default function FinalPanel(): JSX.Element {
  const navigate = useNavigate();
  const resetAll = useCompositionStore((s) => s.resetAll);
  const scoreRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const totalRef = useRef<HTMLSpanElement>(null);
  // widths use CSS transition (driven by the rowDelay below) — no per-frame React state.
  const [widths, setWidths] = useState<number[]>(() => CRITIC_SCORES.map(() => 0));

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    // rowDelay values drive the CSS animation-delay on .checkRow, so each
    // row enters slightly after the previous one. We mirror the same offsets
    // for the count-up.
    const rowDelay = (i: number) => 80 * i;
    CRITIC_SCORES.forEach((c, i) => {
      const t = window.setTimeout(() => {
        const el = scoreRefs.current[i];
        if (el) cleanups.push(countUp(el, c.score, { duration: 1.0 }));
        // reveal the width after the row has faded in a touch
        window.setTimeout(() => setWidths((w) => w.map((v, idx) => (idx === i ? c.score : v))), 200);
      }, rowDelay(i));
      cleanups.push(() => window.clearTimeout(t));
    });
    const t = window.setTimeout(() => {
      if (totalRef.current && CRITIC_SCORES[4]) {
        cleanups.push(countUp(totalRef.current, CRITIC_SCORES[4].score, { duration: 1.0 }));
      }
    }, rowDelay(CRITIC_SCORES.length - 1) + 600);
    cleanups.push(() => window.clearTimeout(t));
    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <div className={styles.finalPanel}>
      <div className={styles.panelTitle}>AI 自检 · 五维评分</div>
      {CRITIC_SCORES.map((c, i) => (
        <div
          key={c.key}
          className={styles.checkRow}
          style={{ animationDelay: `${80 * i}ms` }}
        >
          <div className={styles.checkRowTop}>
            <span>{c.key}</span>
            <span
              className={styles.checkScore}
              ref={(el) => {
                scoreRefs.current[i] = el;
              }}
            >
              0
            </span>
          </div>
          <div className={styles.checkBarOuter}>
            <div className={styles.checkBarFill} style={{ width: `${widths[i]}%` }} />
          </div>
        </div>
      ))}
      <div className={styles.passedBadge}>
        检查通过 · <span ref={totalRef}>0</span> / 100
      </div>
      <div className={styles.finalBtns}>
        <button className={styles.btnPrimary} onClick={() => navigate('/workspace')}>
          进入工作台
        </button>
        <button className={styles.btnGhost} onClick={resetAll}>
          重新体验
        </button>
      </div>
    </div>
  );
}