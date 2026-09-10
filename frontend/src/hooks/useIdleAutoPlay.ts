import { useRef } from 'react';
import gsap from 'gsap';
import { TWEEN, prefersReducedMotion } from '../store/compositionStore';
import { useGsapTicker } from './useGsapTicker';

export interface IdleAutoPlayOptions {
  enabled: boolean;
  idleMs?: number;
  duration?: number;
  onComplete?: () => void;
}

/**
 * In Explore mode, after `idleMs` of no input, auto-play progress 0 -> 100.
 * Any user input (seekProgress) immediately kills the autoplay tween.
 */
export function useIdleAutoPlay(opts: IdleAutoPlayOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const playingRef = useRef<gsap.core.Tween | null>(null);
  const lastInputSeen = useRef(0);

  useGsapTicker(() => {
    if (TWEEN.lastInput !== lastInputSeen.current) {
      lastInputSeen.current = TWEEN.lastInput;
      if (playingRef.current) {
        playingRef.current.kill();
        playingRef.current = null;
      }
    }
    const { enabled, idleMs = 5000, duration = 12, onComplete } = optsRef.current;
    if (!enabled || prefersReducedMotion()) return;
    if (playingRef.current) return;
    if (TWEEN.progress >= 99.5) return;
    if (Date.now() - TWEEN.lastInput < idleMs) return;
    playingRef.current = gsap.to(TWEEN, {
      progress: 100,
      duration,
      ease: 'none',
      onComplete: () => {
        playingRef.current = null;
        onComplete?.();
      },
    });
  });
}
