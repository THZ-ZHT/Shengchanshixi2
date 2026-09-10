# 前端整体方案 — 多模态图像合成 Agent（抠取与光影一致合成）

> 配套设计稿：Ardot 画布《抠取与光影一致合成Agent · 交互首页设计稿》
> （https://ardot.tencent.com/file/723720979899030 ，含 State A/B/C/D 四状态画板 + 交互逻辑总规范画板）
> 依据文档：`1.txt`（视觉方向 "Drag the Reality"）、`新建文本文档 (2).txt`（交互系统规范）
> 版本 V1.0 · 2026-09-09

---

## 一、产品定位与设计目标

**一句话定位**：一个"会说话的图像合成工作台入口"——用户上传一张图，Agent 完成主体抠取、新场景构建与光影一致合成，全程通过**鼠标横向拖动**驱动的单一进度轴呈现，Agent 以语音波形动画同步解说。

**四大核心需求 → 方案映射**：

| # | 需求 | 方案落点 |
|---|------|----------|
| 1 | 主页为效果展示页，鼠标交互操控 | State C 交互舞台：鼠标拖动 = 合成进度，移动/悬停/点击分层控制 |
| 2 | 滚动后单张图片从左向右变化，突出主题特征 | Image Morph Journey：progress 0→1 驱动 8 组关键帧插值，前景/背景/光影三层独立变化 |
| 3 | Agent 感：音频波形跳动体现说话感 | Voice Presence 模块：Orb + 7 条波形（中间高两侧低），Listening / Thinking / Speaking 三态 |
| 4 | 图片上传区 + 等待处理区，呈现处理过程 | State A 上传卡（拖放/点击）→ State B 处理台（扫描线 + 步骤条 + 进度），上传卡 Morph 成中央画布 |

---

## 二、整体架构

### 2.1 单一进度源：Composition Controller

所有视觉状态由一个 `progress`（0–1）推导，任何输入只改 progress，不直接改 UI：

```
输入层（Drag / Move / Hover / Click / Scroll·Touch / Voice）
        ↓
progress 0→1（GSAP 补间，阻尼跟随）
        ↓
Stage（阶段）+ stageProgress（阶段内进度）
        ↓
Visual State（图层不透明度 / 位移 / 模糊 / 光效参数）
```

**好处**：鼠标拖动、滚轮、触摸、语音播报进度共用同一数据源，天然一致；回放、撤销、自动 Demo 都只是"驱动 progress"的不同策略。

### 2.2 四态状态机（页面级）

```
Empty ──上传/Demo──▶ Processing ──管线就绪──▶ Interactive ──progress=1──▶ Final
  ▲                                                                    │
  └────────────────────────── 重新体验 ←───────────────────────────────────┘
```

- **Empty（State A）**：上传入口 + Agent 待机（Listening）。
- **Processing（State B）**：只读进度展示，Agent 进入 Thinking/Speaking，禁止拖动。
- **Interactive（State C）**：核心体验，progress 可由用户操控（示例定位在 63% ILLUMINATE）。
- **Final（State D）**：AI CHECK 报告 + 进入工作台 / 重新体验。

### 2.3 七阶段管线（关键帧锚点，V1.1 对齐 2.txt §4 区间制）

| progress 区间 | 阶段 | 视觉主题 | 突出"主题特征"的方式 |
|----------|------|----------|----------------------|
| 0% | ORIGINAL | 原始照片 | 全图原样 |
| 0–12% | UNDERSTAND | 主体识别 | 主体高亮 + 置信度标签（Subject · 98.2%） |
| 12–28% | EXTRACT | 抠取+背景脱离 | 背景淡出，主体边缘描边发光，右下角浮出 MATTE 面板（Alpha 98.2% / Edge 96.8%） |
| 28–45% | COMPOSE | 新场景生成 | 新背景淡入，主体轻微视差居中 |
| 45–65% | ILLUMINATE | 光源进入+重打光 | 径向光晕 + 太阳光斑 + 虚线光线（4 层光：方向/柔光/高光/环境色） |
| 65–78% | GROUND | 接触阴影生成 | 主体脚下阴影从接触点向外生长 |
| 78–92% | HARMONIZE | 色彩/噪点统一 | 全画面色调、颗粒、景深过渡一致 |
| 92–100% | CRITIC → FINAL | 校验通过 | Critic 检查（阴影弱则回优化）→ 最终成片 + AI CHECK 评分 |

