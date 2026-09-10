import { useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useCompositionStore } from '../../store/compositionStore';
import { BG_PRESETS, bgPresetById } from '../../constants/layout';
import { loadImage } from '../../engine/layers';
import { compose } from '../../engine/composeEngine';
import { fileToDataURL } from '../../utils/imageMatting';
import { registerGeneratedBackground } from '../../services/orchestrator';
import styles from '../../styles/workspace.module.css';

/** Resolve the current subject image: user-uploaded portrait first, else demo. */
function getSubjectSource(): string {
  const user = useCompositionStore.getState().userImage;
  if (user?.subject) return user.subject;
  const mask = useWorkspaceStore.getState().assets.find((a) => a.kind === 'mask' && a.src);
  if (mask?.src) return mask.src;
  return '/assets/demo/kf_subject.png';
}

/**
 * Tab 1 of the AI generation panel: preset cards + prompt -> local engine
 * pipeline -> new background asset + composed result -> n2 new version.
 */
export default function ImageGenPanel(): JSX.Element {
  const [presetId, setPresetId] = useState<string>(BG_PRESETS[0].id);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateParams = useWorkspaceStore((s) => s.updateParams);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    const preset = bgPresetById(presetId);
    try {
      setStatus('本地引擎：抠图 → 棋盘格 → 背景合成…');
      updateParams({ bgPreset: preset.id });
      const bgImg = await loadImage(preset.src);
      const out = await compose({
        sourceUrl: getSubjectSource(),
        bgImage: bgImg,
        skipMatting: true,
        params: useWorkspaceStore.getState().params,
      });
      const label = prompt.trim() ? `${preset.label} · ${prompt.trim()}` : preset.label;
      registerGeneratedBackground(preset.id, label, bgImg.src, prompt.trim());
      const s = useWorkspaceStore.getState();
      const resultId = s.addAsset({
        kind: 'result',
        label: `合成 · ${label}`,
        canvas: out.result,
        src: out.result.toDataURL('image/png'),
        meta: { engine: 'local-demo' },
      });
      s.setCanvasResult(resultId);
      s.setPreviewAsset(resultId);
      s.pushMessage({
        role: 'agent',
        text: `已生成「${label}」背景并完成合成，结果已加入素材库。`,
      });
      setStatus('生成完成 ✓');
    } catch {
      setStatus('生成失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  /** Use a user-uploaded file as the background asset directly. */
  const handleUpload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      setStatus('请选择图片文件');
      return;
    }
    setBusy(true);
    try {
      setStatus('正在合成自定义背景…');
      const dataURL = await fileToDataURL(file);
      const bgImg = await loadImage(dataURL);
      const out = await compose({
        sourceUrl: getSubjectSource(),
        bgImage: bgImg,
        skipMatting: true,
        params: useWorkspaceStore.getState().params,
      });
      const label = file.name;
      registerGeneratedBackground('custom', label, dataURL, '');
      const s = useWorkspaceStore.getState();
      const resultId = s.addAsset({
        kind: 'result',
        label: `合成 · ${label}`,
        canvas: out.result,
        src: out.result.toDataURL('image/png'),
        meta: { engine: 'local-demo', source: 'user-upload' },
      });
      s.setCanvasResult(resultId);
      s.setPreviewAsset(resultId);
      s.pushMessage({
        role: 'agent',
        text: `已用你上传的「${label}」作为背景完成合成。`,
      });
      setStatus('自定义背景合成完成 ✓');
    } catch {
      setStatus('自定义背景合成失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={styles.sectionTitle}>选择背景预设</div>
      <div className={styles.presetGrid}>
        {BG_PRESETS.map((p) => (
          <div
            key={p.id}
            className={`${styles.presetCard} ${presetId === p.id ? styles.presetCardActive : ''}`}
            onClick={() => setPresetId(p.id)}
          >
            <img className={styles.presetImg} src={p.src} alt={p.label} />
            <div className={styles.presetLabel}>{p.label}</div>
          </div>
        ))}
      </div>
      <div className={styles.promptRow}>
        <input
          type="text"
          className={styles.promptInput}
          placeholder="描述想要的场景，如：湖边黄昏"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className={styles.genBtn} disabled={busy} onClick={() => void generate()}>
          {busy ? '生成中…' : '生成'}
        </button>
      </div>
      <div className={styles.uploadRow}>
        <button
          className={styles.genBtn}
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          上传自定义背景图
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleUpload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div className={styles.genStatus}>{status || '本地演示引擎 · 离线可用'}</div>
    </div>
  );
}
