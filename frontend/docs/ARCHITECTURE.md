# ImageCompose 前端系统架构设计与任务分解（Bob / 高见远）

> 关键取舍：React 只负责"结构性 UI"，所有 60fps 数值（progress、光效偏移、阴影、波形振幅）由 GSAP ticker + 单 rAF 循环直读，**不经 setState**；React state 只存离散值（stage、mode、DAG 节点状态、消息列表）。

---

## 1. 实现方案

### 1.1 分层架构

```
pages/        路由页壳：ShowcasePage / ResearchPage / WorkspacePage
components/   纯 UI 组件（showcase/ workspace/ 两组），只订阅离散 store 值
store/        Zustand：compositionStore（progress 机器）、workspaceStore（DAG/版本/资产）、agentStore（语音三态/TTS/麦克风）
engine/       本地合成引擎：offscreen canvas 管线（抠图→棋盘格→背景合成→光效→阴影→色彩和谐化），产出各阶段图层 canvas
services/     orchestrator（本地 DAG 编排器）、commandParser（指令解析）、speech（TTS/麦克风封装，降级安全）、export（PNG/JPG+元数据）
hooks/        useGsapTicker（渲染循环）、useKeyboardProgress、useIdleAutoPlay、useReducedMotion
constants/    stages.ts（区间+文案表）、dag.ts（节点表+指令映射）、layout.ts（尺寸/时长/光效常量）
types/        全部 TS 接口
```

### 1.2 路由设计

- `/` Showcase、`/research` Research、`/workspace` Workspace，react-router-dom v6 `createBrowserRouter` + `RouterProvider`。
- `/workspace` 由 Showcase Final 态按钮与导航进入；从 workspace 顶部返回按钮回 `/`。
- Research 纯静态，`React.lazy` 懒加载（次优先级）。

### 1.3 状态管理方案（store 切片 + 绕过 React 的值）

| store | 离散值（走 React） | 连续值（绕过 React） |
|---|---|---|
| compositionStore | stage, status(四态), mode, debugVisible, uploadFileName, stepsDone[5] | `progress`（存模块级 proxy 对象，GSAP 补间它；store 只在 stage 变化时写入离散 stage） |
| workspaceStore | assets[], versions{}, dagNodes[{status}], agentMessages[], activeNodeId, canvasResult | 无（节点时延由 orchestrator setTimeout 推进离散状态） |
| agentStore | voiceState(listening/thinking/speaking), narrationIndex, micAvailable | `waveAmplitudes[7]`（Speaking 时由 rAF 直写 DOM 高度，不进 store） |

- **progress 唯一数据源**：`const tweened = { progress: 0 }` 模块级单例（`store/tweenProxy.ts` 纳入 compositionStore 同文件导出）。所有输入（拖动/滚轮/触摸/键盘/自动播放）只调用 `seekProgress(target)` → `gsap.to(tweened, { progress, duration, ease:'none'|'power1.out', overwrite:true })`。
- stage 由 `getStage(progress)` 纯函数区间推导；GSAP onUpdate 中检测 stage 跨界才 `setStage()`（离散更新）。

### 1.4 动画实现策略

- **GSAP ticker + 单 rAF**：ShowcaseCanvas 内一个 rAF 循环直读 `tweened.progress`，按区间计算各层 opacity/transform，直接写 canvas 绘制与 DOM style（光效 div、阴影椭圆、color-grade overlay 的 `style.filter`）。FPS 由循环内统计供 Debug Overlay。
- **GSAP 补间**：Morph（上传卡→中央画布 400–800ms）、Final 数字滚动（800–1200ms）、面板出入场（180–240ms）、波形（300–500ms）。
- **CSS transition**：hover、chips、按钮、tooltip 等静态交互；棋盘格用 CSS `background-image: conic-gradient` 实现。
- **prefers-reduced-motion**：useReducedMotion 返回 true 时 GSAP duration 全部置 0、自动播放关闭、波形静止。

### 1.5 性能要点

- 关键帧图片在 Processing 态统一 `new Image()` 预加载（Promise.all），完成后才允许进入 Interactive。
- 1536×854 源图绘制到 900×480 画布时预降采样缓存一次（`drawImage` 一次到 offscreen），逐帧只做合成不重复缩放。
- 光效 4 层用 DOM div + CSS 渐变（合成器层），不重绘 canvas；阴影椭圆一个 div；color-grade 一个 overlay div `filter` 插值。
- 画布 `will-change: transform`，rAF 循环中避免字符串拼接 className。

