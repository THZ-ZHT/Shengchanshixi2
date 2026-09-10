import { useEffect, useRef, useState } from 'react';
import { DEMO, DEMO_MODEL_URL, LIGHT_SOURCE, kelvinToRgb } from '../../constants/layout';
import { loadImage } from '../../engine/layers';
import { buildHeightmap } from '../../engine/heightmap';
import { useCompositionStore } from '../../store/compositionStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import styles from '../../styles/workspace.module.css';

type ModelTab = 'demo' | 'local';

/** Resolve the current subject image: user-uploaded portrait first, else demo. */
function getSubjectSource(): string {
  const user = useCompositionStore.getState().userImage;
  if (user?.subject) return user.subject;
  const mask = useWorkspaceStore.getState().assets.find((a) => a.kind === 'mask' && a.src);
  if (mask?.src) return mask.src;
  return DEMO.subject;
}

/** Shared three.js light rig driven by the same light source as composition. */
function applySharedLight(THREE: typeof import('three'), scene: import('three').Scene) {
  const [r, g, b] = kelvinToRgb(LIGHT_SOURCE.kelvin);
  const rad = (LIGHT_SOURCE.azimuthDeg * Math.PI) / 180;
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(new THREE.Color(r, g, b), LIGHT_SOURCE.intensity * 2.4);
  key.position.set(Math.cos(rad) * 4, 2.6, Math.sin(rad) * 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe9e6, 0.35);
  fill.position.set(-2, 1.6, 3);
  scene.add(fill);
}

function lightCaption(): string {
  return `光源与合成一致 · 方位 ${LIGHT_SOURCE.azimuthDeg}° · 色温 ${LIGHT_SOURCE.kelvin}K · 强度 ${Math.round(
    LIGHT_SOURCE.intensity * 100,
  )}%`;
}

/**
 * Tab 2 of the AI generation panel.
 * - demo: three.js viewer of the GLB model (dynamically imported, load progress)
 * - local: image -> heightmap -> displaced plane mesh, fully local
 * Both support a fullscreen 3D scene.
 */
