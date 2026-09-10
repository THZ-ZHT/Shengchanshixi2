import { useAgentStore } from '../store/agentStore';

/* Minimal structural types for the Web Speech API (not in DOM lib). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isMicAvailable(): boolean {
  return getRecognitionCtor() !== null;
}

let simTimer: number | undefined;
let thinkTimer: number | undefined;

/** Simulated speaking window when TTS is unavailable or disabled. */
function simulateSpeaking(text: string): void {
  if (simTimer !== undefined) window.clearTimeout(simTimer);
  useAgentStore.getState().setVoice('speaking');
  const dur = Math.min(3600, Math.max(1800, text.length * 110));
  simTimer = window.setTimeout(() => {
    useAgentStore.getState().setVoice('listening');
  }, dur);
}

/** Speak `text` with zh-CN TTS; silently degrades to a simulated window. */
export function speak(text: string): void {
  const store = useAgentStore.getState();
  if (!store.ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    simulateSpeaking(text);
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1;
    u.onstart = () => useAgentStore.getState().setVoice('speaking');
    u.onend = () => useAgentStore.getState().setVoice('listening');
    u.onerror = () => useAgentStore.getState().setVoice('listening');
    useAgentStore.getState().setVoice('speaking');
    window.speechSynthesis.speak(u);
  } catch {
    simulateSpeaking(text);
  }
}

/** Narrate a line: brief thinking state, then speak. */
export function narrate(text: string): void {
  useAgentStore.getState().setNarration(text);
  if (thinkTimer !== undefined) window.clearTimeout(thinkTimer);
  useAgentStore.getState().setVoice('thinking');
  thinkTimer = window.setTimeout(() => speak(text), 350);
}

let recognition: SpeechRecognitionLike | null = null;
let heardHandler: ((text: string, confidence: number) => void) | null = null;

/** Register the callback fired when a final recognition result arrives. */
export function onHeard(cb: ((text: string, confidence: number) => void) | null): void {
  heardHandler = cb;
}

/** Start one-shot zh-CN recognition. No-op when unavailable. */
export function listen(): void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return;
  try {
    recognition?.abort();
  } catch {
    /* noop */
  }
  const r = new Ctor();
  r.lang = 'zh-CN';
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const res = e.results[e.resultIndex] ?? e.results[0];
    const alt = res?.[0];
    if (!alt) return;
    const confidence = typeof alt.confidence === 'number' ? alt.confidence : 1;
    useAgentStore.getState().setLastHeard(alt.transcript);
    useAgentStore.getState().setLowConfidence(confidence < 0.6);
    heardHandler?.(alt.transcript, confidence);
  };
  r.onend = () => useAgentStore.getState().setVoice('listening');
  r.onerror = () => useAgentStore.getState().setVoice('listening');
  recognition = r;
  try {
    r.start();
  } catch {
    /* already started */
  }
}

export function stopListen(): void {
  try {
    recognition?.stop();
  } catch {
    /* noop */
  }
}
