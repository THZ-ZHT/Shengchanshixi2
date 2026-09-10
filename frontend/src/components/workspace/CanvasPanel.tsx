import { useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DEMO } from '../../constants/layout';
import { prefersReducedMotion } from '../../store/compositionStore';
import { exportImage, exportMetadata } from '../../services/export';
import type { SubjectAnimation } from '../../types';
import styles from '../../styles/workspace.module.css';

type ExportOption = { format: 'png' | 'jpg'; size: 1024 | 2048; label: string };

const EXPORT_OPTIONS: ExportOption[] = [
  { format: 'png', size: 1024, label: 'PNG · 1024' },
  { format: 'png', size: 2048, label: 'PNG · 2048' },
  { format: 'jpg', size: 1024, label: 'JPG · 1024' },
  { format: 'jpg', size: 2048, label: 'JPG · 2048' },
];

const ANIM_OPTIONS: { value: SubjectAnimation; label: string }[] = [
  { value: 'none', label: '静态' },
  { value: 'float', label: '浮动' },
  { value: 'breathe', label: '呼吸' },
  { value: 'pulse', label: '脉动' },
  { value: 'spin', label: '旋转' },
  { value: 'walk', label: '行走' },
  { value: 'swing', label: '摆动' },
];

/** Center column: large asset preview + compare slider / animation style / export toolbar. */
export default function CanvasPanel(): JSX.Element {
  const assets = useWorkspaceStore((s) => s.assets);
  const previewAssetId = useWorkspaceStore((s) => s.previewAssetId);
  const setPreviewAsset = useWorkspaceStore((s) => s.setPreviewAsset);
  const canvasResultId = useWorkspaceStore((s) => s.canvasResultId);
  const subjectAnimation = useWorkspaceStore((s) => s.params.subjectAnimation);
  const setSubjectAnimation = useWorkspaceStore((s) => s.setSubjectAnimation);
  const animationPreview = useWorkspaceStore((s) => s.params.animationPreview);
  const updateParams = useWorkspaceStore((s) => s.updateParams);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(false);
  const cmpRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLImageElement>(null);
  const dragging = useRef(false);
  const splitProxy = useRef({ v: 50 });
  const playTween = useRef<gsap.core.Tween | null>(null);

  const preview = assets.find((a) => a.id === previewAssetId) ?? assets.find((a) => a.id === canvasResultId);
  const source = assets.find((a) => a.kind === 'source');
  const subject = assets.find((a) => a.kind === 'mask');
  // When animation preview is on, show the background asset (no baked-in subject)
  // so the animated subject overlay is the only subject on screen — no overlap.
  const backgroundForPreview = assets
    .filter((a) => a.kind === 'background')
    .slice(-1)[0];
  const displayImage = animationPreview && backgroundForPreview ? backgroundForPreview : preview;
  const result = assets.find((a) => a.id === canvasResultId);

  const showAsset = (id: string | null) => {
    if (id) setPreviewAsset(id);
  };

  const updateSplit = (clientX: number) => {
    const rect = cmpRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplit(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  /** Animate the compare divider from original -> result -> original to visually show the change. */
  const playTransition = () => {
    if (!source || !result) return;
    setCompare(true);
    if (playTween.current) playTween.current.kill();
    if (prefersReducedMotion()) {
      setSplit(0);
      return;
    }
    splitProxy.current.v = 0;
    setSplit(0);
    setPlaying(true);
    playTween.current = gsap.to(splitProxy.current, {
      v: 100,
      duration: 1.1,
      ease: 'power2.inOut',
      onUpdate: () => setSplit(splitProxy.current.v),
      onComplete: () => {
        playTween.current = gsap.to(splitProxy.current, {
          v: 50,
          duration: 0.7,
          ease: 'power2.out',
          onUpdate: () => setSplit(splitProxy.current.v),
          onComplete: () => setPlaying(false),
        });
      },
    });
  };

  const doExport = async (opt: ExportOption) => {
    setMenuOpen(false);
    await exportImage(
      preview?.canvas ?? preview?.src ?? DEMO.final,
      opt.format,
      opt.size,
      `imagecompose-${opt.size}`,
    );
  };

  // The subject overlay should be shown on top of the result image, not in
  // compare mode (the divider already tells the visual story there).
  const subjectOverlay = useMemo(() => {
    if (!subject?.src) return null;
    return subject;
  }, [subject]);

  return (
    <section className={styles.center}>
      <div className={styles.canvasToolbar}>
        <button
          className={`${styles.toolbarBtn} ${previewAssetId === source?.id ? styles.toolbarBtnActive : ''}`}
          onClick={() => {
            setCompare(false);
            showAsset(source?.id ?? null);
          }}
        >
          原图
        </button>
        <button
          className={`${styles.toolbarBtn} ${previewAssetId === canvasResultId ? styles.toolbarBtnActive : ''}`}
          disabled={!canvasResultId}
          onClick={() => {
            setCompare(false);
            showAsset(canvasResultId);
          }}
        >
          结果
        </button>
        <button
          className={`${styles.toolbarBtn} ${compare ? styles.toolbarBtnActive : ''}`}
          disabled={!source || !result}
          onClick={() => setCompare((v) => !v)}
        >
          对比
        </button>
        <button
          className={`${styles.toolbarBtn} ${playing ? styles.toolbarBtnActive : ''}`}
          disabled={!source || !result}
          onClick={playTransition}
        >
          {playing ? '过渡中…' : '播放过渡'}
        </button>
        <button
          className={`${styles.animToggle} ${animationPreview ? styles.animToggleActive : ''}`}
          disabled={!source || !subject}
          onClick={() => updateParams({ animationPreview: !animationPreview })}
          title={animationPreview ? '关闭动画预览，回到合成图' : '显示背景+动态主体（避免与成片主体重叠）'}
        >
          {animationPreview ? '动画预览 · 开' : '动画预览'}
        </button>
        <label className={styles.toolbarSelect}>
          <span>动画</span>
          <select
            value={subjectAnimation}
            onChange={(e) => setSubjectAnimation(e.target.value as SubjectAnimation)}
          >
            {ANIM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.exportWrap}>
          <button className={styles.toolbarBtn} onClick={() => setMenuOpen(!menuOpen)}>
            导出 ▾
          </button>
          {menuOpen && (
            <div className={styles.exportMenu}>
              {EXPORT_OPTIONS.map((opt) => (
                <button key={opt.label} className={styles.exportItem} onClick={() => void doExport(opt)}>
                  {opt.label}
                </button>
              ))}
              <button
                className={styles.exportItem}
                onClick={() => {
                  setMenuOpen(false);
                  const st = useWorkspaceStore.getState();
                  exportMetadata(st.params, st.versions, 'png', 2048);
                }}
              >
                下载元数据 JSON
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={styles.canvasHost}>
        {compare && source && result ? (
          <div
            ref={cmpRef}
            className={styles.compareHost}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragging.current = true;
              updateSplit(e.clientX);
            }}
            onPointerMove={(e) => {
              if (dragging.current) updateSplit(e.clientX);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
          >
            <img className={styles.compareImg} src={result.src} alt="成片" draggable={false} />
            <img
              className={styles.compareImg}
              src={source.src}
              alt="原图"
              draggable={false}
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div className={styles.compareDivider} style={{ left: `${split}%` }}>
              <span className={styles.compareKnob}>⇔</span>
            </div>
            <span className={styles.compareTagLeft}>原图</span>
            <span className={styles.compareTagRight}>成片</span>
          </div>
        ) : preview ? (
          <div className={styles.previewHost}>
            <img className={styles.canvasImg} src={displayImage?.src} alt={displayImage?.label ?? ''} />
            {!compare && subjectOverlay && animationPreview && (
              <img
                ref={subjectRef}
                className={`${styles.subjectOverlay} ${styles[`subjectAnim_${subjectAnimation}`] ?? ''}`}
                src={subjectOverlay.src}
                alt="动画主体"
                draggable={false}
              />
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>尚无预览资产</div>
        )}
        {!compare && <div className={styles.canvasBadge}>本地演示引擎</div>}
      </div>
    </section>
  );
}