export default function ModelGenPanel(): JSX.Element {
  const [tab, setTab] = useState<ModelTab>('demo');
  const [full, setFull] = useState<ModelTab | null>(null);

  return (
    <div>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'demo' ? styles.tabActive : ''}`}
          onClick={() => setTab('demo')}
        >
          AI 生成示例
        </button>
        <button
          className={`${styles.tab} ${tab === 'local' ? styles.tabActive : ''}`}
          onClick={() => setTab('local')}
        >
          图生 3D（本地）
        </button>
      </div>
      {tab === 'demo' ? <GlbViewer big={false} /> : <LocalMeshViewer big={false} />}
      <button className={styles.genBtn} style={{ marginTop: 8, width: '100%' }} onClick={() => setFull(tab)}>
        全屏查看三维场景
      </button>

      {full && (
        <div className={styles.modal3d} onClick={() => setFull(null)}>
          <div className={styles.modal3dInner} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modal3dHead}>
              <span className={styles.modal3dTitle}>
                三维场景 · {full === 'demo' ? 'AI 生成模型' : '本地图生 3D'}
              </span>
              <span className={styles.modal3dMeta}>{lightCaption()}</span>
              <button className={styles.toolbarBtn} onClick={() => setFull(null)}>
                关闭
              </button>
            </div>
            <div className={styles.modal3dBody}>
              {full === 'demo' ? <GlbViewer big /> : <LocalMeshViewer big />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** three.js GLB viewer with orbit controls, auto rotate and load progress. */
function GlbViewer({ big }: { big: boolean }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在加载三维引擎与模型…');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (disposed || !hostRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1b1d20);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 1.2, 3);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const host = hostRef.current;
        const resize = () => {
          const w = host.clientWidth || 330;
          const h = big ? host.clientHeight || 520 : w;
          renderer.setSize(w, h, false);
          camera.aspect = w / Math.max(1, h);
          camera.updateProjectionMatrix();
        };
        resize();
        host.appendChild(renderer.domElement);

        applySharedLight(THREE, scene);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.6;

        setStatus('正在加载模型…');
        const loader = new GLTFLoader();
        loader.load(
          DEMO_MODEL_URL,
          (gltf) => {
            if (disposed) return;
            scene.add(gltf.scene);
            setStatus('AI 生成示例模型 · 拖动旋转 / 滚轮缩放');
          },
          (evt) => {
            if (evt.total > 0) setProgress(Math.min(100, (evt.loaded / evt.total) * 100));
          },
          () => setStatus('模型加载失败，请刷新重试'),
        );

        let raf = 0;
        const loop = () => {
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();

        const onResize = () => resize();
        window.addEventListener('resize', onResize);

        cleanup = () => {
          window.removeEventListener('resize', onResize);
          cancelAnimationFrame(raf);
          controls.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        setStatus('三维查看器不可用');
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [big]);

  return (
    <div>
      <div ref={hostRef} className={big ? styles.viewerBoxBig : styles.viewerBox} />
      {progress > 0 && progress < 100 && (
        <div className={styles.loadBarOuter}>
          <div className={styles.loadBarFill} style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className={styles.progressLine}>{status}</div>
      <div className={styles.genStatus}>{lightCaption()}</div>
    </div>
  );
}

const PROGRESS_STEPS = ['解析主体…', '估计深度…', '构建网格…'];

/** Local image-to-3D: heightmap displaced plane built from the subject. */
function LocalMeshViewer({ big }: { big: boolean }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('点击「生成网格」开始 · 使用当前主体图');
  const [res, setRes] = useState(128);
  const [wire, setWire] = useState(false);
  const meshRef = useRef<import('three').Mesh | null>(null);

  useEffect(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as import('three').MeshStandardMaterial;
      mat.wireframe = wire;
      mat.needsUpdate = true;
    }
  }, [wire]);

  const generate = () => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    setStatus(PROGRESS_STEPS[0]);

    void (async () => {
      try {
        const subject = await loadImage(getSubjectSource());
        setStatus(PROGRESS_STEPS[1]);
        await new Promise((r) => setTimeout(r, 400));
        const hm = buildHeightmap(subject, res, subject);

        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (!hostRef.current) return;
        hostRef.current.innerHTML = '';

        setStatus(PROGRESS_STEPS[2]);
        await new Promise((r) => setTimeout(r, 400));

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1b1d20);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 1.1, 2.6);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const w = hostRef.current.clientWidth || 330;
        const h = big ? hostRef.current.clientHeight || 520 : w;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
        hostRef.current.appendChild(renderer.domElement);

        applySharedLight(THREE, scene);

        const ratio = subject.naturalWidth / Math.max(1, subject.naturalHeight);
        const geo = new THREE.PlaneGeometry(2.6, 2.6 * ratio, res - 1, res - 1);
        const pos = geo.getAttribute('position') as import('three').BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const u = (pos.getX(i) / 2.6 + 0.5) * (hm.size - 1);
          const v = (0.5 - pos.getY(i) / (2.6 * ratio)) * (hm.size - 1);
          const idx = Math.round(v) * hm.size + Math.round(u);
          pos.setZ(i, hm.data[idx] * 0.7);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();

        const texture = new THREE.TextureLoader().load(hm.textureDataUrl);
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            wireframe: wire,
            transparent: true,
            alphaTest: 0.05,
          }),
        );
        meshRef.current = mesh;
        scene.add(mesh);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.4;

        setStatus(`本地网格已生成 · 分辨率 ${res}×${res} · 拖动查看`);
        let raf = 0;
        const loop = () => {
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
        const observer = new MutationObserver(() => {
          if (!renderer.domElement.isConnected) {
            cancelAnimationFrame(raf);
            controls.dispose();
            renderer.dispose();
            observer.disconnect();
          }
        });
        observer.observe(hostRef.current, { childList: true });
      } catch {
        setStatus('本地 3D 生成失败');
      }
    })();
  };

  const exportMesh = async () => {
    if (!meshRef.current) {
      setStatus('请先生成网格再导出');
      return;
    }
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();
      exporter.parse(
        meshRef.current,
        (result) => {
          const blob = new Blob([JSON.stringify(result)], { type: 'model/gltf+json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `imagecompose-mesh-${res}.gltf`;
          a.click();
          URL.revokeObjectURL(a.href);
          setStatus('已导出网格文件');
        },
        (err) => setStatus(`导出失败：${String(err)}`),
      );
    } catch {
      setStatus('导出组件不可用');
    }
  };

  return (
    <div>
      <div ref={hostRef} className={big ? styles.viewerBoxBig : styles.viewerBox} />
      <div className={styles.progressLine}>{status}</div>
      <div className={styles.meshCtlRow}>
        <select
          className={styles.meshSelect}
          value={res}
          onChange={(e) => setRes(Number(e.target.value))}
          aria-label="网格分辨率"
        >
          <option value={96}>96 × 96</option>
          <option value={128}>128 × 128</option>
          <option value={192}>192 × 192</option>
          <option value={256}>256 × 256</option>
        </select>
        <label className={styles.meshToggle}>
          <input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} />
          线框
        </label>
      </div>
      <div className={styles.meshBtnRow}>
        <button className={styles.genBtn} onClick={generate}>
          生成网格
        </button>
        <button className={styles.toolbarBtn} onClick={() => void exportMesh()}>
          导出 GLB
        </button>
      </div>
      <div className={styles.genStatus}>{lightCaption()}</div>
    </div>
  );
}
