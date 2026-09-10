import { useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DEMO } from '../../constants/layout';
import { prefersReducedMotion } from '../../store/compositionStore';
import { exportImage, exportMetadata } from '../../services/export';
import type { SubjectAnimation } from '../../types';
import styles from '../../styles/workstation.module.css';

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

/**
 * Centerpiece canvas for the workstation.
 *
 * - Toolbar: 原图/结果/对比/动画/导出
 * - Compare slider with animated reveal
 * - Subject overlay with animation styles (only when animation preview is on,
 *   so the overlay doesn't double-render the baked-in subject)
 */
export default function WorkstationCanvas(): JSX.Element {
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
  const backgroundForPreview = assets.filter((a) => a.kind === 'background').slice(-1)[0];
  const displayImage = animationPreview && backgroundForPreview ? backgroundForPreview : preview;
  const result = assets.find((a) => a.id === canvasResultId);

  const updateSplit = (clientX: number) => {
    const rect = cmpRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplit(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

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
    await exportImage(preview?.canvas ?? preview?.src ?? DEMO.final, opt.format, opt.size, `imagecompose-${opt.size}`);
  };

  const subjectOverlay = useMemo(() => (subject?.src ? subject : null), [subject]);

  return (
    <section className={styles.wsCanvasWrap}>
      <div className={styles.wsCanvasToolbar}>
        <button
          className={`${styles.wsToolBtn} ${previewAssetId === source?.id ? styles.wsToolBtnActive : ''}`}
          onClick={() => {
            setCompare(false);
            if (source) setPreviewAsset(source.id);
          }}
        >
          原图
        </button>
        <button
          className={`${styles.wsToolBtn} ${previewAssetId === canvasResultId ? styles.wsToolBtnActive : ''}`}
          disabled={!canvasResultId}
          onClick={() => {
            setCompare(false);
            if (canvasResultId) setPreviewAsset(canvasResultId);
          }}
        >
          结果
        </button>
        <button
          className={`${styles.wsToolBtn} ${compare ? styles.wsToolBtnActive : ''}`}
          disabled={!source || !result}
          onClick={() => setCompare((v) => !v)}
        >
          对比
        </button>
        <button
          className={`${styles.wsToolBtn} ${playing ? styles.wsToolBtnActive : ''}`}
          disabled={!source || !result}
          onClick={playTransition}
        >
          {playing ? '过渡中…' : '播放过渡'}
        </button>
        <button
          className={`${styles.wsToolBtn} ${animationPreview ? styles.wsToolBtnActive : ''}`}
          disabled={!source || !subject}
          onClick={() => updateParams({ animationPreview: !animationPreview })}
          title={animationPreview ? '关闭动画预览，回到合成图' : '显示背景+动态主体（避免与成片主体重叠）'}
        >
          {animationPreview ? '动画预览 · 开' : '动画预览'}
        </button>
        <label className={styles.wsToolSelect}>
          <span>动画</span>
          <select value={subjectAnimation} onChange={(e) => setSubjectAnimation(e.target.value as SubjectAnimation)}>
            {ANIM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.wsExportWrap}>
          <button className={styles.wsToolBtn} onClick={() => setMenuOpen((v) => !v)}>
            导出 ▾
          </button>
          {menuOpen && (
            <div className={styles.wsExportMenu}>
              {EXPORT_OPTIONS.map((opt) => (
                <button key={opt.label} className={styles.wsExportItem} onClick={() => void doExport(opt)}>
                  {opt.label}
                </button>
              ))}
              <button
                className={styles.wsExportItem}
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

      <div className={styles.wsCanvasHost}>
        {compare && source && result ? (
          <div
            ref={cmpRef}
            className={styles.wsCanvasCompareHost}
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
            <img className={styles.wsCanvasCompareImg} src={result.src} alt="成片" draggable={false} />
            <img
              className={styles.wsCanvasCompareImg}
              src={source.src}
              alt="原图"
              draggable={false}
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div className={styles.wsCanvasCompareDivider} style={{ left: `${split}%` }}>
              <span className={styles.wsCanvasCompareKnob}>⇔</span>
            </div>
            <span className={`${styles.wsCanvasCompareTag} ${styles.wsCanvasCompareTagLeft}`}>原图</span>
            <span className={`${styles.wsCanvasCompareTag} ${styles.wsCanvasCompareTagRight}`}>成片</span>
          </div>
        ) : displayImage ? (
          <div className={styles.wsCanvasInner}>
            <img className={styles.wsCanvasImg} src={displayImage.src} alt={displayImage.label ?? ''} />
            {!compare && subjectOverlay && animationPreview && (
              <img
                ref={subjectRef}
                className={`${styles.wsPreviewSubject} ${
                  styles[`wsSubjectAnim_${subjectAnimation}`] ?? ''
                }`}
                src={subjectOverlay.src}
                alt="动画主体"
                draggable={false}
              />
            )}
          </div>
        ) : (
          <div className={styles.wsEmpty}>尚无预览资产</div>
        )}
        {!compare && <div className={styles.wsCanvasBadge}>本地演示引擎 · 7 步流水线</div>}
      </div>
    </section>
  );
}
