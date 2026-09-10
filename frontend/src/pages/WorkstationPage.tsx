import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useCompositionStore } from '../store/compositionStore';
import { useAgentStore } from '../store/agentStore';
import { DAG_CHAIN } from '../constants/dag';
import { extractSubject, fileToDataURL } from '../utils/imageMatting';
import { composeUserPreview } from '../utils/composePreview';
import ProcessTimeline from '../components/workstation/ProcessTimeline';
import CommandBar from '../components/workstation/CommandBar';
import WorkstationCanvas from '../components/workstation/WorkstationCanvas';
import WorkstationAgentPanel from '../components/workstation/WorkstationAgentPanel';
import styles from '../styles/workstation.module.css';

/**
 * Workstation page — the "general AI software" main view.
 *
 * Layout
 * ──────
 *   TopBar    56px   brand · nav · live status pill · user
 *   Timeline  auto   7-step pipeline with live activity log
 *   Main      1fr    canvas center + right tabs (chat | assets | params)
 *   Command   96px   quick chips + chat input + mic + send
 */
export default function WorkstationPage(): JSX.Element {
  const initRef = useRef(false);
  const ttsEnabled = useAgentStore((s) => s.ttsEnabled);
  const setTtsEnabled = useAgentStore.getState().setTtsEnabled;
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const personInputRef = useRef<HTMLInputElement>(null);

  // Kick off the first DAG run + push the "plan" agent message.
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
      s.pushActivity({
        kind: 'plan',
        title: '执行计划已生成',
        detail: `${DAG_CHAIN.length} 步 · 预计 6-10s`,
      });
      void s.runDag();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Upload a person photo as the workspace source. */
  const handlePersonUpload = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadMsg('正在抠取主体…');
    try {
      const dataURL = await fileToDataURL(file);
      const { subject } = await extractSubject({ dataURL });
      setUploadMsg('正在合成预览…');
      const final = await composeUserPreview({
        backgroundSrc: '/assets/bg/bg_forest.png',
        subjectDataURL: subject,
        subjectScale: 0.6,
        subjectAnchorY: 0.78,
      });
      useCompositionStore.getState().setUserImage({
        original: dataURL,
        subject,
        final,
        width: 1024,
        height: 768,
        name: file.name,
      });
      const s = useWorkspaceStore.getState();
      const existing = s.assets.find((a) => a.id === 'src-main');
      if (existing)
        s.replaceAsset('src-main', { src: dataURL, label: `原图 · ${file.name}`, meta: { source: 'user' } });
      else
        s.addAsset({
          id: 'src-main',
          kind: 'source',
          label: `原图 · ${file.name}`,
          src: dataURL,
          meta: { source: 'user' },
        });
      const existingMask = s.assets.find((a) => a.id === 'subj-main');
      if (existingMask)
        s.replaceAsset('subj-main', { src: subject, label: '主体层', meta: { source: 'user', alpha: '实时' } });
      else
        s.addAsset({
          id: 'subj-main',
          kind: 'mask',
          label: '主体层',
          src: subject,
          meta: { source: 'user', alpha: '实时' },
        });
      const resultId = s.addAsset({
        kind: 'result',
        label: `合成 · ${file.name}`,
        src: final,
        meta: { source: 'user', alpha: '实时' },
      });
      s.setCanvasResult(resultId);
      s.setPreviewAsset(resultId);
      s.pushActivity({ kind: 'version', title: '上传了新原图', detail: file.name });
      setUploadMsg(`已就绪：${file.name}`);
    } catch (e) {
      setUploadMsg('上传失败，请换一张图片重试');
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.wsRoot}>
      <header className={styles.wsTopbar}>
        <div className={styles.wsBrand}>
          <div className={styles.wsBrandMark}>AI</div>
          <div className={styles.wsBrandText}>
            <span className={styles.wsBrandTitle}>多模态图像合成 Agent</span>
            <span className={styles.wsBrandSub}>Workstation</span>
          </div>
        </div>
        <nav className={styles.wsTopbarNav}>
          <Link className={`${styles.wsTopbarLink} ${styles.wsTopbarLinkActive}`} to="/workspace">
            工作台
          </Link>
          <Link className={styles.wsTopbarLink} to="/">
            演示首页
          </Link>
          <Link className={styles.wsTopbarLink} to="/research">
            研究
          </Link>
        </nav>
        <div className={styles.wsTopbarSpacer} />
        <div className={styles.wsTopbarMeta}>
          <span className={styles.wsTopbarPill}>Agent 就绪</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
              style={{ accentColor: 'var(--green-d)' }}
            />
            语音播报
          </label>
          <div className={styles.wsTopbarUser}>
            <div className={styles.wsTopbarAvatar}>田</div>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>研究员</span>
          </div>
        </div>
      </header>

      <ProcessTimeline />

      <main className={styles.wsMain}>
        <WorkstationCanvas />
        <WorkstationAgentPanel
          onUploadRequest={() => {
            if (!uploading) personInputRef.current?.click();
          }}
        />
      </main>

      <input
        ref={personInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handlePersonUpload(file);
          e.target.value = '';
        }}
      />
      {uploadMsg && (
        <div
          style={{
            position: 'fixed',
            right: 22,
            bottom: 110,
            padding: '8px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 999,
            boxShadow: 'var(--shadow-sm)',
            fontSize: 12,
            color: 'var(--ink-2)',
            zIndex: 10,
          }}
        >
          {uploadMsg}
        </div>
      )}

      <CommandBar />
    </div>
  );
}
