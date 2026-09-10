import type { CriticScore } from '../../types';
import styles from '../../styles/workspace.module.css';

/** Five-dimension critic score card attached to an agent message. */
export default function CriticCard({ critic }: { critic: CriticScore[] }): JSX.Element {
  return (
    <div className={styles.planCard}>
      {critic.map((c) => (
        <div key={c.key} className={styles.criticRow}>
          <span className={styles.criticKey}>{c.key}</span>
          <div className={styles.criticBarOuter}>
            <div className={styles.criticBarFill} style={{ width: `${c.score}%` }} />
          </div>
          <span className={styles.criticScore}>{c.score}</span>
        </div>
      ))}
    </div>
  );
}