---

## 2. 文件清单（43 个，全 ASCII 文件名）

```
src/
  main.tsx                        # 已有：入口，挂 RouterProvider
  App.tsx                         # 路由表 + 全局布局壳
  styles/global.css               # CSS 变量(色板/时长)、reset、reduced-motion 媒体查询
  types/index.ts                  # 全部 TS 接口（见 §3）
  constants/stages.ts             # 7 阶段区间表 + 解说文案表 + FINAL 文案
  constants/dag.ts                # DAG 节点定义表 + 快捷指令映射表
  constants/layout.ts             # 画布尺寸(900x480/源1536x854)、光效常量(212°/4800K/72%)、动画时长表
  store/compositionStore.ts       # 四态状态机 + progress proxy + seek/输入动作 + debug
  store/workspaceStore.ts         # assets/versions/dagNodes/messages/activeNode + CRUD 动作
  store/agentStore.ts             # voiceState/narrationIndex/micAvailable
  engine/composeEngine.ts         # 本地合成管线：上传图→显著性抠图→matte→各阶段层产出
  engine/layers.ts                # 各阶段图层绘制：背景淡出/主体drop-shadow/光效/接触阴影/color-grade
  engine/heightmap.ts             # 主体图→亮度+mask→heightmap→Three.js displaced plane
  services/orchestrator.ts        # 本地 DAG 编排器：顺序执行+600–1500ms 时延+状态回调；env 切真实 API
  services/commandParser.ts       # 多轮指令解析：关键词→Action（含条件回滚解析）
  services/export.ts              # PNG/JPG 导出(1024/2048) + 元数据 JSON 生成
  services/speech.ts              # TTS(speechSynthesis) + 麦克风(Web Audio AnalyserNode)，降级安全
  hooks/useGsapTicker.ts          # 注册单例渲染循环（同帧去重）
  hooks/useKeyboardProgress.ts    # ←/→ 1%、Shift 跳阶段、反引号 Debug
  hooks/useIdleAutoPlay.ts        # Explore 模式 5s 无操作自动播放
  hooks/useReducedMotion.ts       # 媒体查询订阅
  components/showcase/ShowcaseCanvas.tsx     # 900×480 图层合成画布 + rAF 渲染
  components/showcase/CompositionSlider.tsx  # 底部轨道+填充+手柄+百分比（拖/滚轮/触摸）
  components/showcase/StageIndicators.tsx    # 7 阶段指示器（可点吸附）
  components/showcase/AgentVoice.tsx         # 三态语音存在容器 + 解说文案切换
  components/showcase/Waveform.tsx           # 呼吸●/虚线环/7 条波形（振幅表）
  components/showcase/ProcessingOverlay.tsx  # 扫描线+进度条(82% Preparing…)+5 步步骤条+跳过
  components/showcase/UploadCard.tsx         # 上传卡 + Morph 至中央画布
  components/showcase/FinalPanel.tsx         # AI CHECK 五维数字滚动 + 进入工作台/重新体验
  components/showcase/DebugOverlay.tsx       # Progress/Stage/FPS 浮层
  components/workspace/AssetsPanel.tsx       # 三栏之左：原图/Mask/背景/结果缩略图 + AI 生图/建模双 Tab
  components/workspace/CanvasPanel.tsx       # 三栏之中：结果大图+原图对比+导出按钮
  components/workspace/AgentPanel.tsx        # 三栏之右：对话流+输入框+麦克风+4 chips
  components/workspace/PlanDagCard.tsx       # Agent 消息中的 Plan DAG 卡
  components/workspace/CriticCard.tsx        # 五维评分卡
  components/workspace/ExecutionDag.tsx      # 底部 DAG 容器（连线+布局）
  components/workspace/DagNode.tsx           # 单节点（状态色/点击选看产物）
  components/workspace/ImageGenPanel.tsx     # 4 背景预设 + prompt → 本地合成引擎
  components/workspace/ModelGenPanel.tsx     # Three.js 3D 预览（GLB 预置 + heightmap 生成）
  pages/ShowcasePage.tsx           # 四态状态机编排 + 组装 showcase 组件
  pages/ResearchPage.tsx           # 静态研究页（懒加载）
  pages/WorkspacePage.tsx          # 三栏+底部 DAG 布局 + orchestrator 装配
public/assets/demo|bg|models/     # 资产契约已就绪，按路径加载，不新建
```

