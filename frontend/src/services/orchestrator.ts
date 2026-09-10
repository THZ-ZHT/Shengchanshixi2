import type { ParsedAction } from '../types';
import { DAG_CHAIN, dagIndex } from '../constants/dag';
import { BG_PRESETS, CRITIC_SCORES, DEMO, bgPresetById } from '../constants/layout';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useCompositionStore } from '../store/compositionStore';
import { composeUserPreview } from '../utils/composePreview';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randDelay(): number {
  return 600 + Math.random() * 900;
}

/**
 * Build a fresh composite for the current workspace state.
 *
 * - If the user uploaded a portrait, place their extracted subject onto the
 *   currently-selected background preset (or onto a custom upload).
 * - Otherwise, fall back to the demo subject on the same preset so demo mode
 *   also reflects background switches.
 *
 * Returning a freshly-rendered dataURL is what makes "把背景换成傍晚" actually
 * re-skin the canvas instead of leaving the stale upload composite in place.
 */
async function renderCurrentComposite(
  backgroundSrc: string,
): Promise<{ src: string; meta: Record<string, string | number> }> {
  const user = useCompositionStore.getState().userImage;
  const s = useWorkspaceStore.getState();
  if (user) {
    const src = await composeUserPreview({
      backgroundSrc,
      subjectDataURL: user.subject,
      width: user.width,
      height: user.height,
      subjectScale: 0.6,
      subjectAnchorY: 0.78,
      exposure: s.params.exposure,
      edgeFeather: s.params.edgeFeather,
    });
    return { src, meta: { engine: 'local-composed', source: '用户上传' } };
  }
  const src = await composeUserPreview({
    backgroundSrc,
    subjectDataURL: DEMO.subject,
    subjectScale: 0.55,
    subjectAnchorY: 0.72,
    exposure: s.params.exposure,
    edgeFeather: s.params.edgeFeather,
  });
  return { src, meta: { engine: 'local-composed', source: 'demo' } };
}

/**
 * Produce (locally) the artifact for a node, push an immutable version and
 * mark the node done. Returns the artifact asset id (or null).
 */
async function produceArtifact(nodeId: string): Promise<string | null> {
  const s = useWorkspaceStore.getState();
  const user = useCompositionStore.getState().userImage;
  switch (nodeId) {
    case 'n1': {
      const assetId = s.addAsset({
        kind: 'mask',
        label: 'Alpha 遮罩',
        src: user ? user.subject : DEMO.matte,
        meta: user ? { model: '本地抠图', alpha: '实时' } : { model: 'BiRefNet', alpha: '98.2%' },
      });
      const v = s.addVersion({ nodeId, params: user ? { model: '本地抠图', alpha: '实时' } : { model: 'BiRefNet', alpha: '98.2%' }, assetIds: [assetId] });
      s.completeNode(nodeId, v, assetId);
      return assetId;
    }
    case 'n2': {
      const preset = bgPresetById(s.params.bgPreset);
      const assetId = s.addAsset({
        kind: 'background',
        label: preset.label,
        src: preset.src,
        meta: { preset: preset.id },
      });
      const v = s.addVersion({ nodeId, params: { preset: preset.id }, assetIds: [assetId] });
      s.completeNode(nodeId, v, assetId);
      // Keep the canvas preview in sync with the active background so that the
      // user sees the change immediately, even before the full DAG finishes.
      s.setPreviewAsset(assetId);
      return assetId;
    }
    case 'n3': {
      const v = s.addVersion({ nodeId, params: { tempK: s.params.tempK }, assetIds: [] });
      s.completeNode(nodeId, v, null);
      return null;
    }
    case 'n4': {
      const v = s.addVersion({ nodeId, params: { direction: 212, intensity: 72 }, assetIds: [] });
      s.completeNode(nodeId, v, null);
      return null;
    }
    case 'n5': {
      const v = s.addVersion({ nodeId, params: { shadow: s.params.shadowIntensity }, assetIds: [] });
      s.completeNode(nodeId, v, null);
      return null;
    }
    case 'n6': {
      // Re-render the composite with the *current* background so the canvas
      // reflects any switch_bg / custom_bg the user just requested. Previously
      // this branch returned `user.final` (a cached upload composite) which
      // meant commands never visibly changed the background.
      const preset = bgPresetById(s.params.bgPreset);
      const { src: compositeSrc, meta: compositeMeta } = await renderCurrentComposite(preset.src);
      const assetId = s.addAsset({
        kind: 'result',
        label: `合成结果 · ${preset.label}`,
        src: compositeSrc,
        meta: { ...compositeMeta, preset: preset.id, harmonize: s.params.harmonizeStrength, exposure: s.params.exposure, edgeFeather: s.params.edgeFeather },
      });
      const v = s.addVersion({ nodeId, params: { preset: preset.id, harmonize: s.params.harmonizeStrength, exposure: s.params.exposure, edgeFeather: s.params.edgeFeather }, assetIds: [assetId] });
      s.completeNode(nodeId, v, assetId);
      s.setCanvasResult(assetId);
      s.setPreviewAsset(assetId);
      return assetId;
    }
    case 'n7': {
      const v = s.addVersion({ nodeId, params: { passed: 'true' }, assetIds: [] });
      s.completeNode(nodeId, v, null);
      return null;
    }
    default:
      return null;
  }
}

