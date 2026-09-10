import { create } from 'zustand';
import type { VoiceState } from '../types';

function detectMic(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

interface AgentState {
  voiceState: VoiceState;
  narration: string;
  micAvailable: boolean;
  ttsEnabled: boolean;
  lastHeard: string;
  lowConfidence: boolean;
  setVoice: (v: VoiceState) => void;
  setNarration: (t: string) => void;
  setMicAvailable: (b: boolean) => void;
  setTtsEnabled: (b: boolean) => void;
  setLastHeard: (t: string) => void;
  setLowConfidence: (b: boolean) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  voiceState: 'listening',
  narration: '上传或拖动画面，我来完成合成。',
  micAvailable: detectMic(),
  ttsEnabled: true,
  lastHeard: '',
  lowConfidence: false,
  setVoice: (voiceState) => set({ voiceState }),
  setNarration: (narration) => set({ narration }),
  setMicAvailable: (micAvailable) => set({ micAvailable }),
  setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
  setLastHeard: (lastHeard) => set({ lastHeard }),
  setLowConfidence: (lowConfidence) => set({ lowConfidence }),
}));
