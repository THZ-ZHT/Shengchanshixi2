import { WAVE_AMP, WAVE_AMP_FINAL } from '../../constants/layout';
import styles from '../../styles/showcase.module.css';

/** Seven-bar waveform; heights are driven by AgentVoice's ticker. */
export default function Waveform({
  barRefs,
}: {
  barRefs: React.MutableRefObject<(HTMLSpanElement | null)[]>;
}): JSX.Element {
  return (
    <div className={styles.bars}>
      {WAVE_AMP.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className={styles.bar}
        />
      ))}
    </div>
  );
}

export { WAVE_AMP_FINAL };
