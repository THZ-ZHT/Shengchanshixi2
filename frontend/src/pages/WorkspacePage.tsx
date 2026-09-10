import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAgentStore } from '../store/agentStore';
import { DAG_CHAIN } from '../constants/dag';
import AssetsPanel from '../components/workspace/AssetsPanel';
import CanvasPanel from '../components/workspace/CanvasPanel';
import AgentPanel from '../components/workspace/AgentPanel';
import ExecutionDag from '../components/workspace/ExecutionDag';
import styles from '../styles/workspace.module.css';

/** Workspace shell: top bar + three columns + bottom execution DAG. */
export default function WorkspacePage(): JSX.Element {
  const ttsEnabled = useAgentStore((s) => s.ttsEnabled);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const s = useWorkspaceStore.getState();
    if (s.versions.length === 0) {
      s.initDemoAssets();
      const plan = DAG_CHAIN.map((d) => ({
        id: d.id,
        name: d.name,
        label: d.label,
        status: 'pending' as const,
        versionId: null,
        artifactAssetId: null,
      }));
      s.pushMessage({
        role: 'agent',
        text: '已生成执行计划：主体抠图 → 背景生成 → 光照估计 → 重打光 → 接触阴影 → 色彩和谐化 → AI 自检。',
        plan,
      });
      void s.runDag();
    }
  }, []);

  return (
    <div className={styles.root}>
      <header className={styles.top}>
        <Link className={styles.backLink} to="/">
          ← 返回首页
        </Link>
        <span className={styles.topTitle}>工作台</span>
        <span className={styles.topSpacer} />
        <label className={styles.ttsToggle}>
          <input
            type="checkbox"
            checked={ttsEnabled}
            onChange={(e) => useAgentStore.getState().setTtsEnabled(e.target.checked)}
          />
          语音播报
        </label>
      </header>
      <div className={styles.main}>
        <AssetsPanel />
        <CanvasPanel />
        <AgentPanel />
      </div>
      <ExecutionDag />
    </div>
  );
}
