import { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DagNode as DagNodeType } from '../../types';
import DagNodeCard from './DagNode';
import styles from '../../styles/workspace.module.css';

/** Bottom execution DAG: node cards + arrows + detail/rollback popup. */
export default function ExecutionDag(): JSX.Element {
  const dagNodes = useWorkspaceStore((s) => s.dagNodes);
  const activeNodeId = useWorkspaceStore((s) => s.activeNodeId);
  const setActiveNode = useWorkspaceStore((s) => s.setActiveNode);
  const assets = useWorkspaceStore((s) => s.assets);
  const versions = useWorkspaceStore((s) => s.versions);
  const rollback = useWorkspaceStore((s) => s.rollback);
  const running = useWorkspaceStore((s) => s.running);
  const [keepLight, setKeepLight] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const active = dagNodes.find((n) => n.id === activeNodeId) ?? null;
  const activeVersions = active ? versions.filter((v) => v.nodeId === active.id) : [];

  return (
    <div className={styles.bottom}>
      <div className={styles.dagBar}>
        {dagNodes.map((n, i) => (
          <span key={n.id} style={{ display: 'contents' }}>
            {i > 0 && <span className={styles.dagArrow}>→</span>}
            <DagNodeCard node={n} onClick={() => setActiveNode(n.id)} />
          </span>
        ))}
      </div>
      {active && (
        <div className={styles.popupMask} onClick={() => setActiveNode(null)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popupTitle}>
              {active.label} · {active.name}
            </div>
            <div className={styles.popupSub}>
              版本链（{activeVersions.length}） · 点击遮罩关闭
            </div>
            {activeVersions.length === 0 && (
              <div className={styles.popupSub}>该节点还没有执行记录。</div>
            )}
            {activeVersions
              .slice()
              .reverse()
              .map((v) => (
                <div key={v.versionId} className={styles.versionRow}>
                  <span className={styles.versionTag}>{v.versionId}</span>
                  <div className={styles.versionThumbs}>
                    {v.assetIds.map((aid) => {
                      const asset = assets.find((a) => a.id === aid);
                      return asset?.src ? (
                        <img
                          key={aid}
                          className={styles.versionThumb}
                          src={asset.src}
                          alt={asset.label}
                          title={asset.label}
                        />
                      ) : null;
                    })}
                  </div>
                  <span className={styles.versionParams}>
                    {Object.entries(v.params)
                      .map(([k, val]) => `${k}:${String(val)}`)
                      .join(' ')}
                  </span>
                </div>
              ))}
            <label className={styles.keepLightRow}>
              <input
                type="checkbox"
                checked={keepLight}
                onChange={(e) => setKeepLight(e.target.checked)}
              />
              回滚时保留当前光照（跳过光照节点）
            </label>
            <div className={styles.popupActions}>
              <button className={styles.toolbarBtn} onClick={() => setActiveNode(null)}>
                关闭
              </button>
              <button
                className={styles.sendBtn}
                disabled={running || activeVersions.length < 2}
                onClick={() => {
                  if (!confirming) {
                    setConfirming(true);
                    window.setTimeout(() => setConfirming(false), 3000);
                    return;
                  }
                  setConfirming(false);
                  setActiveNode(null);
                  void rollback(active.id, keepLight);
                }}
              >
                {confirming
                  ? '确认回滚？'
                  : running
                    ? '执行中…'
                    : '回滚到该版本并重跑下游'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { DagNodeType };
