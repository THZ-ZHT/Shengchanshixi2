import type { ParsedAction, SubjectAnimation } from '../types';
import { bgPresetById } from '../constants/layout';

export interface ParseResult {
  action: ParsedAction;
  reply: string;
}

/** Match if any keyword in `candidates` appears as a substring in `text`. */
function has(text: string, candidates: string[]): boolean {
  return candidates.some((c) => text.includes(c));
}

/** Extract first integer (used for explicit Kelvin / percentage values). */
function firstNumber(text: string): number | null {
  const m = text.match(/(\d{3,5})/);
  return m ? parseInt(m[1], 10) : null;
}

function bgResult(presetId: string): ParseResult {
  const preset = bgPresetById(presetId);
  return {
    action: { type: 'switch_bg', preset: preset.id },
    reply: `好的，已把背景换成「${preset.label}」，正在重跑下游节点。`,
  };
}

function lightKelvinResult(k: number): ParseResult {
  const temp = Math.max(3000, Math.min(7500, k));
  return {
    action: { type: 'light_kelvin', tempK: temp },
    reply: `好的，我把色温调到 ${temp}K，正在重新打光。`,
  };
}

function harmonizeResult(strength: number): ParseResult {
  const s = Math.max(0, Math.min(1, strength));
  const label = s >= 0.7 ? '强' : s >= 0.4 ? '中' : '弱';
  return {
    action: { type: 'harmonize', strength: s },
    reply: `好的，色彩和谐化已设为「${label}」（${(s * 100).toFixed(0)}%），正在重跑下游。`,
  };
}

function animateResult(style: SubjectAnimation): ParseResult {
  const labels: Record<SubjectAnimation, string> = {
    none: '静态',
    float: '浮动',
    breathe: '呼吸',
    pulse: '脉动',
    spin: '旋转',
    walk: '行走',
    swing: '摆动',
  };
  return {
    action: { type: 'animate', style },
    reply: `好的，主体已切换为「${labels[style]}」动画。`,
  };
}

function customBgResult(prompt: string): ParseResult {
  return {
    action: { type: 'custom_bg', prompt },
    reply: `好的，正在按「${prompt}」生成专属背景。`,
  };
}

function exposureResult(value: number, label: string): ParseResult {
  const v = Math.max(0.5, Math.min(1.5, value));
  return {
    action: { type: 'exposure', value: v },
    reply: `好的，整体曝光已${label === '加亮' ? '加亮' : '压暗'}到 ${(v * 100).toFixed(0)}%，正在重新合成。`,
  };
}

function edgeFeatherResult(value: number, label: string): ParseResult {
  const v = Math.max(0, Math.min(8, value));
  return {
    action: { type: 'edge_feather', value: v },
    reply: `好的，主体边缘已调整为「${label}」（羽化半径 ${v.toFixed(1)}px），正在重新合成。`,
  };
}

/** Background keyword → preset id lookup (extended lexicon). */
const BG_KEYWORDS: Array<{ preset: string; keys: string[] }> = [
  { preset: 'bg_lake', keys: ['湖', '傍晚', '夕阳', '黄昏', '落日', '晚霞', '水边', '海边'] },
  { preset: 'bg_cafe', keys: ['咖啡', 'cafe', '咖啡馆', '室内', '暖色'] },
  { preset: 'bg_city', keys: ['城市', '街景', '街', '夜', '都市', '霓虹'] },
  { preset: 'bg_forest', keys: ['森林', '树', '林', '绿', '自然'] },
];

function detectBackground(text: string): string | null {
  for (const entry of BG_KEYWORDS) {
    if (has(text, entry.keys)) return entry.preset;
  }
  return null;
}

const ANIMATE_KEYWORDS: Array<{ style: SubjectAnimation; keys: string[] }> = [
  { style: 'float', keys: ['浮', '漂', '上下动', '轻一点', '轻轻'] },
  { style: 'breathe', keys: ['呼吸', '缓慢动', '自然一点', '轻微动'] },
  { style: 'pulse', keys: ['脉', '鼓', '心跳', '明显', '夸张'] },
  { style: 'spin', keys: ['转', '旋转', '旋转一下', '自转'] },
  { style: 'walk', keys: ['走', '行走', '动起来', '跑步'] },
  { style: 'swing', keys: ['摆', '挥手', '晃动', '摇'] },
  { style: 'none', keys: ['停', '静止', '不要动', '别动'] },
];

