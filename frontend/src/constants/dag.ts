/** Execution DAG chain definition (n1 -> n7). */

export interface DagNodeDef {
  id: string;
  name: string;
  label: string;
}

export const DAG_CHAIN: DagNodeDef[] = [
  { id: 'n1', name: 'matting', label: '主体抠图' },
  { id: 'n2', name: 'background_generate', label: '背景生成' },
  { id: 'n3', name: 'lighting_estimate', label: '光照估计' },
  { id: 'n4', name: 'relight', label: '重打光' },
  { id: 'n5', name: 'shadow_generate', label: '接触阴影' },
  { id: 'n6', name: 'harmonize', label: '色彩和谐化' },
  { id: 'n7', name: 'critic', label: 'AI 自检' },
];

export function dagIndex(nodeId: string): number {
  return DAG_CHAIN.findIndex((n) => n.id === nodeId);
}
