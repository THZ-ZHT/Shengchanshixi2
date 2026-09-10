import type { CriticScore } from '../types';

/** Demo assets under public/assets (paths must match existing files). */
export const DEMO = {
  grayCity: '/assets/demo/kf_gray_city.png',
  subject: '/assets/demo/kf_subject.png',
  matte: '/assets/demo/kf_matte.png',
  silhouette: '/assets/demo/kf_silhouette.png',
  final: '/assets/demo/kf_final.png',
  indoor: '/assets/demo/kf_indoor.png',
} as const;

export const DEMO_MODEL_URL = '/assets/models/demo_subject.glb';

/**
 * Shared light source used by both the 2D composition and the 3D scene,
 * so the demo can prove "the same light drives image and model".
 */
export const LIGHT_SOURCE = {
  azimuthDeg: 212,
  kelvin: 4800,
  intensity: 0.72,
  side: 'right' as const,
};

/** Rough color-temperature -> RGB conversion (Tanner Helland approximation). */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}

export interface BgPreset {
  id: string;
  label: string;
  src: string;
}

export const BG_PRESETS: BgPreset[] = [
  { id: 'bg_lake', label: '傍晚湖边', src: '/assets/bg/bg_lake.png' },
  { id: 'bg_cafe', label: '咖啡馆', src: '/assets/bg/bg_cafe.png' },
  { id: 'bg_city', label: '城市夜色', src: '/assets/bg/bg_city.png' },
  { id: 'bg_forest', label: '森林', src: '/assets/bg/bg_forest.png' },
];

export function bgPresetById(id: string): BgPreset {
  return BG_PRESETS.find((p) => p.id === id) ?? BG_PRESETS[0];
}

/** Five-dimension critic scores used by demo / workspace (Chinese labels). */
export const CRITIC_SCORES: CriticScore[] = [
  { key: '光照', score: 94 },
  { key: '阴影', score: 91 },
  { key: '色彩', score: 95 },
  { key: '边缘', score: 97 },
  { key: '总体', score: 95 },
];

/** Showcase stage canvas layout. */
export const STAGE_MAX_W = 900;
export const STAGE_MIN_W = 760;

/** Subject bounding box in the demo keyframes (ratio of frame). */
export const SUBJECT_BOX = { x: 0.19, y: 0.05, w: 0.4, h: 0.93 };
/** Contact shadow anchor (subject feet position). */
export const SUBJECT_FEET = { x: 0.38, y: 0.965 };

/** Waveform amplitude profile while speaking / final. */
export const WAVE_AMP = [7, 12, 18, 24, 18, 12, 7];
export const WAVE_AMP_FINAL = [4, 7, 10, 13, 10, 7, 4];
