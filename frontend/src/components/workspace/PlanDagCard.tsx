import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DagNode as DagNodeType } from '../../types';
import styles from '../../styles/workspace.module.css';

function dotClass(status: DagNodeType['status']): string {
  if (status === 'running') return `${styles.planDot} ${styles.planDotRunning}`;
  if (status === 'done') return `${styles.planDot} ${styles.planDotDone}`;
  if (status === 'failed') return `${styles.planDot} ${styles.planDotFailed}`;
  return styles.planDot;
}

/** Live execution-plan card attached to an agent message. */
export default function PlanDagCard({ plan }: { plan: DagNodeType[] }): JSX.Element {
  const dagNodes = useWorkspaceStore((s) => s.dagNodes);
  return (
    <div className={styles.planCard}>
      {plan.map((p) => {
        const live = dagNodes.find((n) => n.id === p.id);
        return (
          <div key={p.id} className={styles.planRow}>
            <span className={dotClass(live?.status ?? 'pending')} />
            <span>
              {p.label} · {live?.status ?? 'pending'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