---

## 三、页面布局与视觉系统

### 3.1 布局骨架（1440×900）

```
┌──────────────────────────────────────────────┐
│ Header（Logo · Research · Workspace）   7%   │
├──────────────────────────────────────────────┤
│                                              │
│ Hero / 舞台区                          67%   │  ← 随状态切换内容
│                                              │
├──────────────────────────────────────────────┤
│ Agent Presence（左）＋ 提示/操作（右）   9%   │
├──────────────────────────────────────────────┤
│ 合成控制器 / 步骤条                     10%   │
├──────────────────────────────────────────────┤
│ Footer（流程提示 / AI Preparation）     7%   │
└──────────────────────────────────────────────┘
```

### 3.2 设计令牌（Design Tokens）

```
色彩：
  --bg:        #F4F3EF   暖白摄影工作室底色
  --surface:   #FFFFFF   卡片面
  --ink:       #17191C   主文字
  --ink-2:     #777A7E   辅助文字
  --green-d:   #315C52   深绿（品牌/强调/进度）
  --green-s:   #DCE9E4   软绿（chip 底/按钮底）
  --success:   #48796B   成功/激活
  --border:    rgba(23,25,28,.12)

字体：Noto Sans SC（Regular 400 / Medium 500 / SemiBold 600 / Bold 700）
字号阶梯：11 / 12 / 13 / 15 / 18 / 24 / 46
间距基数：8px 网格；卡片圆角 12–16px；阴影仅用于浮起卡片与手柄
```

> 画布中的灰色占位框为示意；真实实现时使用 **AI 生图预生成 8 组关键帧**（同一主体、同一构图、逐阶段变化，见第七节）。

---

## 四、模块拆解：功能与交互逻辑

### M1 · Header 导航（常驻）
- **功能**：品牌锚点（ImageCompose）+ Research / Workspace 两个次级入口。
- **交互**：静态常驻；Workspace 在 Final 态前置为高亮可点。

### M2 · Hero 文案区（State A 专属）
- **功能**：eyebrow「AI COMPOSITION AGENT」+ 主标题「从一张图，到真实合成」+ 副标题。
- **交互**：仅在 Empty 态显示；进入 Processing 后整块淡出，为舞台让位。

### M3 · 上传区 Upload Zone（State A）
- **功能**：虚线上传卡（SVG 上传图标 + "DROP IMAGE" + 格式说明 JPG/PNG/WEBP）+「Try Demo Image」示例按钮 + 底部流程提示「上传 → 等待处理 → 拖动探索 → 最终合成」。
- **交互逻辑**：
  - 拖入（dragover）→ 卡片边框变深绿、轻微放大 1.02；
  - 放下/点击选择 → 读取文件 → **上传卡 Morph 成中央画布**（位置/尺寸补间到舞台位），进入 Processing；
  - 点击 Demo → 载入内置示例图，同样走 Morph 路径（保证首访用户 0 成本体验）。

### M4 · 处理等待区 Processing（State B）
- **功能**：
  - Stage Card：图像占位 + **扫描线动画**（2px 横线上下往复）+「IMAGE RECEIVED」chip；
  - **总进度条**（0→100% 缓动，与管线各阶段对齐）；
  - **步骤条**（四步）：上传完成 ✓ → 主体识别（激活，绿点脉冲）→ 场景构建 → 光影准备；
  - Footer：「AI Preparation · 预生成 8 组关键帧 · 过程无需刷新页面」。
- **交互逻辑**：
  - 全程**禁止拖动**（进度由系统驱动），鼠标悬停步骤条可查看各步骤说明 tooltip；
  - Agent 处于 Thinking（波形低幅随机跳动）→ 每完成一步切 Speaking 播报一句；
  - 关键帧就绪后自动进入 Interactive（也可点击"跳过等待"直接进入）。

