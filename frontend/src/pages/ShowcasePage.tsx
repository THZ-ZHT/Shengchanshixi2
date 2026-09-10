import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TWEEN, useCompositionStore, killProgressTween } from '../store/compositionStore';
import { useGsapTicker } from '../hooks/useGsapTicker';
import { useKeyboardProgress } from '../hooks/useKeyboardProgress';
import { useIdleAutoPlay } from '../hooks/useIdleAutoPlay';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { getStage, FINAL_NARRATION } from '../constants/stages';
import { narrate } from '../services/speech';
import ShowcaseCanvas from '../components/showcase/ShowcaseCanvas';
import CompositionSlider from '../components/showcase/CompositionSlider';
import StageIndicators from '../components/showcase/StageIndicators';
import AgentVoice from '../components/showcase/AgentVoice';
import ProcessingOverlay from '../components/showcase/ProcessingOverlay';
import UploadCard from '../components/showcase/UploadCard';
import FinalPanel from '../components/showcase/FinalPanel';
import DebugOverlay from '../components/showcase/DebugOverlay';
import styles from '../styles/showcase.module.css';

const MODES: { id: 'explore' | 'control' | 'create'; label: string }[] = [
  { id: 'explore', label: '漫游' },
  { id: 'control', label: '控制' },
  { id: 'create', label: '创作' },
];

export default function ShowcasePage(): JSX.Element {
  const status = useCompositionStore((s) => s.status);
  const mode = useCompositionStore((s) => s.mode);
  const reduced = useReducedMotion();
  const [interacted, setInteracted] = useState(false);
  const [hint, setHint] = useState(false);
  const dirRef = useRef<HTMLSpanElement>(null);
  const tempRef = useRef<HTMLSpanElement>(null);
  const intenRef = useRef<HTMLSpanElement>(null);
  const matteRef = useRef<HTMLDivElement>(null);

  // stage transition detection: the only setState point driven by progress
  const stageRef = useRef<string>('');
  useGsapTicker(() => {
    const st = useCompositionStore.getState();
    const s = getStage(TWEEN.progress);
    if (s.id !== stageRef.current) {
      stageRef.current = s.id;
      st.setStage(s.id);
    }
    if (TWEEN.progress >= 99.5 && st.status === 'interactive') st.setStatus('final');
  });

  // LIGHT panel: values ease toward target so readouts flow instead of jumping
  const shown = useRef({ dir: 200, temp: 6200, inten: 40 });
  useGsapTicker(() => {
    const p = TWEEN.progress;
    const s = shown.current;
    const k = reduced ? 1 : 0.18;
    s.dir += (200 + p * 0.12 - s.dir) * k;
    s.temp += (6200 - p * 14 - s.temp) * k;
    s.inten += (40 + p * 0.32 - s.inten) * k;
    if (dirRef.current) dirRef.current.textContent = `${Math.round(s.dir)}°`;
    if (tempRef.current) tempRef.current.textContent = `${Math.round(s.temp)}K`;
    if (intenRef.current) intenRef.current.textContent = `${Math.round(s.inten)}%`;
    if (matteRef.current) {
      const on = p > 12 && p < 45;
      matteRef.current.style.opacity = on ? '1' : '0';
    }
  });

  // narration follows stage
  const stage = useCompositionStore((s) => s.stage);
  useEffect(() => {
    if (status !== 'interactive' && status !== 'final') return;
    const text =
      status === 'final' ? FINAL_NARRATION : getStage(TWEEN.progress).narration;
    if (text) narrate(text);
  }, [stage, status]);

  useEffect(() => () => killProgressTween(), []);

  useKeyboardProgress(status === 'interactive');
  useIdleAutoPlay({
    enabled: mode === 'explore' && status === 'interactive' && !reduced,
    onComplete: () => setHint(true),
  });

  const firstInteract = () => setInteracted(true);

  return (
    <div className={styles.page} onPointerDownCapture={firstInteract}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <span className={styles.logoMark} />
            ImageCompose
          </div>
          <nav className={styles.nav}>
            <Link className={styles.navLink} to="/research">
              研究
            </Link>
            <Link className={`${styles.navLink} ${styles.navActive}`} to="/workspace">
              工作台
            </Link>
          </nav>
        </div>
      </header>

      {status === 'empty' && (
        <>
          <section className={styles.hero}>
            <div className={styles.eyebrow}>多模态图像合成智能体</div>
            <h1 className={styles.h1}>
              从一张图，
              <br />
              到真实合成
            </h1>
            <p className={styles.subtitle}>
              上传一张照片，智能体自动完成抠取、场景合成、光照与阴影重建，输出浑然一体的成片。
            </p>
          </section>
          <section className={styles.uploadRow}>
            <UploadCard />
          </section>
          <div className={styles.flowHint}>
            <span className={styles.breathingDot} />
            上传 → 等待处理 → 拖动探索 → 最终合成
          </div>
        </>
      )}

      {status === 'processing' && <ProcessingOverlay />}

      {(status === 'interactive' || status === 'final') && (
        <>
          <div className={styles.modePill}>
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`${styles.modeBtn} ${mode === m.id ? styles.modeBtnActive : ''}`}
                onClick={() => useCompositionStore.getState().setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <section className={styles.stageArea}>
            <aside className={styles.sideLeft}>
              <span>从</span>
              <span className={styles.sideLeftStrong}>图像</span>
              <span>到</span>
              <span className={styles.sideLeftStrong}>真实</span>
            </aside>
            <div className={styles.stageCol}>
              <ShowcaseCanvas />
              {status === 'final' && <div className={styles.finalChip}>光影一致 · 合成完成</div>}
              {!interacted && status === 'interactive' && (
                <div className={styles.capsuleHint}>按住拖动 · 向右推进合成</div>
              )}
            </div>
            <aside className={styles.sideRight}>
              <div className={styles.panel}>
                <div className={styles.panelTitle}>光源估计</div>
                <div className={styles.panelRow}>
                  <span>方向</span>
                  <span ref={dirRef} className={styles.panelRowVal}>
                    200°
                  </span>
                </div>
                <div className={styles.panelRow}>
                  <span>色温</span>
                  <span ref={tempRef} className={styles.panelRowVal}>
                    6200K
                  </span>
                </div>
                <div className={styles.panelRow}>
                  <span>强度</span>
                  <span ref={intenRef} className={styles.panelRowVal}>
                    40%
                  </span>
                </div>
              </div>
              <div ref={matteRef} className={styles.panel} style={{ opacity: 0, transition: 'opacity 200ms' }}>
                <div className={styles.panelTitle}>抠像遮罩</div>
                <div className={styles.panelRow}>
                  <span>透明度</span>
                  <span className={styles.panelRowVal}>98.2%</span>
                </div>
                <div className={styles.panelRow}>
                  <span>边缘</span>
                  <span className={styles.panelRowVal}>96.8%</span>
                </div>
              </div>
              {status === 'final' && <FinalPanel />}
            </aside>
          </section>
          <section className={styles.controller}>
            <CompositionSlider />
            <StageIndicators />
          </section>
        </>
      )}

      {hint && (
        <div className={styles.hintToast} onClick={() => setHint(false)}>
          轮到你了 · 现在试着拖动看看
        </div>
      )}

      <AgentVoice />
      <DebugOverlay />
    </div>
  );
}
