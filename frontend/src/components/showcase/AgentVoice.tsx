import { useRef } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useCompositionStore } from '../../store/compositionStore';
import { useGsapTicker, getFps } from '../../hooks/useGsapTicker';
import { WAVE_AMP, WAVE_AMP_FINAL } from '../../constants/layout';
import Waveform from './Waveform';
import styles from '../../styles/showcase.module.css';

const STATE_TEXT: Record<string, string> = {
  listening: '聆听中 · 听你说',
  thinking: '思考中…',
  speaking: '正在说明…',
};

/**
 * Agent voice presence (bottom-left, persistent in every state):
 * breathing orb / spinning dashed ring / live waveform + status line.
 */
export default function AgentVoice(): JSX.Element {
  const narration = useAgentStore((s) => s.narration);
  const voiceState = useAgentStore((s) => s.voiceState);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useGsapTicker((t) => {
    const vs = useAgentStore.getState().voiceState;
    const isFinal = useCompositionStore.getState().status === 'final';
    const amps = isFinal ? WAVE_AMP_FINAL : WAVE_AMP;
    barRefs.current.forEach((el, i) => {
      if (!el) return;
      if (vs === 'speaking') {
        const h = amps[i] * (0.75 + 0.25 * Math.sin(t / 90 + i * 1.3));
        el.style.height = `${h.toFixed(1)}px`;
        el.style.opacity = '1';
      } else {
        el.style.height = '4px';
        el.style.opacity = vs === 'listening' ? '0.35' : '0';
      }
    });
    void getFps();
  });

  return (
    <div className={styles.voice}>
      <div className={styles.orbWrap}>
        {voiceState === 'thinking' ? (
          <div className={styles.orbSpin} />
        ) : (
          <div className={styles.orbBreath} />
        )}
        <div className={styles.orbCore} />
      </div>
      <Waveform barRefs={barRefs} />
      <span className={styles.voiceText}>{STATE_TEXT[voiceState] ?? ''} · {narration}</span>
    </div>
  );
}
