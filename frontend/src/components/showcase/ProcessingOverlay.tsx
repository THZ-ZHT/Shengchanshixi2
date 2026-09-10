import { useEffect, useRef } from 'react';
import { useCompositionStore, resetProgress } from '../../store/compositionStore';
import { loadDemoAssets } from '../../engine/layers';
import styles from '../../styles/showcase.module.css';

const STEPS: { label: string; tooltip: string; doneAt: number }[] = [
  { label: '上传完成', tooltip: '图片已安全接收，开始解码', doneAt: 0 },
  { label: '解码完成', tooltip: '像素数据准备就绪', doneAt: 20 },
  { label: '主体识别', tooltip: '显著性检测定位主体包围盒', doneAt: 45 },
  { label: '场景估计', tooltip: '分析环境光照与色彩基调', doneAt: 70 },
  { label: '构图准备', tooltip: '对齐图层，准备合成舞台', doneAt: 95 },
];

/**
 * State B: scanline stage + IMAGE RECEIVED chip + total progress (waits for
 * keyframe preloading around 82%) + five-step checklist + skip button.
 */
export default function ProcessingOverlay(): JSX.Element {
  const fillRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    resetProgress();
    let raf = 0;
    let loaded = false;
    void loadDemoAssets().then(() => {
      loaded = true;
    });
    const start = performance.now();
    const RAMP_MS = 2000; // progress bar reaches 82% at 2s
    const MIN_MS = 2200;  // minimum dwell in State B (also for cached keyframes)

    const finish = () => {
      useCompositionStore.getState().setStatus('interactive');
    };

    const tick = () => {
      const elapsed = performance.now() - start;
      const base = Math.min(82, (elapsed / RAMP_MS) * 82);
      const tail = elapsed > RAMP_MS ? ((elapsed - RAMP_MS) / 300) * 18 : 0;
      const pct = loaded ? Math.min(100, base + tail) : Math.min(82, base);
      if (fillRef.current) fillRef.current.style.width = `${pct.toFixed(1)}%`;
      if (pctRef.current) pctRef.current.textContent = `${Math.round(pct)}%`;
      if (labelRef.current) labelRef.current.textContent = pct >= 82 ? '准备中…' : '处理中…';
      stepRefs.current.forEach((el, i) => {
        if (!el) return;
        const dot = el.querySelector<HTMLDivElement>('div');
        const target = STEPS[i].doneAt;
        if (pct > target + 15) {
          el.classList.add(styles.stepDone);
          if (dot) dot.className = `${styles.stepDot} ${styles.stepDotDone}`;
        } else if (pct >= target - 15 && dot) {
          dot.className = `${styles.stepDot} ${styles.stepDotPulse}`;
        }
      });
      if (pct >= 99.5 && loaded && elapsed >= MIN_MS) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // gentle scanline drift handled by CSS animation; keep ref for future control
  void scanRef;

  return (
    <div className={styles.procArea}>
      <div className={styles.procStage}>
        <div className={styles.procCanvas}>
          <div className={styles.scanline} />
          <div className={styles.chip}>已接收图像</div>
          <div className={styles.thinkingRing} />
        </div>
        <div className={styles.procBottom}>
          <div className={styles.procBarRow}>
            <div ref={labelRef} className={styles.procBarLabel}>
              处理中…
            </div>
            <div ref={pctRef} className={styles.procPct}>
              0%
            </div>
          </div>
          <div className={styles.procBarOuter}>
            <div ref={fillRef} className={styles.procBarFill} />
          </div>
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div
                key={s.label}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={styles.step}
              >
                <div className={i === 0 ? `${styles.stepDot} ${styles.stepDotDone}` : styles.stepDot} />
                <span>{s.label}</span>
                <span className={styles.stepTooltip}>{s.tooltip}</span>
              </div>
            ))}
          </div>
          <button className={styles.skipBtn} onClick={() => useCompositionStore.getState().skipProcessing()}>
            跳过等待
          </button>
        </div>
      </div>
    </div>
  );
}
