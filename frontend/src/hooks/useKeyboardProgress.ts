import { useEffect } from 'react';
import { TWEEN, seekProgress } from '../store/compositionStore';
import { STAGES } from '../constants/stages';

/**
 * Keyboard control for the showcase: ArrowLeft/Right nudge progress by 1%,
 * Shift+Arrow jumps to the previous/next stage anchor.
 */
export function useKeyboardProgress(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      if (e.shiftKey) {
        const starts = STAGES.map((s) => s.start);
        starts.push(100);
        const next = starts.find((a) => (dir > 0 ? a > TWEEN.progress + 0.5 : a < TWEEN.progress - 0.5));
        const anchor =
          dir > 0
            ? next ?? 100
            : [...starts].reverse().find((a) => a < TWEEN.progress - 0.5) ?? 0;
        seekProgress(anchor);
      } else {
        seekProgress(TWEEN.progress + dir * 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
