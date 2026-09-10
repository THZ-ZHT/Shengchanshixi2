import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DAG_CHAIN } from '../../constants/dag';
import type { DagNode as DagNodeType, NodeVersion, Asset } from '../../types';
import styles from '../../styles/workstation.module.css';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface StepProps {
  index: number;
  node: DagNodeType;
  active: boolean;
  onClick: () => void;
}

function Step({ index, node, active, onClick }: StepProps): JSX.Element {
  const cls = [
    styles.wsStep,
    node.status === 'pending' && styles.wsStepPending,
    node.status === 'running' && styles.wsStepRunning,
    node.status === 'done' && styles.wsStepDone,
    node.status === 'failed' && styles.wsStepFailed,
    active && styles.wsStepActive,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      data-step-id={node.id}
      data-step-label={node.label}
      onClick={onClick}
      title={`${node.label} · ${node.name} · ${node.status}`}
    >
      <div className={styles.wsStepIndex}>{index + 1}</div>
      <div className={styles.wsStepText}>
        <div className={styles.wsStepLabel}>{node.label}</div>
        <div className={styles.wsStepSub}>
          {node.status === 'done' && node.versionId ? node.versionId : node.status === 'running' ? '执行中…' : node.status === 'failed' ? '失败' : '待执行'}
        </div>
      </div>
    </div>
  );
}

interface NodeDetailModalProps {
  node: DagNodeType;
  versions: NodeVersion[];
  assets: Asset[];
  onClose: () => void;
  onRollback: (nodeId: string) => void;
  running: boolean;
}

/** Floating version-history popup triggered by clicking a step. */
function NodeDetailModal({ node, versions, assets, onClose, onRollback, running }: NodeDetailModalProps): JSX.Element {
  const [keepLight, setKeepLight] = useState(true);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.wsNodeModal} data-testid="node-modal" onClick={onClose}>
      <div className={styles.wsNodeModalInner} onClick={(e) => e.stopPropagation()}>
        <div className={styles.wsNodeModalTitle} data-testid="node-modal-title">
          {node.label} <span style={{ color: 'var(--ink-2)', fontWeight: 400 }}>· {node.name}</span>
        </div>
        <div className={styles.wsNodeModalSub}>版本链（{versions.length}） · 点击遮罩关闭</div>
        {versions.length === 0 && <div className={styles.wsNodeModalSub}>该节点还没有执行记录。</div>}
        {versions
          .slice()
          .reverse()
          .map((v) => (
            <div key={v.versionId} className={styles.wsVersionRow}>
              <span className={styles.wsVersionTag}>{v.versionId}</span>
              <div className={styles.wsVersionThumbs}>
                {v.assetIds.map((aid) => {
                  const a = assets.find((x) => x.id === aid);
                  return a?.src ? (
                    <img key={aid} className={styles.wsVersionThumb} src={a.src} alt={a.label} title={a.label} />
                  ) : null;
                })}
              </div>
              <span className={styles.wsVersionParams}>
                {Object.entries(v.params)
                  .map(([k, val]) => `${k}:${String(val)}`)
                  .join(' ')}
              </span>
            </div>
          ))}
        <div className={styles.wsNodeModalActions}>
          <label>
            <input type="checkbox" checked={keepLight} onChange={(e) => setKeepLight(e.target.checked)} />
            回滚时保留当前光照（跳过 n3/n4）
          </label>
          <span className={styles.wsNodeModalSpacer} />
          <button className={styles.wsToolBtn} onClick={onClose}>关闭</button>
          <button
            className={styles.wsUploadBtn}
            disabled={running || versions.length < 2}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                window.setTimeout(() => setConfirming(false), 3000);
                return;
              }
              setConfirming(false);
              onClose();
              onRollback(node.id);
            }}
          >
            {confirming ? '确认回滚？' : running ? '执行中…' : '回滚并重跑下游'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Top process timeline: 7 DAG steps with live status + flowing connectors. */
export default function ProcessTimeline(): JSX.Element {
  const dagNodes = useWorkspaceStore((s) => s.dagNodes);
  const activityLog = useWorkspaceStore((s) => s.activityLog);
  const running = useWorkspaceStore((s) => s.running);
  const runStartedAt = useWorkspaceStore((s) => s.runStartedAt);
  const assets = useWorkspaceStore((s) => s.assets);
  const versions = useWorkspaceStore((s) => s.versions);
  const activeNodeId = useWorkspaceStore((s) => s.activeNodeId);
  const setActiveNode = useWorkspaceStore((s) => s.setActiveNode);
  const rollback = useWorkspaceStore((s) => s.rollback);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, []);

  // Track previous "done" count to fire a one-shot flash for connectors when a
  // step finishes — gives a clear visual "step just completed" pulse.
  const doneCount = dagNodes.filter((n) => n.status === 'done').length;
  const runningNode = dagNodes.find((n) => n.status === 'running') ?? null;
  const latestEntry = activityLog[activityLog.length - 1] ?? null;
  const liveRef = useRef<HTMLDivElement>(null);

  // Determine last activity dot color
  const dotCls = [
    styles.wsLiveDot,
    !running && styles.wsLiveDotIdle,
    latestEntry?.kind === 'failed' && styles.wsLiveDotFailed,
  ]
    .filter(Boolean)
    .join(' ');

  const active = dagNodes.find((n) => n.id === activeNodeId) ?? null;
  const activeVersions = active ? versions.filter((v) => v.nodeId === active.id) : [];
  const elapsed = runStartedAt ? now - runStartedAt : 0;
  const totalSteps = DAG_CHAIN.length;

  return (
    <div className={styles.wsTimeline}>
      <div className={styles.wsTimelineHead}>
        <span className={styles.wsTimelineTitle}>任务进度</span>
        <div className={styles.wsTimelineMeta}>
          <span>{doneCount}/{totalSteps} 步</span>
          <span className={styles.wsTimelineMetaSep} />
          <span>{running ? `已用时 ${fmtMs(elapsed)}` : '空闲'}</span>
        </div>
      </div>
      <div className={styles.wsTimelineBar}>
        {dagNodes.map((n, i) => {
          const next = dagNodes[i + 1];
          const nextIsDone = next?.status === 'done' || next?.status === 'running';
          const flow = n.status === 'done' && nextIsDone;
          return (
            <div key={n.id} style={{ display: 'contents' }}>
              <Step index={i} node={n} active={activeNodeId === n.id} onClick={() => setActiveNode(activeNodeId === n.id ? null : n.id)} />
              {next && (
                <div
                  className={[
                    styles.wsStepConnector,
                    flow && styles.wsStepConnectorFlow,
                    n.status === 'done' && next.status === 'done' && styles.wsStepConnectorDone,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.wsLive} ref={liveRef}>
        <span className={dotCls} />
        <span className={styles.wsLiveTime}>{latestEntry ? fmtTime(latestEntry.ts) : '—'}</span>
        <span className={styles.wsLiveText}>
          {runningNode
            ? `正在执行「${runningNode.label}」…`
            : latestEntry
              ? `${latestEntry.title}${latestEntry.detail ? ' · ' + latestEntry.detail : ''}`
              : '等待指令 · 输入或点快捷指令开始'}
        </span>
      </div>
      {active && (
        <NodeDetailModal
          node={active}
          versions={activeVersions}
          assets={assets}
          onClose={() => setActiveNode(null)}
          onRollback={(nid) => void rollback(nid, true)}
          running={running}
        />
      )}
    </div>
  );
}
