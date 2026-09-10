import { create } from 'zustand';
import gsap from 'gsap';
import type { Mode, ShowcaseStatus, StageId } from '../types';

/**
 * Module-level tween singleton. This is the ONLY source of truth for the
 * showcase progress. All inputs funnel through `seekProgress`, and per-frame
 * renderers read `TWEEN.progress` directly (no React re-renders).
 */
export const TWEEN: { progress: number; lastInput: number } = {
  progress: 0,
  lastInput: 0,
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function killProgressTween(): void {
  gsap.killTweensOf(TWEEN);
}

export function resetProgress(): void {
  killProgressTween();
  TWEEN.progress = 0;
  TWEEN.lastInput = Date.now();
}

/** Seek the progress machine. Every user input goes through here. */
export function seekProgress(target: number): void {
  const t = Math.max(0, Math.min(100, target));
  TWEEN.lastInput = Date.now();
  killProgressTween();
  gsap.to(TWEEN, {
    progress: t,
    duration: prefersReducedMotion() ? 0.01 : 0.3,
    ease: 'power1.out',
    overwrite: true,
  });
}

interface UserImage {
  /** Original user upload (DataURL). */
  original: string;
  /** Background-removed RGBA subject (DataURL). */
  subject: string;
  /** Preview composite: subject pasted over a chosen background. */
  final: string;
  /** Original image intrinsic dimensions (for canvas sizing). */
  width: number;
  height: number;
  /** Original filename for display. */
  name: string;
}

interface CompositionState {
  status: ShowcaseStatus;
  stage: StageId;
  mode: Mode;
  debugVisible: boolean;
  uploadName: string;
  userImage: UserImage | null;
  setStatus: (s: ShowcaseStatus) => void;
  setStage: (s: StageId) => void;
  setMode: (m: Mode) => void;
  toggleDebug: () => void;
  setUploadName: (n: string) => void;
  setUserImage: (img: UserImage | null) => void;
  skipProcessing: () => void;
  resetAll: () => void;
}

export const useCompositionStore = create<CompositionState>((set, get) => ({
  status: 'empty',
  stage: 'UNDERSTAND',
  mode: 'control',
  debugVisible: false,
  uploadName: '',
  userImage: null,
  setStatus: (status) => set({ status }),
  setStage: (stage) => set({ stage }),
  setMode: (mode) => set({ mode }),
  toggleDebug: () => set({ debugVisible: !get().debugVisible }),
  setUploadName: (uploadName) => set({ uploadName }),
  setUserImage: (userImage) => set({ userImage }),
  skipProcessing: () => set({ status: 'interactive' }),
  resetAll: () => {
    resetProgress();
    set({ status: 'empty', stage: 'UNDERSTAND', uploadName: '', userImage: null });
  },
}));
