import type { StageDef, StageId } from '../types';

/** Seven composition stages with progress ranges (0-100). */
export const STAGES: StageDef[] = [
  { id: 'UNDERSTAND', start: 0, end: 12, narration: '我先读懂这张照片：灰度城市街景，主体是一位行人。' },
  { id: 'EXTRACT', start: 12, end: 28, narration: '正在把主体从背景分离，生成像素级 Alpha 遮罩。' },
  { id: 'COMPOSE', start: 28, end: 45, narration: '为夕阳湖边场景做像素级对齐，把主体放进新环境。' },
  { id: 'ILLUMINATE', start: 45, end: 65, narration: '光来自右侧落日方向，我正在重新调整人物光照。' },
  { id: 'GROUND', start: 65, end: 78, narration: '生成接触阴影，让双脚稳稳落地。' },
  { id: 'HARMONIZE', start: 78, end: 92, narration: '统一色调与颗粒，让人物真正融入这个黄昏。' },
  { id: 'CRITIC', start: 92, end: 100, narration: 'AI 自检中：光照、阴影、色彩、边缘逐项评分。' },
];

export const FINAL_NARRATION = '合成完成，五维检查全部通过。可以进入工作台继续编辑。';

export const STAGE_LABELS: Record<StageId, string> = {
  UNDERSTAND: '理解',
  EXTRACT: '抠取',
  COMPOSE: '合成',
  ILLUMINATE: '打光',
  GROUND: '落地',
  HARMONIZE: '和谐',
  CRITIC: '自检',
};

/** English stage name kept for academic captions / export metadata. */
export const STAGE_LABELS_EN: Record<StageId, string> = {
  UNDERSTAND: 'Understand',
  EXTRACT: 'Extract',
  COMPOSE: 'Compose',
  ILLUMINATE: 'Illuminate',
  GROUND: 'Ground',
  HARMONIZE: 'Harmonize',
  CRITIC: 'Critic',
};

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Derive the current stage from raw progress (pure function). */
export function getStage(p: number): StageDef {
  const v = Math.max(0, Math.min(100, p));
  for (const s of STAGES) {
    if (v < s.end) return s;
  }
  return STAGES[STAGES.length - 1];
}

/** Normalized progress inside the current stage (0-1). */
export function getStageProgress(p: number): number {
  const s = getStage(p);
  return clamp01((p - s.start) / (s.end - s.start));
}

/** All snap anchors: stage starts plus the final point. */
export const STAGE_ANCHORS: number[] = [...STAGES.map((s) => s.start), 100];
