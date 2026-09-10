import { useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useCompositionStore } from '../../store/compositionStore';
import { extractSubject, fileToDataURL } from '../../utils/imageMatting';
import { composeUserPreview } from '../../utils/composePreview';
import type { Asset } from '../../types';
import ImageGenPanel from './ImageGenPanel';
import ModelGenPanel from './ModelGenPanel';
import styles from '../../styles/workspace.module.css';

type GenTab = 'image' | 'model';

/** Left column: grouped asset thumbnails (with per-asset operations) + AI generation tabs. */
export default function AssetsPanel(): JSX.Element {
  const assets = useWorkspaceStore((s) => s.assets);
  const previewAssetId = useWorkspaceStore((s) => s.previewAssetId);
  const setPreviewAsset = useWorkspaceStore((s) => s.setPreviewAsset);
  const removeAsset = useWorkspaceStore((s) => s.removeAsset);
  const replaceAsset = useWorkspaceStore((s) => s.replaceAsset);
  const addAsset = useWorkspaceStore((s) => s.addAsset);
  const setCanvasResult = useWorkspaceStore((s) => s.setCanvasResult);
  const setUserImage = useCompositionStore((s) => s.setUserImage);
  const [tab, setTab] = useState<GenTab>('image');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const personInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const groups = useMemo(
    () => ({
      source: assets.filter((a) => a.kind === 'source'),
      mask: assets.filter((a) => a.kind === 'mask'),
      background: assets.filter((a) => a.kind === 'background'),
      result: assets.filter((a) => a.kind === 'result'),
    }),
    [assets],
  );

  /** Upload a new person photo as the workspace source asset. */
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
      // update composition store so Showcase 同步
      setUserImage({
        original: dataURL,
        subject,
        final,
        width: 1024,
        height: 768,
        name: file.name,
      });
      // upsert into workspace assets (replace src-main if exists, else add)
      const s = useWorkspaceStore.getState();
      const existing = s.assets.find((a) => a.id === 'src-main');
      if (existing) replaceAsset('src-main', { src: dataURL, label: `原图 · ${file.name}`, meta: { source: 'user' } });
      else
        addAsset({
          id: 'src-main',
          kind: 'source',
          label: `原图 · ${file.name}`,
          src: dataURL,
          meta: { source: 'user' },
        });
      const existingMask = s.assets.find((a) => a.id === 'subj-main');
      if (existingMask) replaceAsset('subj-main', { src: subject, label: '主体层', meta: { source: 'user', alpha: '实时' } });
      else
        addAsset({
          id: 'subj-main',
          kind: 'mask',
          label: '主体层',
          src: subject,
          meta: { source: 'user', alpha: '实时' },
        });
      // new result that uses the uploaded subject
      const resultId = addAsset({
        kind: 'result',
        label: `合成 · ${file.name}`,
        src: final,
        meta: { engine: 'local-demo', source: 'user-upload' },
      });
      setCanvasResult(resultId);
      setPreviewAsset(resultId);
      setUploadMsg(`已载入「${file.name}」 ✓`);
      setTimeout(() => setUploadMsg(''), 1800);
    } catch (err) {
      setUploadMsg(err instanceof Error ? `失败：${err.message}` : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const triggerReplace = (assetId: string) => {
    replaceTargetRef.current = assetId;
    replaceInputRef.current?.click();
  };

  const handleReplace = async (file: File | undefined) => {
    const target = replaceTargetRef.current;
    if (!file || !target) return;
    const dataURL = await fileToDataURL(file);
    const asset = useWorkspaceStore.getState().assets.find((a) => a.id === target);
    if (!asset) return;
    if (asset.kind === 'source') {
      // re-extract subject + recompose preview
      const { subject } = await extractSubject({ dataURL });
      const final = await composeUserPreview({
        backgroundSrc: '/assets/bg/bg_forest.png',
        subjectDataURL: subject,
        subjectScale: 0.6,
        subjectAnchorY: 0.78,
      });
      replaceAsset(target, { src: dataURL, label: `原图 · ${file.name}` });
      const subj = useWorkspaceStore.getState().assets.find((a) => a.id === 'subj-main');
      if (subj) replaceAsset(subj.id, { src: subject });
      const resultId = useWorkspaceStore.getState().addAsset({
        kind: 'result',
        label: `合成 · ${file.name}`,
        src: final,
      });
      useWorkspaceStore.getState().setCanvasResult(resultId);
      useWorkspaceStore.getState().setPreviewAsset(resultId);
    } else {
      replaceAsset(target, { src: dataURL, label: asset.label });
    }
  };

  const downloadAsset = (a: Asset) => {
    if (!a.src) return;
    const a$ = document.createElement('a');
    a$.href = a.src;
    a$.download = `${a.label || a.id}.png`;
    document.body.appendChild(a$);
    a$.click();
    a$.remove();
  };

  const removeAssetSafe = (a: Asset) => {
    if (a.kind === 'source' && a.id === 'src-main') return; // protect the canonical source
    removeAsset(a.id);
  };

  const renderGroup = (title: string, list: typeof assets) => {
    if (list.length === 0) return null;
    return (
      <div className={styles.assetGroup}>
        <div className={styles.sectionTitle}>{title}</div>
        <div className={styles.assetGrid}>
          {list.map((a) => (
            <div
              key={a.id}
              className={`${styles.assetThumbWrap} ${previewAssetId === a.id ? styles.assetThumbActive : ''}`}
              onClick={() => setPreviewAsset(a.id)}
              onMouseEnter={() => setHoverId(a.id)}
              onMouseLeave={() => setHoverId(null)}
              title={a.label}
            >
              <img className={styles.assetThumb} src={a.src} alt={a.label} />
              <div className={styles.assetLabel}>{a.label}</div>
              {hoverId === a.id && (
                <div className={styles.assetOps}>
                  {a.kind === 'source' && (
                    <button
                      className={styles.assetOpBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerReplace(a.id);
                      }}
                      title="重新导入"
                    >
                      ↻
                    </button>
                  )}
                  <button
                    className={styles.assetOpBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadAsset(a);
                    }}
                    title="下载"
                  >
                    ↓
                  </button>
                  <button
                    className={`${styles.assetOpBtn} ${styles.assetOpDanger}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAssetSafe(a);
                    }}
                    title="删除"
                    disabled={a.kind === 'source' && a.id === 'src-main'}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <aside className={styles.left}>
      <div className={styles.personUploadWrap}>
        <button
          className={styles.personUploadBtn}
          disabled={uploading}
          onClick={() => personInputRef.current?.click()}
        >
          {uploading ? '处理中…' : '上传人像'}
        </button>
        <div className={styles.personUploadMsg}>{uploadMsg}</div>
        <input
          ref={personInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            void handlePersonUpload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleReplace(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {renderGroup('原图', groups.source)}
      {renderGroup('Mask / 主体', groups.mask)}
      {renderGroup('背景（多版本）', groups.background)}
      {renderGroup('最终结果', groups.result)}
      <div className={styles.genPanel}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'image' ? styles.tabActive : ''}`}
            onClick={() => setTab('image')}
          >
            AI 生图
          </button>
          <button
            className={`${styles.tab} ${tab === 'model' ? styles.tabActive : ''}`}
            onClick={() => setTab('model')}
          >
            AI 建模
          </button>
        </div>
        {tab === 'image' ? <ImageGenPanel /> : <ModelGenPanel />}
      </div>
    </aside>
  );
}