function detectAnimation(text: string): SubjectAnimation | null {
  for (const entry of ANIMATE_KEYWORDS) {
    if (has(text, entry.keys)) return entry.style;
  }
  return null;
}

/** Tokenize a command by Chinese comma/period/and to enable multi-intent splitting. */
function splitCommands(text: string): string[] {
  return text
    .split(/[，。、；,;\n]+|(?=并且|然后|接着|同时)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Natural-language command parser. Tries intents in priority order and
 * supports multi-intent commands ("把背景换成傍晚，并且让人物轻轻浮动").
 */
export function parseCommand(raw: string): ParseResult {
  const text = raw.trim();
  if (!text) return { action: { type: 'unknown', raw: text }, reply: '请输入或说出一条指令。' };

  // ---- single-intent fast paths ----
  // rollback must beat bg detection: "换回上一版背景" also contains 背景.
  if (has(text, ['换回', '上一版', '之前', '回到上', '回滚'])) {
    return {
      action: { type: 'rollback', nodeId: 'n2', keepLight: true },
      reply: '好的，已换回上一版背景，并保留当前光线，正在重跑下游节点。',
    };
  }

  // Combined animate + background: "让人物轻轻浮动，并且把背景换成傍晚"
  const animStyle = detectAnimation(text);
  const bgPreset = detectBackground(text);
  if (animStyle && bgPreset) {
    const { action, reply } = animateResult(animStyle);
    const { action: bgAction, reply: bgReply } = bgResult(bgPreset);
    return {
      action: { type: 'multi', actions: [action, bgAction], reply: reply + ' ' + bgReply },
      reply: reply + ' ' + bgReply,
    };
  }

  // Preset backgrounds must be detected BEFORE the custom_bg fast path:
  // commands like "把背景换成咖啡馆" contain both "换成" + "背景" (which would
  // otherwise trigger custom_bg) and a preset keyword ("咖啡"). The preset
  // wins because it's a deterministic, immediately renderable background.
  if (bgPreset) return bgResult(bgPreset);

  // explicit background description → custom generation. Skip if a preset
  // keyword is also present so we don't downgrade "想要一片傍晚湖边" into
  // a no-op custom prompt.
  if (
    has(text, ['生成', '来一张', '给我', '想要', '换成']) &&
    has(text, ['背景', '场景']) &&
    !bgPreset
  ) {
    const bgIdx = Math.max(text.indexOf('背景'), text.indexOf('场景'));
    const prompt = text.slice(0, bgIdx >= 0 ? bgIdx : text.length).replace(/^(生成|来一张|给我|想要|换成)/, '').trim() || text;
    if (prompt.length > 0 && prompt.length < 60) return customBgResult(prompt);
  }

  // animation request (e.g. "让人物浮动", "加个旋转").
  if (has(text, ['动画', '动起来', '加特效', '添加特效', '让', '使人']) && has(text, ['人物', '主体', '人', '他', '她'])) {
    const anim = detectAnimation(text);
    if (anim) return animateResult(anim);
  }

  // shadow intensity (light/heavy).
  if (has(text, ['阴影'])) {
    if (has(text, ['轻', '淡', '少', '小', '弱', '没'])) {
      return {
        action: { type: 'shadow', intensity: 0.2 },
        reply: '好的，接触阴影已减轻到 20%，正在重新合成。',
      };
    }
    if (has(text, ['重', '强', '深', '浓', '明显', '大'])) {
      return {
        action: { type: 'shadow', intensity: 0.6 },
        reply: '好的，接触阴影已加重到 60%，正在重新合成。',
      };
    }
  }

  // harmonize / color tone.
  if (has(text, ['和谐', '统一色调', '色调', '滤镜', '调色', '电影感', '氛围', '质感'])) {
    if (has(text, ['弱', '轻', '淡', '小', '少', '自然'])) return harmonizeResult(0.25);
    if (has(text, ['强', '重', '深', '明显', '戏剧', '夸张', '浓'])) return harmonizeResult(0.85);
    const explicit = firstNumber(text);
    if (explicit && explicit <= 100) return harmonizeResult(explicit / 100);
    return harmonizeResult(0.7);
  }

  // brightness / exposure. Understands colloquial phrases like
  // "光线暗一点", "太亮了", "曝光低一点".
  if (has(text, ['光线', '亮度', '明暗', '曝光']) || has(text, ['暗', '亮', '黑', '白'])) {
    // explicit percent? e.g. "亮度 80"
    const explicit = firstNumber(text);
    if (explicit && explicit >= 30 && explicit <= 180) {
      return exposureResult(explicit / 100, explicit >= 100 ? '加亮' : '压暗');
    }
    const tooBright = has(text, ['太亮', '过曝', '曝光过度', '太白', '过亮', '刺眼', '亮过头']);
    const tooDark = has(text, ['太暗', '欠曝', '曝光不足', '太黑', '过暗', '暗过头']);
    const wantBright = has(text, ['亮一点', '亮一些', '加亮', '提亮', '变亮', '亮起来']) || tooBright;
    const wantDark = has(text, ['暗一点', '暗一些', '压暗', '变暗', '暗下去', '暗下来']) || tooDark;
    if (wantBright && wantDark) {
      // contradictory, but "太亮了" + "暗一点" counts as dark
    }
    if (wantBright && !wantDark) {
      const bigStep = tooBright ? 0.25 : has(text, ['很多', '不少', '大幅']) ? 0.2 : 0.12;
      return exposureResult(1 + bigStep, '加亮');
    }
    if (wantDark && !wantBright) {
      const bigStep = tooDark ? 0.25 : has(text, ['很多', '不少', '大幅']) ? 0.2 : 0.12;
      return exposureResult(1 - bigStep, '压暗');
    }
  }

  // edge feather / outpainting-style adaptation. Front-end demo version:
  // controls a feathering radius + slight subject scaling so the cut-out blends
  // into the background rather than looking like a hard paper cut-out.
  if (has(text, ['延伸', '补全', '补齐', '适配', '融合', '羽化', '边缘', '生硬', '贴图', '贴纸'])) {
    if (has(text, ['不要', '取消', '去掉', '硬边', '锐化', '清晰', '收缩', '收紧'])) {
      return edgeFeatherResult(0, '硬边');
    }
    const more = has(text, ['多', '加强', '加深', '大幅']);
    const less = has(text, ['少', '轻', '弱', '淡', '一点', '一些']);
    if (less && !more) return edgeFeatherResult(1, '轻微羽化');
    if (more) return edgeFeatherResult(4, '强羽化');
    return edgeFeatherResult(2.5, '自然羽化');
  }

  // warm / cool.
  if (has(text, ['暖', '太冷', '黄', '温暖'])) {
    const explicit = firstNumber(text);
    return explicit && explicit >= 3000 && explicit <= 7500
      ? lightKelvinResult(explicit)
      : { action: { type: 'light_warm' }, reply: '好的，我把色温调暖到 5200K，正在重新打光。' };
  }
  if (has(text, ['冷', '蓝', '太暖', '清凉'])) {
    const explicit = firstNumber(text);
    return explicit && explicit >= 3000 && explicit <= 7500
      ? lightKelvinResult(explicit)
      : { action: { type: 'light_cool' }, reply: '好的，我把色温调冷到 4200K，正在重新打光。' };
  }

  // explicit Kelvin value (e.g. "色温 5500").
  if (has(text, ['色温', 'K ', ' K']) || /[三四五六七八九]千K/.test(text)) {
    const k = firstNumber(text);
    if (k && k >= 3000 && k <= 7500) return lightKelvinResult(k);
  }

  // ---- multi-intent fallback ----
  const parts = splitCommands(text);
  if (parts.length > 1) {
    const sub: ParsedAction[] = [];
    const replies: string[] = [];
    for (const p of parts) {
      const r = parseCommand(p);
      if (r.action.type !== 'unknown') sub.push(r.action);
      replies.push(r.reply);
    }
    if (sub.length > 1) {
      return {
        action: { type: 'multi', actions: sub, reply: replies.join(' ') },
        reply: replies.join(' '),
      };
    }
  }

  return {
    action: { type: 'unknown', raw: text },
    reply: '这条指令我还没完全理解，可以试试下方的快捷指令。',
  };
}