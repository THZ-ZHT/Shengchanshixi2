/** Shared type definitions for ImageCompose. */

export type ShowcaseStatus = 'empty' | 'processing' | 'interactive' | 'final';
export type StageId =
  | 'UNDERSTAND'
  | 'EXTRACT'
  | 'COMPOSE'
  | 'ILLUMINATE'
  | 'GROUND'
  | 'HARMONIZE'
  | 'CRITIC';
export type Mode = 'explore' | 'control' | 'create';
export type VoiceState = 'listening' | 'thinking' | 'speaking';
export type DagStatus = 'pending' | 'running' | 'done' | 'failed';

/** Subject-level motion styles applied to the extracted person on the canvas. */
export type SubjectAnimation =
  | 'none'
  | 'float'
  | 'breathe'
  | 'pulse'
  | 'spin'
  | 'walk'
  | 'swing';

export interface StageDef {
  id: StageId;
  start: number;
  end: number;
  narration: string;
}

export interface DagNode {
  id: string;
  name: string;
  label: string;
  status: DagStatus;
  versionId: string | null;
  artifactAssetId: string | null;
}

export interface NodeVersion {
  versionId: string;
  nodeId: string;
  params: Record<string, number | string>;
  assetIds: string[];
  createdAt: number;
}

export interface Asset {
  id: string;
  kind: 'source' | 'mask' | 'background' | 'result' | 'model';
  label: string;
  src?: string;
  canvas?: HTMLCanvasElement;
  meta?: Record<string, string | number>;
  createdAt: number;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  plan?: DagNode[];
  critic?: { key: string; score: number }[];
  ts: number;
}

/** Real-time activity log entry surfaced in the workstation's process timeline. */
export interface ActivityEntry {
  id: string;
  ts: number;
  /** Visual style + semantic category. */
  kind: 'plan' | 'running' | 'done' | 'failed' | 'version' | 'critic' | 'info';
  /** Short label, e.g. node label or "新版本". */
  title: string;
  /** Optional secondary line, e.g. elapsed ms or params snapshot. */
  detail?: string;
  /** DAG node id this entry belongs to, if any. */
  nodeId?: string;
}

export type ParsedAction =
  | { type: 'switch_bg'; preset: string }
  | { type: 'light_warm' }
  | { type: 'light_cool' }
  | { type: 'light_kelvin'; tempK: number }
  | { type: 'shadow'; intensity: number }
  | { type: 'harmonize'; strength: number }
  | { type: 'exposure'; value: number }
  | { type: 'edge_feather'; value: number }
  | { type: 'animate'; style: SubjectAnimation }
  | { type: 'custom_bg'; prompt: string }
  | { type: 'rollback'; nodeId: string; keepLight: boolean }
  | { type: 'multi'; actions: ParsedAction[]; reply: string }
  | { type: 'unknown'; raw: string };

export interface CriticScore {
  key: string;
  score: number;
}
