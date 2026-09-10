import { create } from 'zustand';
import type {
  ActivityEntry,
  AgentMessage,
  Asset,
  DagNode,
  DagStatus,
  NodeVersion,
  ParsedAction,
} from '../types';
import { DAG_CHAIN } from '../constants/dag';
import { DEMO } from '../constants/layout';
import { useCompositionStore } from './compositionStore';
import type { SubjectAnimation } from '../types';
import {
  applyAction as applyActionService,
  rollback as rollbackService,
  runDag as runDagService,
} from '../services/orchestrator';

export interface WorkspaceParams {
  bgPreset: string;
  tempK: number;
  shadowIntensity: number;
  harmonizeStrength: number;
  exposure: number;
  edgeFeather: number;
  subjectAnimation: SubjectAnimation;
  animationPreview: boolean;
}

export interface AddAssetInput {
  id?: string;
  kind: Asset['kind'];
  label: string;
  src?: string;
  canvas?: HTMLCanvasElement;
  meta?: Record<string, string | number>;
}

export interface AddVersionInput {
  nodeId: string;
  params: Record<string, number | string>;
  assetIds: string[];
}

let assetSeq = 0;
let msgSeq = 0;
let activitySeq = 0;
const versionCounters: Record<string, number> = {};

function initialDagNodes(): DagNode[] {
  return DAG_CHAIN.map((d) => ({
    id: d.id,
    name: d.name,
    label: d.label,
    status: 'pending' as DagStatus,
    versionId: null,
    artifactAssetId: null,
  }));
}

interface WorkspaceState {
  assets: Asset[];
  versions: NodeVersion[];
  dagNodes: DagNode[];
  messages: AgentMessage[];
  activityLog: ActivityEntry[];
  activeNodeId: string | null;
  previewAssetId: string | null;
  canvasResultId: string | null;
  running: boolean;
  /** Wall-clock timestamp the current run started (for elapsed display). */
  runStartedAt: number | null;
  params: WorkspaceParams;
  addAsset: (input: AddAssetInput) => string;
  addVersion: (input: AddVersionInput) => string;
  removeAsset: (id: string) => void;
  replaceAsset: (id: string, patch: Partial<Pick<Asset, 'src' | 'label' | 'meta'>>) => void;
  pushMessage: (m: Omit<AgentMessage, 'id' | 'ts'>) => void;
  pushActivity: (e: Omit<ActivityEntry, 'id' | 'ts'>) => void;
  setNodeStatus: (id: string, status: DagStatus) => void;
  completeNode: (id: string, versionId: string, assetId: string | null) => void;
  setActiveNode: (id: string | null) => void;
  setPreviewAsset: (id: string | null) => void;
  setCanvasResult: (id: string | null) => void;
  setRunning: (b: boolean) => void;
  updateParams: (p: Partial<WorkspaceParams>) => void;
  setSubjectAnimation: (a: SubjectAnimation) => void;
  initDemoAssets: () => void;
  runDag: (fromNodeId?: string) => Promise<void>;
  applyAction: (a: ParsedAction) => Promise<void>;
  rollback: (nodeId: string, keepLight: boolean) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  assets: [],
  versions: [],
  dagNodes: initialDagNodes(),
  messages: [],
  activityLog: [],
  activeNodeId: null,
  previewAssetId: null,
  canvasResultId: null,
  running: false,
  runStartedAt: null,
  params: {
    bgPreset: 'bg_lake',
    tempK: 4800,
    shadowIntensity: 0.35,
    harmonizeStrength: 0.5,
    exposure: 1,
    edgeFeather: 0,
    subjectAnimation: 'none',
    animationPreview: false,
  },

  addAsset: (input) => {
    assetSeq += 1;
    const asset: Asset = {
      id: input.id ?? `asset-${assetSeq}`,
      kind: input.kind,
      label: input.label,
      src: input.src,
      canvas: input.canvas,
      meta: input.meta,
      createdAt: Date.now(),
    };
    set((st) => ({ assets: [...st.assets, asset] }));
    return asset.id;
  },