---

## 3. 核心数据结构（types/index.ts）

```ts
export type ShowcaseStatus = 'empty' | 'processing' | 'interactive' | 'final';
export type StageId = 'UNDERSTAND'|'EXTRACT'|'COMPOSE'|'ILLUMINATE'|'GROUND'|'HARMONIZE'|'CRITIC';
export type Mode = 'explore' | 'control' | 'create';
export type VoiceState = 'listening' | 'thinking' | 'speaking';
export type DagStatus = 'pending' | 'running' | 'done' | 'failed';

export interface StageDef { id: StageId; start: number; end: number; narration: string; }

export interface CompositionState {
  status: ShowcaseStatus; stage: StageId; mode: Mode;
  debugVisible: boolean; autoPlay: boolean; uploadName: string | null;
  stepsDone: boolean[];            // Processing 5 步
  seekProgress(t: number, opts?: { instant?: boolean }): void; // 唯一进度入口
  setStatus(s: ShowcaseStatus): void; setStage(s: StageId): void;
  setMode(m: Mode): void; toggleDebug(): void; skipProcessing(): void;
}

export interface AgentState {
  voiceState: VoiceState; narration: string; micAvailable: boolean;
  ttsEnabled: boolean; lastHeard: string | null; lowConfidence: boolean;
  setVoice(v: VoiceState): void; setNarration(n: string): void;
}

export interface DagNode {
  id: string;                     // 'n1'..'n7'
  name: string;                   // 'matting' | 'background_generate' | ...
  status: DagStatus;
  versionId: string | null;       // 当前生效版本
  artifactKey: string | null;     // 指向 versions 产物的 key
}

export interface NodeVersion {
  versionId: string;              // 'n2-V1' / 'n2-V2'
  nodeId: string;
  params: Record<string, number | string>;   // 如 { bgPreset:'bg_cafe', temp:4800, shadow:0.35 }
  assetIds: string[];             // 产出的中间产物资产
  createdAt: number;
}

export interface Asset {
  id: string; kind: 'source'|'mask'|'background'|'result'|'model';
  label: string; src?: string;    // 缩略图/大图 URL
  canvas?: HTMLCanvasElement;     // 引擎本地产物的像素引用（不落盘）
  meta?: Record<string, string | number>;
  createdAt: number;
}

export interface AgentMessage {
  id: string; role: 'user' | 'agent';
  text: string;                   // "你说了什么 / AI 在做什么"
  plan?: DagNode[];               // Plan DAG 卡
  critic?: { key: string; score: number }[];  // 五维卡
  ts: number;
}

export interface WorkspaceState {
  assets: Asset[]; versions: Record<string, NodeVersion[]>;
  dagNodes: DagNode[]; messages: AgentMessage[];
  activeNodeId: string | null; canvasResultAssetId: string | null;
  addAsset(a: Asset): void; applyAction(act: ParsedAction): void;
  runDag(fromNodeId?: string): void; rollback(nodeId: string, keepVersions: string[]): void;
}

export type ParsedAction =
  | { type: 'switch_bg'; preset: string }
  | { type: 'light_warm' } | { type: 'light_cool' }
  | { type: 'shadow'; intensity: number }
  | { type: 'rollback'; nodeId: string; keepLight: boolean }
  | { type: 'unknown'; raw: string };
```

---

## 4. 核心数据流

### 4.1 CompositionController（输入→补间→渲染）