### M5 · 交互舞台 Interactive Stage（State C，核心）
- **功能**：中央大画布（900×480）+ 左侧竖排状态标（FROM IMAGE / TO REALITY）+ 右侧 LIGHT 实时参数面板（Direction 32° / Temperature 4800K / Intensity 72%，随 progress 联动）+ 顶部「按住拖动」提示胶囊（首次拖动后淡出）。
- **交互逻辑（鼠标五式）**：
  - **按住拖动（核心）**：横向位移 = progress 增量；左→右前进（抠取→合成），右→左回退；带阻尼，松手缓停；
  - **移动 Move**：背景层 ±4px、背景块 ±2px 轻视差，制造空间纵深；
  - **悬停 Hover**：主体上浮现「Subject · 98.2%」识别标签；63% 后浮现光斑跟随；
  - **点击 Click**：跳到最近关键帧锚点（阶段吸附）；Final 态点击进入工作台；
  - **滚轮 / 触摸**：与拖动共用 progress（滚轮 ΔY 映射进度，移动端横滑）。
- **图层控制**（随 progress 插值）：
  - Foreground：opacity / mask 随 Extract 变化（边缘描边先亮后隐）；
  - Background：模糊 → 色块 → 结构 → 真实四级渐替；
  - Lighting：方向/色温/强度与 LIGHT 面板数值严格同步；
  - Shadow：接触点向外生长（scaleX 0→1，opacity 0→0.35）；
  - Harmonize：全画面 color-grade 滤镜强度 0→1。

### M6 · Agent 语音存在 Voice Presence（全状态常驻，左下角）
- **构成**：Orb（24px 深绿圆点 + 呼吸光环）+ **7 条波形**（3px 宽、间距 3px，高度数组中部最高两侧递减）+ 一行状态文字。
- **三态表现**（V1.1 严格对齐 2.txt §16/§38：Listening=呼吸、Thinking=慢旋、**仅 Speaking=波形跳动**）：

| 状态 | 视觉 | 节奏 | 触发时机 |
|------|------|------|----------|
| Listening | ● 呼吸圆点（Orb+光环缩放），无波形 | 1.2s 循环缓动 | Empty 待机 |
| Thinking | ◌ 虚线圆环慢速旋转，波形停止 | ~3s/圈 | Processing 分析中 |
| Speaking | ▂▅█▇▃ 波形跳动（[7,12,18,24,18,12,7]） | 真实 TTS 音频包络（Web Audio AnalyserNode 驱动） | 播报解说时 |

- **交互逻辑**：语音是**解释层**、图像 Morph 是**执行层**——播报内容与当前阶段一一对应（如 63% 时「正在同步人物高光与发丝边缘。」），Speaking 结束回到 Listening；Final 态播报收敛为低幅（[4,7,10,13,10,7,4]）表示"完成"。
- **实现**：纯 CSS/JS keyframes 驱动（`scaleY` + 错相 delay），可选接入真实 TTS 音频后改用 WebAudio AnalyserNode 驱动真实振幅。

### M7 · 合成控制器 Composition Controller（State C 底部）
- **功能**：ORIGINAL（左）/ FINAL（右）端标 + 980px 轨道 + 填充线（深绿）+ 手柄（双圈，白底绿心）+ 当前百分比 + 七阶段指示（Understand / Extract / Compose / Illuminate / Ground / Harmonize / Critic，当前阶段绿色高亮）。
- **交互逻辑**：
  - 手柄可被直接拖拽（与舞台拖动等价，同一 progress）；
  - 点击轨道任意位置 → GSAP 补间滑至该进度；
  - 阶段指示可点 → 吸附到对应关键帧；
  - 键盘 ←/→ 微调 1%，Shift+←/→ 跳阶段（无障碍）。

