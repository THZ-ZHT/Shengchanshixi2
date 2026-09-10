import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import { parseCommand } from '../../services/commandParser';
import { listen, stopListen, isMicAvailable, onHeard } from '../../services/speech';
import styles from '../../styles/workstation.module.css';

const QUICK_CHIPS = [
  '改成傍晚',
  '光线太冷了',
  '阴影轻一点',
  '边缘延伸一下',
  '光线暗一点',
  '换回原版背景，保留现在的光线',
  '让人物开始呼吸',
];

/** Bottom command bar: chips + chat input + mic + send. */
export default function CommandBar(): JSX.Element {
  const pushMessage = useWorkspaceStore((s) => s.pushMessage);
  const applyAction = useWorkspaceStore((s) => s.applyAction);
  const micAvailable = useAgentStore((s) => s.micAvailable);
  const lowConfidence = useAgentStore((s) => s.lowConfidence);
  const lastHeard = useAgentStore((s) => s.lastHeard);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [fallbackText, setFallbackText] = useState('');
  const histIdx = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isMicAvailable()) useAgentStore.getState().setMicAvailable(false);
    else useAgentStore.getState().setMicAvailable(true);
    onHeard((text, confidence) => {
      if (confidence < 0.6) return; // handled by confirm bar
      void runCommand(text);
    });
    return () => onHeard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCommand = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setHistory((h) => (h[h.length - 1] === text ? h : [...h, text]));
    histIdx.current = -1;
    const s = useWorkspaceStore.getState();
    s.pushMessage({ role: 'user', text });
    const { action, reply } = parseCommand(text);
    window.setTimeout(() => {
      useWorkspaceStore.getState().pushMessage({ role: 'agent', text: reply });
    }, 280);
    await applyAction(action);
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void runCommand(text);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (history.length === 0) return;
      e.preventDefault();
      let idx = histIdx.current;
      if (e.key === 'ArrowUp') idx = idx < 0 ? history.length - 1 : Math.max(0, idx - 1);
      else idx = idx < 0 ? -1 : idx + 1 >= history.length ? -1 : idx + 1;
      histIdx.current = idx;
      setInput(idx < 0 ? '' : history[idx]);
    }
  };

  return (
    <div className={styles.wsCommand}>
      {lowConfidence && (
        <div className={styles.wsConfirm} style={{ margin: 0 }}>
          <span>识别到：「{lastHeard}」置信度较低。</span>
          <input
            type="text"
            className={styles.wsConfirmInput}
            placeholder="可直接修改识别文本"
            value={fallbackText || lastHeard}
            onChange={(e) => setFallbackText(e.target.value)}
          />
          <button
            className={styles.wsConfirmBtn}
            onClick={() => {
              const text = (fallbackText || lastHeard).trim();
              useAgentStore.getState().setLowConfidence(false);
              setFallbackText('');
              if (text) void runCommand(text);
            }}
          >
            确认
          </button>
          <button
            className={styles.wsConfirmBtn}
            onClick={() => {
              useAgentStore.getState().setLowConfidence(false);
              setFallbackText('');
              stopListen();
              listen();
            }}
          >
            重新说
          </button>
        </div>
      )}
      <div className={styles.wsCommandChips}>
        <span className={styles.wsCommandChipsLabel}>快捷指令</span>
        {QUICK_CHIPS.map((c) => (
          <button key={c} className={styles.wsChip} onClick={() => void runCommand(c)} title={c}>
            {c}
          </button>
        ))}
      </div>
      <div className={styles.wsInputRow}>
        <svg className={styles.wsInputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M21 12a8 8 0 0 1-8 8M3 12a8 8 0 0 1 8-8M21 12c0 4.418-4.03 8-9 8s-9-3.582-9-8M3 12c0-4.418 4.03-8 9-8s9 3.582 9 8" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className={styles.wsInput}
          placeholder="对 AI 助手说点什么，如「改成傍晚」「光线暗一点」…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          className={`${styles.wsMic} ${micAvailable ? '' : styles.wsMic}`}
          disabled={!micAvailable}
          title={micAvailable ? '按下说话' : '当前浏览器不支持语音识别'}
          onClick={() => {
            useAgentStore.getState().setVoice('listening');
            listen();
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        </button>
        <button className={styles.wsSend} onClick={send} disabled={!input.trim()}>
          发送
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