```
输入层（全部收敛到 seekProgress）:
  slider drag/wheel/touch  → target = clamp(delta)
  keyboard ←/→             → ±1%；Shift → 跳到当前 stage 边界
  idle autoplay (Explore)  → gsap.to(tweened, {progress:1, duration: 剩余时长, ease:'none'})

seekProgress(target):
  gsap.to(TWEEN, { progress: target, duration: 0.3, ease: 'power1.out', overwrite: true,
    onUpdate: () => {
      const p = TWEEN.progress
      const s = getStage(p)               // 纯函数区间推导
      if (s !== compositionStore.stage) compositionStore.setStage(s)  // 离散，唯一 setState 点
    }})

useGsapTicker 渲染循环（每帧，无 setState）:
  const p = TWEEN.progress
  showcaseCanvas.draw(p)      // canvas：背景 alpha、主体、MATTE、夕阳层、合成
  lightLayers(p, mouse)       // DOM div：4 层光效 opacity/translate（右侧落日方向）
  shadowEllipse(p)            // scaleX 0→1, opacity 0→0.35
  colorGrade(p)               // overlay.style.filter = `saturate(..) contrast(..)` 0→1
  sliderFill(p)               // 填充宽/手柄位移/百分比文本
  fpsMeter.tick()
```

### 4.2 本地编排器（DAG 顺序执行）

```
orchestrator.runDag(fromNodeId?):
  nodes = dagNodes.slice(从 fromNodeId 起的下游链)   // 回滚/局部重跑
  for node of nodes:
    node.status = 'running'; pushAgentMessage(`${node.name} 执行中…`)
    await sleep(rand(600, 1500))                     // 模拟真实节奏（env USE_MOCK=false 时改调 API）
    if env 真实模式: artifact = await api.run(node, params)
    else: artifact = composeEngine.produce(node, params)   // offscreen canvas 产出
    node.versionId = 新版本; versions[node.id].push(...)
    node.artifactKey = assetIds; node.status = 'done'
  最后节点为 critic → pushAgentMessage(critic 五维卡)

applyAction({type:'rollback', nodeId:'n2', keepLight:true}):
  prev = versions['n2'][上一版]; 恢复 n2 产物
  保留 n3/n4 当前输出; orchestrator.runDag('n5')     // 只重跑下游
  新版本入链, pushAgentMessage('已换回上一版背景，光线保留')
```

---

## 5. 任务列表（5 个任务，覆盖全部 P0+P1）

**T01 项目基础设施 + 类型/常量/store 骨架**（P0，依赖：无）
- 文件：`global.css`、`types/index.ts`、`constants/*`（3 个）、`store/*`（3 个）、`App.tsx`、`main.tsx`（改）
- 验收：三路由可切换空壳页；stage 区间/文案/DAG 节点/指令映射常量与 §6 表完全一致；progress proxy 可 seek 且 stage 推导正确；reduced-motion 全局降级生效。

**T02 合成引擎 + 服务层**（P0，依赖：T01）
- 文件：`engine/composeEngine.ts`、`engine/layers.ts`、`engine/heightmap.ts`、`services/orchestrator.ts`、`services/commandParser.ts`、`services/export.ts`、`services/speech.ts`
- 验收：上传示例图（kf_indoor）跑通管线产出各阶段层 canvas；资产契约 6 张 demo 图 + 4 张 bg + GLB 全部按路径加载成功；orchestrator 模拟执行 7 节点（时延 600–1500ms）后节点全 done；指令解析 4 类动作 + unknown 兜底；TTS/麦克风不可用时静默降级不报错。

**T03 Showcase 页（P0 核心）**（依赖：T01、T02）
- 文件：`pages/ShowcasePage.tsx`、`components/showcase/*`（9 个）、`hooks/*`（4 个）
- 验收：四态状态机完整流转（上传卡 Morph→Processing 扫描线/82% Preparing/5 步条/跳过→Interactive→Final 五维数字滚动）；EXTRACT 棋盘格+主体 drop-shadow、COMPOSE 像素对齐淡入、ILLUMINATE 右侧落日光 4 层随鼠标轻移、GROUND 阴影椭圆、HARMONIZE filter 插值全部随 progress 连续变化；Agent Voice 三态+波形振幅表+Final 收敛；底部控制器拖/滚轮/触摸/键盘 ←→/Shift；三模式自动播放；反引号 Debug 显示 Progress/Stage/FPS；动画帧率下不触发 React 重渲染。

