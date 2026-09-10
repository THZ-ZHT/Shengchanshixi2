import type { DagNode as DagNodeType } from '../../types';
import styles from '../../styles/workspace.module.css';

const STATUS_TEXT: Record<DagNodeType['status'], string> = {
  pending: '待执行',
  running: '执行中',
  done: '完成',
  failed: '失败',
};

function dotClass(status: DagNodeType['status']): string {
  if (status === 'running') return `${styles.planDot} ${styles.planDotRunning}`;
  if (status === 'done') return `${styles.planDot} ${styles.planDotDone}`;
  if (status === 'failed') return `${styles.planDot} ${styles.planDotFailed}`;
  return styles.planDot;
}

/** Single DAG node card in the bottom execution bar. */
export default function DagNode({
  node,
  onClick,
}: {
  node: DagNodeType;
  onClick: () => void;
}): JSX.Element {
  return (
    <div className={styles.dagNodeCard} onClick={onClick} title={`${node.name} · ${STATUS_TEXT[node.status]}`}>
      <div className={styles.dagName}>{node.label}</div>
      <div className={styles.dagLabel}>
        <span className={dotClass(node.status)} />
        {STATUS_TEXT[node.status]}
      </div>
      <div key={node.versionId ?? 'none'} className={styles.dagVersion}>
        {node.versionId || '未执行'}
      </div>
    </div>
  );
}
