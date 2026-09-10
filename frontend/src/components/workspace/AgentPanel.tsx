import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import { parseCommand } from '../../services/commandParser';
import { listen, stopListen, isMicAvailable, onHeard } from '../../services/speech';
import PlanDagCard from './PlanDagCard';
import CriticCard from './CriticCard';
import styles from '../../styles/workspace.module.css';

const QUICK_CHIPS = [
  '改成傍晚',
  '光线太冷了',
  '阴影轻一点',
  '换回上一版背景，保留现在的光线',
];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** Right column: agent message stream + voice/text input. */
export default function AgentPanel(): JSX.Element {
  const messages = useWorkspaceStore((s) => s.messages);
  const pushMessage = useWorkspaceStore((s) => s.pushMessage);
  const applyAction = useWorkspaceStore((s) => s.applyAction);
  const lowConfidence = useAgentStore((s) => s.lowConfidence);
  const lastHeard = useAgentStore((s) => s.lastHeard);
  const micAvailable = useAgentStore((s) => s.micAvailable);
  const [input, setInput] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const histIdx = useRef(-1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!isMicAvailable()) useAgentStore.getState().setMicAvailable(false);
    else useAgentStore.getState().setMicAvailable(true);
    // heard results: low confidence -> confirm bar; otherwise run directly
    onHeard((text, confidence) => {
      if (confidence < 0.6) return; // confirm bar handles it
      void runCommand(text);
    });
    return () => onHeard(null);
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
    }, 350);
    await applyAction(action);
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void runCommand(text);
  };

  const micDisabled = !micAvailable;

  return (
    <section className={styles.agentPanel}>
      <div ref={listRef} className={styles.msgList}>
        {messages.map((m) => (
          <div key={m.id} className={`${styles.msgRow} ${m.role === 'user' ? styles.msgUser : styles.msgAgent}`}>
            <div className={m.role === 'user' ? styles.bubbleUser : styles.bubbleAgent}>
              {m.text}
              {m.plan && <PlanDagCard plan={m.plan} />}
              {m.critic && <CriticCard critic={m.critic} />}
              <span className={styles.msgTime}>{fmtTime(m.ts)}</span>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>
            Agent 就绪 · 试试语音或下方的快捷指令。
          </div>
        )}
      </div>

      {lowConfidence && (
        <div className={styles.confirmBar}>
          <span>识别到：「{lastHeard}」，置信度较低。</span>
          <input
            type="text"
            className={styles.promptInput}
            style={{ flex: 1, minWidth: 100 }}
            placeholder="可直接修改识别文本"
            value={fallbackText || lastHeard}
            onChange={(e) => setFallbackText(e.target.value)}
          />
          <button
            className={styles.confirmBtn}
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
            className={styles.confirmBtn}
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

      <div className={styles.inputArea}>
        <div className={styles.chipRow}>
          {QUICK_CHIPS.map((c) => (
            <button key={c} className={styles.chip} onClick={() => void runCommand(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className={styles.inputRow}>
          <input
            type="text"
            className={styles.textInput}
            placeholder="输入指令，如「改成傍晚」…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                send();
                return;
              }
              // ↑ / ↓ browse sent commands
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                if (history.length === 0) return;
                e.preventDefault();
                let idx = histIdx.current;
                if (e.key === 'ArrowUp') {
                  idx = idx < 0 ? history.length - 1 : Math.max(0, idx - 1);
                } else {
                  idx = idx < 0 ? -1 : idx + 1 >= history.length ? -1 : idx + 1;
                }
                histIdx.current = idx;
                setInput(idx < 0 ? '' : history[idx]);
              }
            }}
          />
          <button
            className={`${styles.iconBtn} ${micDisabled ? styles.iconBtnDisabled : ''}`}
            disabled={micDisabled}
            title={micDisabled ? '当前浏览器不支持语音识别' : '按下说话'}
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
          <button className={styles.sendBtn} onClick={send}>
            发送
          </button>
        </div>
      </div>
    </section>
  );
}