### M8 · 结果确认 Final（State D）
- **功能**：「HARMONIZED · FINAL」chip + 成片画布 + 右侧 **AI CHECK 面板**（Lighting 94 / Shadow 91 / Color 95 / Edge 97，Overall 95/100，PASSED 徽章）+「进入工作台」主按钮 +「重新体验」次按钮 + 底部满轨进度（ORIGINAL → FINAL · 100%）。
- **交互逻辑**：AI CHECK 分数逐项数字滚动入场；「重新体验」重置状态机回 Empty（或回 Interactive 由用户选择）；「进入工作台」承接后续编辑流程。

---

## 五、交互逻辑总规范（对应规范画板）

### 5.1 输入层 Input
| 输入 | 行为 |
|------|------|
| Drag（按住左右拖） | 驱动 Composition Progress（核心交互） |
| Move（移动） | ±轻视差（背景 +4px / 背景块 -2px） |
| Hover | 显示 Subject / Light 信息标签 |
| Click | 进入 Workspace 工作台（Final 态）/ 阶段吸附 |
| Scroll / Touch | 与鼠标共用同一 progress |

### 5.2 状态机 State
| 状态 | 入口 | 允许的操作 | Agent 状态 |
|------|------|-----------|-----------|
| Empty | 初始 / 重新体验 | 上传、Demo | Listening |
| Processing | 上传完成 | 仅观察、跳过等待 | Thinking→Speaking |
| Interactive | 管线就绪 | 拖动/滚轮/悬停/点击 | 随阶段 Speaking |
| Final | progress=1 | AI CHECK 查看、进工作台、重置 | 收敛低幅 |

### 5.3 图层控制 Layers
- **Foreground** — opacity / mask 随 Extract 变化（突出主题特征的主通道）；
- **Background** — 模糊 → 色块 → 结构 → 真实；
- **Lighting** — 方向 / 色温 / 强度三参数映射（联动 LIGHT 面板）；
- **Shadow** — 从接触点向外生长；
- **Harmonize** — 全画面色彩、噪点统一。

---

## 六、技术实现方案

### 6.1 技术栈
- **React 18 + TypeScript + Vite**：组件化四态页面；
- **GSAP**：progress 补间（`gsap.to` + `onUpdate`）、Morph（FLIP 或手动 transform）、波形错相动画；
- **状态管理**：Zustand 单 store —— `progress / stage / phase / agentState / lightParams`；
- **样式**：CSS Modules + Design Tokens（CSS Variables）。

### 6.2 核心数据流（伪代码）

```ts
// 单一进度源
const setProgress = (p: number) => {
  progress = clamp(p, 0, 1);
  const { stage, t } = stageAt(progress);       // 阶段 + 阶段内进度
  layers.foreground.opacity = fgOpacity(stage, t);
  layers.background.style = bgStyle(stage, t);  // 模糊/色块/结构/真实
  light.direction = lerp(120, 32, t);
  agent.status = statusFor(stage);              // 解说文案与波形状态
  controller.fill = progress;                   // 轨道/手柄/百分比
};

// 拖动：pointer 位移 → progress（阻尼跟随）
onPointerMove: setProgress(dragStart + (dx / trackWidth) * gain)

// 关键帧插值：8 组预生成帧按 progress 加权混合
frame = blend(keyframes, progress)  // 相邻两组线性混合，GPU 合成
```

### 6.3 关键帧资产（AI 生图策略）
- 用同一张原始图 + 逐阶段 prompt（抠取 → 换背景 → 打光 → 加影 → 调色）生成 **8 组同构图关键帧**；
- 运行时**只做插值与图层合成，不实时调用模型**——保证拖动 60fps；
- 关键帧预加载（首屏后后台拉取），Processing 态即是加载窗口（"预生成 8 组关键帧"的 UI 暗示来源于此）。

### 6.4 性能与可访问性
- 波形/扫描线/光晕全部使用 `transform/opacity` 合成层动画，避免重排；
- 关键帧用 `will-change` + 离屏 canvas 混合备选方案；
- 键盘可控 progress、`prefers-reduced-motion` 时关闭视差与波形跳动、对比度满足 WCAG AA（正文 ≥ 4.5:1）。

---

## 七、开发优先级路线图

