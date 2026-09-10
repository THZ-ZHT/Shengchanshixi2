import { useEffect, useRef } from 'react';
import { useCompositionStore, TWEEN } from '../../store/compositionStore';
import { useGsapTicker, getFps } from '../../hooks/useGsapTicker';
import { getStage, getStageProgress } from '../../constants/stages';
import { useAgentStore } from '../../store/agentStore';
import styles from '../../styles/showcase.module.css';

/** Backquote-toggled debug overlay: progress / stage / fps / agent state. */
export default function DebugOverlay(): JSX.Element | null {
  const visible = useCompositionStore((s) => s.debugVisible);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') {
        e.preventDefault();
        useCompositionStore.getState().toggleDebug();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useGsapTicker(() => {
    if (!textRef.current) return;
    const st = useCompositionStore.getState();
    const stage = getStage(TWEEN.progress);
    const sp = Math.round(getStageProgress(TWEEN.progress) * 100);
    const agent = useAgentStore.getState().voiceState;
    textRef.current.textContent =
      `进度 ${TWEEN.progress.toFixed(2)}\n` +
      `阶段 ${stage.id} (${sp}%)\n` +
      `帧率 ${getFps()}\n` +
      `智能体 ${agent}`;
  });

  if (!visible) return null;
  return <div ref={textRef} className={styles.debug} />;
}
