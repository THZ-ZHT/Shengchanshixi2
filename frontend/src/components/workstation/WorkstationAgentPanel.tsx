import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useCompositionStore } from '../../store/compositionStore';
import { BG_PRESETS, bgPresetById, DEMO } from '../../constants/layout';
import PlanDagCard from '../workspace/PlanDagCard';
import CriticCard from '../workspace/CriticCard';
import styles from '../../styles/workstation.module.css';

type Tab = 'chat' | 'assets' | 'params';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

interface Props {
  onUploadRequest: () => void;
}

/** Right panel with tabs: chat / assets / parameters. */
export default function WorkstationAgentPanel({ onUploadRequest }: Props): JSX.Element {
  const messages = useWorkspaceStore((s) => s.messages);
  const assets = useWorkspaceStore((s) => s.assets);
  const previewAssetId = useWorkspaceStore((s) => s.previewAssetId);
  const setPreviewAsset = useWorkspaceStore((s) => s.setPreviewAsset);
  const params = useWorkspaceStore((s) => s.params);
  const updateParams = useWorkspaceStore((s) => s.updateParams);
  const userImage = useCompositionStore((s) => s.userImage);
  const [tab, setTab] = useState<Tab>('chat');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const source = assets.find((a) => a.kind === 'source');
  const backgrounds = assets.filter((a) => a.kind === 'background');
  const masks = assets.filter((a) => a.kind === 'mask');
  const results = assets.filter((a) => a.kind === 'result');

  return (
    <aside className={styles.wsRight}>
      <div className={styles.wsRightTabs}>
        <button
          className={`${styles.wsRightTab} ${tab === 'chat' ? styles.wsRightTabActive : ''}`}
          onClick={() => setTab('chat')}
        >
          💬 对话
          {messages.length > 0 && (
            <span style={{ marginLeft: 6, color: 'var(--ink-3)', fontSize: 10 }}>{messages.length}</span>
          )}
        </button>
        <button
          className={`${styles.wsRightTab} ${tab === 'assets' ? styles.wsRightTabActive : ''}`}
          onClick={() => setTab('assets')}
        >
          🗂 资产
        </button>
        <button
          className={`${styles.wsRightTab} ${tab === 'params' ? styles.wsRightTabActive : ''}`}
          onClick={() => setTab('params')}
        >
          ⚙ 参数
        </button>
      </div>
      <div className={styles.wsRightBody}>
        {tab === 'chat' && (
          <div ref={listRef} className={styles.wsChatList}>
            {messages.length === 0 && (
              <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>Agent 就绪 · 在底部输入框说话或选快捷指令。</div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.wsMsgRow} ${m.role === 'user' ? styles.wsMsgUser : styles.wsMsgAgent}`}
              >
                <div className={m.role === 'user' ? styles.wsBubbleUser : styles.wsBubbleAgent}>
                  {m.text}
                  {m.plan && <PlanDagCard plan={m.plan} />}
                  {m.critic && <CriticCard critic={m.critic} />}
                  <span className={styles.wsMsgTime}>{fmtTime(m.ts)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'assets' && (
          <div className={styles.wsAssetList}>
            <div className={styles.wsAssetSection}>
              <div className={styles.wsAssetSectionTitle}>上传素材</div>
              <button className={styles.wsUploadBtn} onClick={onUploadRequest} style={{ width: '100%' }}>
                {userImage ? `更换原图（${userImage.name}）` : '上传原图开始'}
              </button>
              {userImage && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-2)' }}>
                  {userImage.width} × {userImage.height} · 已自动抠图
                </div>
              )}
            </div>

            <div className={styles.wsAssetSection}>
              <div className={styles.wsAssetSectionTitle}>原图 / 主体</div>
              <div className={styles.wsAssetGrid}>
                {source && (
                  <div
                    className={`${styles.wsAssetThumbWrap} ${
                      previewAssetId === source.id ? styles.wsAssetThumbActive : ''
                    }`}
                    onClick={() => setPreviewAsset(source.id)}
                  >
                    <img className={styles.wsAssetThumb} src={source.src ?? DEMO.grayCity} alt={source.label} />
                    <div className={styles.wsAssetLabel}>{source.label}</div>
                  </div>
                )}
                {masks.map((m) => (
                  <div
                    key={m.id}
                    className={`${styles.wsAssetThumbWrap} ${
                      previewAssetId === m.id ? styles.wsAssetThumbActive : ''
                    }`}
                    onClick={() => setPreviewAsset(m.id)}
                  >
                    <img className={styles.wsAssetThumb} src={m.src ?? DEMO.subject} alt={m.label} />
                    <div className={styles.wsAssetLabel}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.wsAssetSection}>
              <div className={styles.wsAssetSectionTitle}>背景预设</div>
              <div className={styles.wsPresetGrid}>
                {BG_PRESETS.map((p) => {
                  const isActive = backgrounds.find((b) => b.meta?.preset === p.id);
                  return (
                    <div
                      key={p.id}
                      className={`${styles.wsPresetCard} ${
                        isActive ? styles.wsPresetCardActive : ''
                      }`}
                      onClick={() => useWorkspaceStore.getState().updateParams({ bgPreset: p.id })}
                    >
                      <img className={styles.wsPresetImg} src={p.src} alt={p.label} />
                      <div className={styles.wsPresetLabel}>{p.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {results.length > 0 && (
              <div className={styles.wsAssetSection}>
                <div className={styles.wsAssetSectionTitle}>合成结果（{results.length}）</div>
                <div className={styles.wsAssetGrid}>
                  {results
                    .slice()
                    .reverse()
                    .map((r) => (
                      <div
                        key={r.id}
                        className={`${styles.wsAssetThumbWrap} ${
                          previewAssetId === r.id ? styles.wsAssetThumbActive : ''
                        }`}
                        onClick={() => setPreviewAsset(r.id)}
                      >
                        <img className={styles.wsAssetThumb} src={r.src} alt={r.label} />
                        <div className={styles.wsAssetLabel}>{r.label}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === 'params' && (
          <div className={styles.wsAssetList}>
            <div className={styles.wsAssetSection}>
              <div className={styles.wsAssetSectionTitle}>合成参数</div>
              <ParamRow
                label="背景预设"
                value={bgPresetById(params.bgPreset).label}
                onChange={(v) => useWorkspaceStore.getState().updateParams({ bgPreset: v })}
                options={BG_PRESETS.map((p) => ({ v: p.id, label: p.label }))}
              />
              <ParamRow
                label="色温 (K)"
                value={String(params.tempK)}
                onChange={(v) => useWorkspaceStore.getState().updateParams({ tempK: Number(v) })}
                options={[
                  { v: '3200', label: '3200 暖黄' },
                  { v: '4800', label: '4800 正午' },
                  { v: '5600', label: '5600 日光' },
                  { v: '6500', label: '6500 冷白' },
                ]}
              />
              <ParamRange
                label="阴影强度"
                value={params.shadowIntensity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateParams({ shadowIntensity: v })}
              />
              <ParamRange
                label="色彩和谐度"
                value={params.harmonizeStrength}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateParams({ harmonizeStrength: v })}
              />
              <ParamRange
                label="曝光"
                value={params.exposure}
                min={0.4}
                max={1.6}
                step={0.05}
                onChange={(v) => updateParams({ exposure: v })}
              />
              <ParamRange
                label="边缘羽化"
                value={params.edgeFeather}
                min={0}
                max={6}
                step={0.5}
                onChange={(v) => updateParams({ edgeFeather: v })}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

interface ParamRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
}

function ParamRow({ label, value, onChange, options }: ParamRowProps): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{ width: 80, fontSize: 12, color: 'var(--ink-2)' }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: '5px 10px',
          borderRadius: 999,
          border: '1px solid var(--border-soft)',
          background: 'var(--surface)',
          fontSize: 12,
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ParamRangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function ParamRange({ label, value, min, max, step, onChange }: ParamRangeProps): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{ width: 80, fontSize: 12, color: 'var(--ink-2)' }}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <div style={{ width: 44, textAlign: 'right', fontSize: 11, color: 'var(--green-d)', fontVariantNumeric: 'tabular-nums' }}>
        {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}
      </div>
    </div>
  );
}