| 阶段 | 内容 | 对应需求 |
|------|------|----------|
| P0 骨架 | 四态状态机 + 上传/Morph + Processing 流程 | 需求 4 |
| P1 核心 | Composition Controller + 8 关键帧插值 + 拖动/滚轮 | 需求 1、2 |
| P2 灵魂 | Voice Presence 三态波形 + 解说同步 | 需求 3 |
| P3 完整 | LIGHT 面板联动、AI CHECK、键盘/触控、AI CHECK 报告动画 | 打磨 |

---

## 八、交付物清单

1. **Ardot 高保真设计稿**（5 画板）：State A 空状态上传 / State B 处理等待 / State C 交互舞台(63%) / State D 最终合成 / 交互逻辑总规范；
2. 本文档：前端整体方案 + 模块功能 + 交互逻辑；
3. 后续可导出：组件标注、关键帧 prompt 模板、React 组件骨架。

---

## 九、V1.1 变更记录（对齐 `2.txt` 前端架构规范，2026-09-09）

设计稿已按 2.txt 全部 40 节逻辑修改与标注（画布第 6 块画板「实现标注 · Build Spec」为工程对照板）：

1. **阶段区间制**（§4）：规范画板轨道节点改为 UNDERSTAND 0–12 / EXTRACT 12–28 / COMPOSE 28–45 / ILLUMINATE 45–65 / GROUND 65–78 / HARMONIZE 78–92 / CRITIC→FINAL 92–100；State C 定格 63% 仍属 Illuminate（stageProgress 90%）。
2. **Agent 严格三态**（§16/§38）：State A=呼吸●（波形移除）、State B=虚线环◌慢旋（波形移除）、State C/D=波形跳动；解说文案对齐 §17（Illuminate：「环境光来自左上方，我正在重新调整人物光照。」）。
3. **上传流程对齐**（§19）：State B 步骤条 4→5 步（✓上传完成 ✓解码完成 ●主体识别 ○场景估计 ○构图准备），进度对齐 82% +「Preparing…」。
4. **ImageStage 7 图层**（§6）：Layers 卡改为 BackgroundLayer / SubjectLayer / MaskLayer / LightLayer / ShadowLayer / ColorGradeLayer / FinalComposite。
5. **技术栈扩充**（§2/§23/§31）：Tech Strip 增补 Canvas/WebGL ImageStage · SVG Morph · Web Audio 波形 · ScrollTrigger · Zustand；职责分离——React 管 UI/状态，GSAP/Canvas 管 60fps，不逐帧 setState。
6. **实现标注画板**（新增）：组件树（§24）、8 层图像资产清单与规格（§5/§29/§37）、MATTE 面板与 Debug Overlay 实体示意（§8/§28）、Hover 规范（§27）、首页三模式 Explore/Control/Create 与 Auto Play（§33/§34）、Motion 时长规范与验收标准（§26/§38）、Workspace 三栏预留（§35/§36）。
7. **关键帧实图**：State B/C/D 照片位已由 AI 生成并裁剪应用——同一人物「普通室内原图 → 夕阳户外合成」，与画布光效元素及 LIGHT 面板（暖光 4800K）氛围一致；真实开发时按此叙事预生成 8 层资产（WebP，主图 2048×1365）。
8. **效果图 1:1 复刻画板**（第 7 块「效果图复刻 · Main Showcase」）：按参考效果图完整重建主展示页——Header（ImageCompose + Research/Workspace）、左侧上传栏（Upload Image + 缩略图徽章 + Try a Demo）、中央「From Image to Reality」标题 + 四片扇形渐进画板（灰度城市 → 棋盘格抠图 → 降饱和过渡 → 全彩日落山湖，同一人物侧脸/背包叙事）+ AI Agent Thinking 胶囊 + Original→Final 56% 进度轨 + 7 Stages 圆点、底部七阶段关键帧缩略图条（01–07 双语标签）、右侧 Agent 对话时间线（5 条消息+时间戳）+ 输入框 + Quick Actions 四宫格、角落叶影装饰。图片全部 AI 生成（文生图定主图 → 图生图派生灰度/剪影 → PIL 自制棋盘格 Matte 合成与各阶段调色变体），全部裁剪去水印后应用。