  removeAsset: (id) =>
    set((st) => {
      const remaining = st.assets.filter((a) => a.id !== id);
      // if the removed asset was the current preview or result, fall back.
      const previewAssetId =
        st.previewAssetId === id
          ? remaining.find((a) => a.kind === 'result')?.id ?? remaining[0]?.id ?? null
          : st.previewAssetId;
      const canvasResultId = st.canvasResultId === id ? null : st.canvasResultId;
      return { assets: remaining, previewAssetId, canvasResultId };
    }),

  replaceAsset: (id, patch) =>
    set((st) => ({
      assets: st.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  addVersion: (input) => {
    const n = (versionCounters[input.nodeId] ?? 0) + 1;
    versionCounters[input.nodeId] = n;
    const version: NodeVersion = {
      versionId: `${input.nodeId}-V${n}`,
      nodeId: input.nodeId,
      params: input.params,
      assetIds: input.assetIds,
      createdAt: Date.now(),
    };
    set((st) => ({ versions: [...st.versions, version] }));
    return version.versionId;
  },

  pushMessage: (m) => {
    msgSeq += 1;
    const msg: AgentMessage = { id: `msg-${msgSeq}`, ts: Date.now(), ...m };
    set((st) => ({ messages: [...st.messages, msg] }));
  },

  pushActivity: (e) => {
    activitySeq += 1;
    const entry: ActivityEntry = {
      id: `act-${activitySeq}`,
      ts: Date.now(),
      ...e,
    };
    set((st) => ({ activityLog: [...st.activityLog, entry] }));
  },

  setNodeStatus: (id, status) =>
    set((st) => ({
      dagNodes: st.dagNodes.map((n) => (n.id === id ? { ...n, status } : n)),
    })),

  completeNode: (id, versionId, assetId) =>
    set((st) => ({
      dagNodes: st.dagNodes.map((n) =>
        n.id === id ? { ...n, status: 'done', versionId, artifactAssetId: assetId } : n,
      ),
    })),

  setActiveNode: (activeNodeId) => set({ activeNodeId }),
  setPreviewAsset: (previewAssetId) => set({ previewAssetId }),
  setCanvasResult: (canvasResultId) => set({ canvasResultId }),
  setRunning: (running) =>
    set((st) => ({
      running,
      // Stamp the start time whenever we transition from idle -> running so the
      // UI can show a live "elapsed" counter.
      runStartedAt: running && st.runStartedAt == null ? Date.now() : running ? st.runStartedAt : null,
    })),
  updateParams: (p) => set((st) => ({ params: { ...st.params, ...p } })),
  setSubjectAnimation: (subjectAnimation) =>
    set((st) => ({ params: { ...st.params, subjectAnimation } })),

  initDemoAssets: () =>
    set((st) => {
      if (st.assets.length > 0) return st;
      const now = Date.now();
      const user = useCompositionStore.getState().userImage;
      const source: Asset = {
        id: 'src-main',
        kind: 'source',
        label: user ? `原图 · ${user.name}` : '原图 · 城市街景',
        src: user ? user.original : DEMO.grayCity,
        meta: user ? { source: 'user' } : undefined,
        createdAt: now,
      };
      const subject: Asset = {
        id: 'subj-main',
        kind: 'mask',
        label: '主体层',
        src: user ? user.subject : DEMO.subject,
        meta: user ? { source: 'user', alpha: '实时' } : undefined,
        createdAt: now + 1,
      };
      return { assets: [source, subject], previewAssetId: source.id };
    }),

  runDag: async (fromNodeId?: string) => {
    await runDagService(fromNodeId);
  },

  applyAction: async (a: ParsedAction) => {
    await applyActionService(a);
  },

  rollback: async (nodeId: string, keepLight: boolean) => {
    await rollbackService(nodeId, keepLight);
  },

  // get is intentionally part of the create signature for future selectors.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  __get: undefined as never,
}));

/** Convenience non-hook accessor. */
export function getWorkspaceState(): WorkspaceState {
  return useWorkspaceStore.getState();
}
