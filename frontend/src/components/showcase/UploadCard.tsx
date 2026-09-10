import { useRef, useState } from 'react';
import { useCompositionStore } from '../../store/compositionStore';
import { DEMO } from '../../constants/layout';
import { extractSubject, fileToDataURL } from '../../utils/imageMatting';
import { composeUserPreview } from '../../utils/composePreview';
import styles from '../../styles/showcase.module.css';

function UploadIcon(): JSX.Element {
  return (
    <svg className={styles.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.8" />
      <path d="M3 17l5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8.5V3.5M9.5 6L12 3.5 14.5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Phase = 'idle' | 'reading' | 'matting' | 'composing' | 'ready' | 'error';

/** State A upload card with drag-over highlight, real-file ingestion, and demo shortcut. */
export default function UploadCard(): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const beginProcessing = (name: string) => {
    const store = useCompositionStore.getState();
    store.setUploadName(name);
    store.setStatus('processing');
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhase('error');
      setErrorMsg('请选择图片文件（JPG / PNG / WEBP）');
      return;
    }
    setPhase('reading');
    setErrorMsg('');
    try {
      const dataURL = await fileToDataURL(file);
      setPhase('matting');
      const { subject, width, height, coverage } = await extractSubject({ dataURL });
      setPhase('composing');
      const final = await composeUserPreview({
        backgroundSrc: '/assets/bg/bg_forest.png',
        subjectDataURL: subject,
        subjectScale: 0.6,
        subjectAnchorY: 0.78,
        withShadow: true,
        withGrade: true,
      });
      setPhase('ready');
      useCompositionStore.getState().      setUserImage({
        original: dataURL,
        subject,
        final,
        width,
        height,
        name: file.name,
      });
      // Hint when coverage is suspicious (likely no clear background).
      if (coverage < 0.04) {
        setErrorMsg('提示：图像背景与主体颜色接近，抠图效果可能不理想');
      }
      beginProcessing(file.name);
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : '处理失败');
    }
  };

  const isWorking = phase === 'reading' || phase === 'matting';
  const statusLabel =
    phase === 'reading'
      ? '读取图像…'
      : phase === 'matting'
        ? '智能体抠取主体…'
        : phase === 'composing'
          ? '合成预览场景…'
          : phase === 'ready'
            ? '准备合成'
            : '';

  return (
    <>
      <div
        className={`${styles.uploadCard} ${dragging ? styles.dragging : ''}`}
        onClick={() => !isWorking && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        aria-busy={isWorking}
      >
        <UploadIcon />
        <div className={styles.uploadTitle}>
          {isWorking ? statusLabel : '拖入图片'}
        </div>
        <div className={styles.uploadMeta}>
          {isWorking
            ? '无需等待，可随时切到演示图体验'
            : 'JPG / PNG / WEBP · 点击或拖拽上传'}
        </div>
        <div className={styles.uploadThumbWrap}>
          <img className={styles.uploadThumb} src={DEMO.indoor} alt="示例" />
        </div>
        <div className={styles.uploadHint}>
          {phase === 'error' && errorMsg ? (
            <span className={styles.uploadError}>{errorMsg}</span>
          ) : (
            '上传后由智能体自动完成七阶段合成'
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div className={styles.uploadSide}>
        <button
          className={styles.demoBtn}
          onClick={(e) => {
            e.stopPropagation();
            useCompositionStore.getState().setUserImage(null);
            beginProcessing('demo_gray_city.png');
          }}
        >
          试用示例图
        </button>
        <div className={styles.uploadSideNote}>
          没有合适的图片？用演示图直接体验完整流程。
        </div>
      </div>
    </>
  );
}