**T04 Workspace 页（P1）**（依赖：T02）
- 文件：`pages/WorkspacePage.tsx`、`components/workspace/*`（9 个）
- 验收：三栏布局 + 底部 DAG 7 节点（连线、状态色、点击看产物）；Agent 对话流含 Plan DAG 卡/Critic 五维卡；4 条快捷指令 chips 逐一触发对应动作（含条件回滚"换回上一版背景保留光线"），连续 5 轮指令不崩且产生节点级 V1..Vn；AI 生图面板 4 预设+prompt 产出入 Assets 并更新 DAG；AI 建模面板 heightmap displaced plane + GLB 示例 + 轨道控制；导出 PNG/JPG×2 尺寸+元数据 JSON；语音输入 zh-CN（不可用文本兜底+低置信度确认）+TTS+"你说了什么/AI 在做什么"展示。

**T05 Research 页 + 全局集成调优**（P1，依赖：T01；可与 T03/T04 并行收尾）
- 文件：`pages/ResearchPage.tsx`（懒加载）、`styles/global.css`（终稿）、`main.tsx`/`App.tsx`（终稿微调）
- 验收：整站串联通测（Showcase→Final→工作台→指令→导出 全链路）；路由返回不丢状态；键盘可控 progress 全程可达；资源加载失败兜底提示；构建零 TS 报错。

---

## 6. 共享约定

- **命名**：组件 PascalCase、常量 UPPER_SNAKE_CASE、hooks `useXxx`、文件全 ASCII；CSS Modules（`*.module.css`）。
- **Stage 区间表**（constants/stages.ts）：
  | progress | Stage | 解说文案 |
  |---|---|---|
  | 0–12 | UNDERSTAND | "我先读懂这张照片：灰度城市街景，主体是一位行人。" |
  | 12–28 | EXTRACT | "正在把主体从背景分离，生成像素级 Alpha 遮罩。" |
  | 28–45 | COMPOSE | "为夕阳湖边场景做像素级对齐，把主体放进新环境。" |
  | 45–65 | ILLUMINATE | "光来自右侧落日方向（约 212°，4800K，强度 72%），为人物重新打光。" |
  | 65–78 | GROUND | "生成接触阴影，让双脚稳稳落地。" |
  | 78–92 | HARMONIZE | "统一色调与颗粒，让人物真正融入这个黄昏。" |
  | 92–100 | CRITIC | "AI 自检中：光照、阴影、色彩、边缘逐项评分。" |
  | Final | — | "合成完成，五维检查全部通过。可以进入工作台继续编辑。" |
- **DAG 节点表**（constants/dag.ts）：n1 matting→n2 background_generate→n3 lighting_estimate→n4 relight→n5 shadow_generate→n6 harmonize→n7 critic；产物：matte/背景层/光照参数/重打光图/阴影层/和谐化成片/评分。
- **快捷指令映射**：`改成傍晚`→switch_bg(傍晚预设)+重跑 n2..n7；`光线太冷了`→light_warm(temp→5200K)+重跑 n4..n7；`阴影轻一点`→shadow(intensity 0.35→0.2)+重跑 n5..n7；`换回上一版背景保留光线`→rollback(n2, keepLight:true)+重跑 n5..n7。未命中关键词→unknown 回复引导话术。
- **其他**：所有响应/资产元数据走 `{code, data, message}` 格式（为真实 API 预留）；光源常量唯一出处 `LIGHT_SOURCE = { azimuthDeg: 212, kelvin: 4800, intensity: 0.72, side: 'right' }`；日期 ISO 8601 UTC。

---

## 7. 风险与规避

1. **逐帧 setState 导致卡顿**：连续值全部走 tweened proxy + rAF 直写，React 只在 stage/状态切换时更新；验收用 DevTools 验证 0 重渲染。
2. **本地抠图（显著性算法）质量有限**：demo 主图走预抠 RGBA（kf_subject.png），上传图管线仅作演示级抠图，UI 上标注"演示引擎"；预加载失败时降级为纯进度演示。
3. **speechSynthesis / AnalyserNode 兼容性**：speech.ts 全 try-catch + 能力探测，不可用时隐藏对应 UI 而非报错。
4. **回滚状态一致性**：版本链 immutable append（只 push 不改旧版本），回滚=选旧版本+重跑下游，避免并发编辑打架；连续 5 轮测试写入验收。
5. **Three.js 包体与初始化成本**：建模面板 `React.lazy` 动态 import three，仅进入 AI 建模 Tab 时加载。

—— 设计完毕，可直接交工程师按 T01→T05 实现。
