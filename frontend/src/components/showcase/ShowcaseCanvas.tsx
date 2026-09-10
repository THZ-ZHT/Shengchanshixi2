import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TWEEN, seekProgress, useCompositionStore } from '../../store/compositionStore';
import { useGsapTicker } from '../../hooks/useGsapTicker';
import { getStage, STAGE_ANCHORS, clamp01 } from '../../constants/stages';
import { DEMO, SUBJECT_BOX, SUBJECT_FEET } from '../../constants/layout';
import styles from '../../styles/showcase.module.css';

interface MouseState {
  x: number;
  y: number;
  inside: boolean;
}

/**
 * Layered composition canvas. Every frame reads TWEEN.progress and writes DOM
 * styles directly (no React state) — BG / checker / scene / subject / lights /
 * contact shadow / grain / detection box / hover tag.
 */
export default function ShowcaseCanvas(): JSX.Element {
  const navigate = useNavigate();
  const userImage = useCompositionStore((s) => s.userImage);
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const checkerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLDivElement>(null);
  const lightARef = useRef<HTMLDivElement>(null);
  const lightBRef = useRef<HTMLDivElement>(null);
  const lightCRef = useRef<HTMLDivElement>(null);
  const lightDRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const boxLabelRef = useRef<HTMLSpanElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const mouse = useRef<MouseState>({ x: 0, y: 0, inside: false });
  const drag = useRef({ active: false, startX: 0, startP: 0, moved: 0 });

  useGsapTicker(() => {
    const p = TWEEN.progress;
    const stage = getStage(p);
    const t = clamp01((p - stage.start) / (stage.end - stage.start));
    const m = mouse.current;
    const parallaxOn = p > 12 && p < 99.5;

    // background: fades away through EXTRACT with blur + desaturation
    const bg = bgRef.current;
    if (bg) {
      if (stage.id === 'UNDERSTAND') {
        bg.style.opacity = '1';
        bg.style.filter = 'none';
      } else if (stage.id === 'EXTRACT') {
        bg.style.opacity = String(1 - t);
        bg.style.filter = `blur(${(12 * t).toFixed(2)}px) saturate(${(1 - t).toFixed(3)})`;
      } else {
        bg.style.opacity = '0';
      }
      const amp = 4;
      bg.style.transform = parallaxOn
        ? `translate(${(-m.x * amp).toFixed(2)}px, ${(-m.y * amp * 0.6).toFixed(2)}px) scale(1.03)`
        : 'scale(1.03)';
    }

    // checkerboard: in through EXTRACT, out through COMPOSE
    const checker = checkerRef.current;
    if (checker) {
      let o = 0;
      if (stage.id === 'EXTRACT') o = Math.min(1, t * 4);
      else if (stage.id === 'COMPOSE') o = 1 - t;
      checker.style.opacity = o.toFixed(3);
    }

    // scene: rises through COMPOSE, stays 1 afterwards
    const scene = sceneRef.current;
    if (scene) {
      scene.style.opacity = p < 28 ? '0' : stage.id === 'COMPOSE' ? t.toFixed(3) : '1';
      scene.style.transform = parallaxOn
        ? `translate(${(m.x * 2).toFixed(2)}px, ${(m.y * 1.4).toFixed(2)}px) scale(1.02)`
        : 'scale(1.02)';
    }

    // subject: appears with glow in EXTRACT, melts into the scene in HARMONIZE
    const subject = subjectRef.current;
    if (subject) {
      let o = 0;
      let glow = 0;
      if (stage.id === 'EXTRACT') {
        o = Math.min(1, t * 2);
        glow = 12 * t;
      } else if (stage.id === 'COMPOSE' || stage.id === 'ILLUMINATE' || stage.id === 'GROUND') {
        o = 1;
        glow = 12;
      } else if (stage.id === 'HARMONIZE') {
        o = 1 - t;
        glow = 12 * (1 - t);
      }
      subject.style.opacity = o.toFixed(3);
      subject.style.filter =
        glow > 0.05 ? `drop-shadow(0 0 ${glow.toFixed(1)}px rgba(220,233,228,.9))` : 'none';
      subject.style.transform = parallaxOn
        ? `translate(${(m.x * 2).toFixed(2)}px, ${(m.y * 1.4).toFixed(2)}px)`
        : 'none';
    }

    // ILLUMINATE light stack (right / sunset side), follows cursor after 63%
    const lightT =
      stage.id === 'ILLUMINATE' ? t : stage.id === 'GROUND' ? 1 : stage.id === 'HARMONIZE' ? 1 - t : 0;
    const followAmp = p > 63 ? 26 : 10;
    const lights = [lightARef.current, lightBRef.current, lightCRef.current, lightDRef.current];
    const lightBase = [0.85, 1, 1, 1];
    lights.forEach((el, i) => {
      if (!el) return;
      el.style.opacity = (lightBase[i] * lightT).toFixed(3);
      el.style.transform = `translate(${(m.x * followAmp).toFixed(2)}px, ${(m.y * followAmp * 0.7).toFixed(2)}px)`;
    });

    // GROUND contact shadow
    const groundT =
      stage.id === 'GROUND' ? t : stage.id === 'HARMONIZE' ? 1 - t : 0;
    const shadow = shadowRef.current;
    if (shadow) {
      shadow.style.transform = `scaleX(${(0.2 + 0.8 * groundT).toFixed(3)})`;
      shadow.style.opacity = (0.35 * groundT).toFixed(3);
      shadow.style.filter = 'blur(8px)';
    }

    // HARMONIZE grade + grain (settles back to pure final frame in CRITIC)
    const wrap = wrapRef.current;
    const grain = grainRef.current;
    let hs = 0;
    if (stage.id === 'HARMONIZE') hs = t;
    else if (stage.id === 'CRITIC') hs = 1 - t;
    if (wrap) {
      wrap.style.filter =
        hs > 0.005
          ? `saturate(${(1 + 0.05 * hs).toFixed(3)}) contrast(${(1 + 0.06 * hs).toFixed(3)}) sepia(${(0.08 * hs).toFixed(3)})`
          : 'none';
    }
    if (grain) grain.style.opacity = (hs * 0.4).toFixed(3);

    // UNDERSTAND detection box
    const boxT = stage.id === 'UNDERSTAND' ? (t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1) : 0;
    if (boxRef.current) boxRef.current.style.opacity = boxT.toFixed(3);
    if (boxLabelRef.current) boxLabelRef.current.style.opacity = boxT.toFixed(3);

    // hover subject tag
    if (tagRef.current) {
      const show = m.inside && p > 12 && p < 99.5 && drag.current.moved < 6;
      tagRef.current.style.opacity = show ? '1' : '0';
    }
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { active: true, startX: e.clientX, startP: TWEEN.progress, moved: 0 };
    rootRef.current?.classList.add(styles.stageWrapDragging);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouse.current.inside = true;
    if (drag.current.active) {
      const dx = e.clientX - drag.current.startX;
      drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
      seekProgress(drag.current.startP + (dx / rect.width) * 100);
    }
  };

  const endDrag = () => {
    drag.current.active = false;
    rootRef.current?.classList.remove(styles.stageWrapDragging);
  };

  const onPointerLeave = () => {
    mouse.current.inside = false;
    endDrag();
  };

  const onClick = () => {
    if (drag.current.moved > 5) return;
    if (TWEEN.progress >= 99.5) {
      navigate('/workspace');
      return;
    }
    // snap to the nearest stage anchor
    let best = STAGE_ANCHORS[0];
    let bestD = Infinity;
    for (const a of STAGE_ANCHORS) {
      const d = Math.abs(a - TWEEN.progress);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    seekProgress(best);
  };

  return (
    <div
      ref={rootRef}
      className={styles.stageWrap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <div className={styles.stage}>
        <div ref={wrapRef} className={styles.photoWrap}>
          <div ref={bgRef} className={styles.layer}>
            <img
              className={styles.imgCover}
              src={userImage?.original ?? DEMO.grayCity}
              alt={userImage ? `原图 · ${userImage.name}` : '原图 · 灰度城市'}
              draggable={false}
            />
          </div>
          <div ref={checkerRef} className={styles.checkerLayer} />
          <div ref={sceneRef} className={styles.layer} style={{ opacity: 0 }}>
            <img
              className={styles.imgCover}
              src={userImage?.final ?? DEMO.final}
              alt={userImage ? '场景 · 合成结果' : '场景 · 夕阳湖边'}
              draggable={false}
            />
          </div>
          <div ref={subjectRef} className={styles.layer} style={{ opacity: 0 }}>
            <img
              className={styles.imgCover}
              src={userImage?.subject ?? DEMO.subject}
              alt={userImage ? '主体 · 抠取结果' : '主体 · 抠取结果'}
              draggable={false}
            />
          </div>
        </div>
        <div ref={lightARef} className={styles.lightA} />
        <div ref={lightBRef} className={styles.lightB} />
        <div ref={lightCRef} className={styles.lightC} />
        <div ref={lightDRef} className={styles.lightD} />
        <div
          ref={shadowRef}
          className={styles.contactShadow}
          style={{ left: `${(SUBJECT_FEET.x - 0.14) * 100}%`, bottom: '0.5%' }}
        />
        <div ref={grainRef} className={styles.grain} />
        <div
          ref={boxRef}
          className={styles.detectBox}
          style={{
            left: `${SUBJECT_BOX.x * 100}%`,
            top: `${SUBJECT_BOX.y * 100}%`,
            width: `${SUBJECT_BOX.w * 100}%`,
            height: `${SUBJECT_BOX.h * 100}%`,
          }}
        >
          <span ref={boxLabelRef} className={styles.detectLabel}>
            Subject · 98.2%
          </span>
        </div>
        <div ref={tagRef} className={styles.subjectTag}>
          Subject · 98.2%
        </div>
      </div>
    </div>
  );
}