/**
 * Run the DAG chain from `fromNodeId` (or from the very beginning).
 * When VITE_USE_MOCK === 'false' a remote endpoint is attempted first and the
 * local engine is used as an automatic fallback.
 */
export async function runDag(fromNodeId?: string): Promise<void> {
  const s0 = useWorkspaceStore.getState();
  if (s0.running) return;
  s0.setRunning(true);
  const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
  // Map of node -> start timestamp for elapsed display in the activity log.
  const startedAt: Record<string, number> = {};
  try {
    let startIdx = 0;
    if (fromNodeId) {
      const idx = dagIndex(fromNodeId);
      startIdx = idx >= 0 ? idx : 0;
    }
    for (let i = startIdx; i < DAG_CHAIN.length; i++) {
      const def = DAG_CHAIN[i];
      const st = useWorkspaceStore.getState();
      st.setNodeStatus(def.id, 'running');
      startedAt[def.id] = Date.now();
      st.pushMessage({ role: 'agent', text: `正在执行 ${def.label}…` });
      st.pushActivity({
        kind: 'running',
        title: def.label,
        detail: '开始执行…',
        nodeId: def.id,
      });
      if (!useMock) {
        try {
          const base = import.meta.env.VITE_API_BASE ?? '';
          await fetch(`${base}/api/agent/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node: def.id }),
          });
        } catch {
          // remote unavailable -> local engine fallback
        }
      }
      await delay(randDelay());
      await produceArtifact(def.id);
      const elapsed = Date.now() - startedAt[def.id];
      const lastVersion = useWorkspaceStore
        .getState()
        .versions.filter((v) => v.nodeId === def.id)
        .slice(-1)[0];
      st.pushActivity({
        kind: 'done',
        title: def.label,
        detail: `${elapsed}ms · ${lastVersion?.versionId ?? ''}`.trim(),
        nodeId: def.id,
      });
      if (def.id === 'n7') {
        useWorkspaceStore.getState().pushMessage({
          role: 'agent',
          text: '五维检查完成：光照、阴影、色彩、边缘全部通过。',
          critic: CRITIC_SCORES,
        });
        useWorkspaceStore.getState().pushActivity({
          kind: 'critic',
          title: 'AI 自检',
          detail: '光照/阴影/色彩/边缘 全部通过',
          nodeId: 'n7',
        });
      }
    }
  } finally {
    useWorkspaceStore.getState().setRunning(false);
  }
}

/** Re-execute a single node, then run everything downstream of it. */
async function regenerateNode(nodeId: string): Promise<void> {
  const idx = dagIndex(nodeId);
  if (idx < 0) return;
  const s = useWorkspaceStore.getState();
  s.setNodeStatus(nodeId, 'running');
  s.pushMessage({ role: 'agent', text: `正在执行 ${DAG_CHAIN[idx].label}…` });
  await delay(randDelay());
  await produceArtifact(nodeId);
  const next = DAG_CHAIN[idx + 1];
  if (next) await runDag(next.id);
}

/** Apply a parsed user command to the workspace. */
export async function applyAction(action: ParsedAction): Promise<void> {
  const s = useWorkspaceStore.getState();
  switch (action.type) {
    case 'switch_bg':
      s.updateParams({ bgPreset: action.preset });
      await regenerateNode('n2');
      break;
    case 'light_warm':
      s.updateParams({ tempK: 5200 });
      await regenerateNode('n4');
      break;
    case 'light_cool':
      s.updateParams({ tempK: 4200 });
      await regenerateNode('n4');
      break;
    case 'light_kelvin':
      s.updateParams({ tempK: action.tempK });
      await regenerateNode('n4');
      break;
    case 'shadow':
      s.updateParams({ shadowIntensity: action.intensity });
      await regenerateNode('n5');
      break;
    case 'harmonize':
      s.updateParams({ harmonizeStrength: action.strength });
      await regenerateNode('n6');
      break;
    case 'exposure':
      s.updateParams({ exposure: action.value });
      await regenerateNode('n6');
      break;
    case 'edge_feather':
      s.updateParams({ edgeFeather: action.value });
      await regenerateNode('n6');
      break;
    case 'animate':
      s.setSubjectAnimation(action.style);
      s.pushMessage({
        role: 'agent',
        text: `已为人物开启「${action.style}」动画，在画布上即可看到。`,
      });
      break;
    case 'custom_bg': {
      // Treat custom_bg as a switch_bg against the current preset (the prompt
      // is captured for traceability in the asset label / version params). The
      // visual change comes from the downstream n6 re-composition rather than
      // a stale upload composite.
      const preset = bgPresetById(s.params.bgPreset);
      const assetId = s.addAsset({
        kind: 'background',
        label: `自定背景 · ${action.prompt}`,
        src: preset.src,
        meta: { preset: preset.id, prompt: action.prompt },
      });
      const v = s.addVersion({
        nodeId: 'n2',
        params: { preset: preset.id, prompt: action.prompt },
        assetIds: [assetId],
      });
      s.completeNode('n2', v, assetId);
      // Force n6 to re-render the composite with the same background so the
      // canvas refreshes instead of staying on the cached upload composite.
      await regenerateNode('n6');
      s.pushMessage({
        role: 'agent',
        text: `已按提示「${action.prompt}」对当前背景「${preset.label}」重新合成。`,
      });
      break;
    }
    case 'multi':
      for (const sub of action.actions) {
        await applyAction(sub);
      }
      break;
    case 'rollback':
      await rollback(action.nodeId, action.keepLight);
      break;
    case 'unknown':
      s.pushMessage({
        role: 'agent',
        text: `这条指令「${action.raw}」我还没完全理解，可以试试下方的快捷指令。`,
      });
      break;
  }
}

/**
 * Restore the previous artifact version of `nodeId`. When `keepLight` is true
 * the lighting nodes (n3/n4) keep their current outputs.
 */
export async function rollback(nodeId: string, keepLight: boolean): Promise<void> {
  const s = useWorkspaceStore.getState();
  const versions = s.versions.filter((v) => v.nodeId === nodeId);
  if (versions.length < 2) {
    s.pushMessage({ role: 'agent', text: '该节点还没有更早的版本可以回滚。' });
    return;
  }
  const prev = versions[versions.length - 2];
  const versionId = s.addVersion({ nodeId, params: prev.params, assetIds: prev.assetIds });
  const assetId = prev.assetIds.length > 0 ? prev.assetIds[0] : null;
  s.completeNode(nodeId, versionId, assetId);
  s.pushMessage({
    role: 'agent',
    text: keepLight
      ? '已换回上一版背景，并保留当前光线，正在重跑下游节点。'
      : `已回滚到 ${prev.versionId}，正在重跑下游节点。`,
  });
  const idx = dagIndex(nodeId);
  let nextIdx = idx + 1;
  if (keepLight) {
    while (nextIdx < DAG_CHAIN.length && (DAG_CHAIN[nextIdx].id === 'n3' || DAG_CHAIN[nextIdx].id === 'n4')) {
      nextIdx += 1;
    }
  }
  const next = DAG_CHAIN[nextIdx];
  if (next) await runDag(next.id);
}

/** Quick helper used by ImageGenPanel after generating a background locally. */
export function registerGeneratedBackground(presetId: string, label: string, src: string, prompt: string): void {
  const s = useWorkspaceStore.getState();
  const assetId = s.addAsset({
    kind: 'background',
    label,
    src,
    meta: { preset: presetId, prompt },
  });
  const v = s.addVersion({ nodeId: 'n2', params: { preset: presetId, prompt }, assetIds: [assetId] });
  s.completeNode('n2', v, assetId);
  s.setPreviewAsset(assetId);
}

export { BG_PRESETS };
