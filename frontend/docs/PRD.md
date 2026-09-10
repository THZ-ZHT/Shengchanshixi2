# PRD — ImageCompose 多模态图像合成 Agent 前端网站

> 作者：许清楚（Alice）· 产品经理 ｜ 编排：齐活林（Qi）· 交付总监
> 依据：`1.txt`、`新建文本文档 (2).txt`、`2.txt`、`前端整体方案_多模态图像合成Agent.md`（V1.1）、`项目总规范_多模态图像合成Agent_V1.0(1).md`
> 版本 V1.0 · 2026-09-09

**项目信息**
- Language: 简体中文
- Programming Language: React 18 + TypeScript + Vite + GSAP + Zustand + CSS Modules + Canvas 2D + Three.js + react-router-dom
- Project Name: imagecompose_frontend
- 原始需求复述：为「ImageCompose — 会说话的图像合成工作台入口」（主题口号 Drag the Reality / 从一张图，到真实合成）构建纯前端交付网站。用户上传一张人物照片，Agent 完成主体抠取→新场景构建→光影一致合成，全程由鼠标横向拖动驱动的单一进度轴（progress 0→1）呈现，Agent 以语音波形同步解说。无后端时必须可完整演示（内置 Demo 关键帧 + 浏览器本地 Canvas 合成引擎），同时保留可配置的后端 API 层（预留对接 Spring Boot + Python AI Service）。三页：Showcase `/`、Research `/research`、Workspace `/workspace`。

---

## 1. 产品目标

1. **核心体验闭环**：访客上传一张图（或一键 Demo）后，不依赖任何后端即可完整走完「上传→处理→拖动探索→最终合成」四态流程，Showcase 页即是产品本身，60fps 流畅拖动。
2. **"可感知的 Agent"**：通过左下角常驻的语音波形 Orb（Listening/Thinking/Speaking 三态严格区分）+ 七阶段解说文案 + 可视化七阶段管线，让用户始终知道 AI 在做什么，杜绝黑盒感。
3. **拖动即叙事**：以单一 progress 0→1 统一驱动舞台动画、光效参数、MATTE/AI CHECK 面板与 Composition Controller，让"横向拖动"成为产品的标志性交互（Signature Interaction）。
4. **完整工作台能力**：Workspace 提供资产浏览、Agent 对话、DAG 执行可视化、多轮指令编辑、条件回滚与导出，支撑"从草稿到成片"的创作闭环演示。
5. **可演进的架构**：本地合成引擎与后端 API 层解耦（service 抽象 + 环境变量开关），后续可无缝接入真实 AI 服务而不改 UI 层。

## 2. 用户故事

**访客（Visitor）**
1. 作为访客，我想在首页直接拖入一张照片（或点击上传），以便立即开始合成体验而无需注册登录。
2. 作为访客，我想在等待处理时看到扫描线动画、进度条与五步步骤条，以便确信 AI 正在逐步处理我的图片。
3. 作为访客，我想按住鼠标左右拖动画布来控制合成进度，以便以自己的节奏"导演"合成过程，而不是被动看视频。
4. 作为访客，我想在拖动时看到光照方向/色温/强度实时变化与主体浮出标签，以便直观理解每一步 AI 改变了什么。
5. 作为访客，我想点击「Try Demo Image」一键体验完整流程，以便在不想上传自己照片时也能了解产品。
6. 作为访客，我想访问 Research 页了解四条研究方向、工具链与量化指标，以便判断团队的技术深度与可信度。

**创作者（Creator）**
7. 作为创作者，我想在工作台左侧 Assets 面板查看原图/Mask/背景/最终结果缩略图并点击切换，以便对比各阶段中间产物。
8. 作为创作者，我想在右侧 Agent 面板用自然语言（打字或语音）下达「改成傍晚」「阴影轻一点」等指令，以便无需手动调参即可迭代成片。
9. 作为创作者，我想在底部 Execution DAG 中点击任意节点查看该步骤的中间产物图与运行状态，以便审查流水线每一步的输出质量。
10. 作为创作者，我想选中某节点的历史版本并执行「回滚此节点并重跑下游」，以便实现"换回背景 A，保留现在的光"这类条件回滚。
11. 作为创作者，我想通过 AI 生图面板选择预设场景或输入 prompt 生成新背景，以便快速探索多种合成方向。
12. 作为创作者，我想将最终结果导出为 1024/2048 的 PNG/JPG 并附带元数据 JSON，以便将成片用于后续用途并保留过程可追溯性。

## 3. 需求池

### P0 — 核心体验闭环（缺失则产品不成立）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|----------|
| P0-1 | Showcase 四态状态机 | Empty→Processing→Interactive→Final 单向推进，上传卡 Morph 成中央画布 | 上传/点 Demo 后依次进入四态；Processing 完成自动进 C；Final 可「重新体验」回到 A；全程无报错无白屏 |
| P0-2 | 拖动进度轴 | Interactive 态按住拖动驱动 progress 0→1，带阻尼缓停，左→右前进、右→左回退 | 松手后 1s 内平滑停止；progress 与动画/面板/Controller 三方实时一致；滚轮/触摸与拖动等价 |
| P0-3 | 七阶段管线 | 0–12 UNDERSTAND / 12–28 EXTRACT / 28–45 COMPOSE / 45–65 ILLUMINATE / 65–78 GROUND / 78–92 HARMONIZE / 92–100 CRITIC→FINAL，区间制渲染 | 拖动至各区间可见对应舞台效果（主体高亮→描边发光→背景淡入→光晕→接触阴影→色彩和谐→AI CHECK）；边界切换无跳变 |
| P0-4 | Demo 关键帧回放 | 内置 8 层关键帧（original…final）随 progress 插值呈现，开箱即演 | 加载 `public/assets/` 后无后端可完整演示；首次进入 3s 内可开始体验 |
| P0-5 | Agent Voice Presence | 左下角常驻 Orb：Listening=呼吸●无波形 / Thinking=虚线环慢旋无波形 / Speaking=7 条波形跳动（振幅 [7,12,18,24,18,12,7]），Final 态收敛 [4,7,10,13,10,7,4]，状态文字随阶段更新 | 三态切换与当前阶段严格对应；解说文案与七阶段一一映射；不存在"Thinking 却有波形"的错态 |
| P0-6 | Composition Controller | 底部 ORIGINAL/FINAL 轨道 + 深绿填充 + 双圈手柄 + 百分比 + 七阶段指示器；手柄拖拽与舞台拖动等价；点击轨道 GSAP 补间；键盘 ←/→ 微调 1%、Shift+←/→ 跳阶段 | 三种输入（手柄/点击/键盘）均正确更新 progress；阶段指示器可点击吸附到阶段锚点 |
| P0-7 | 本地 Canvas 合成引擎 | 用户上传图走浏览器本地合成：显著性抠图→棋盘格 Matte→AI 背景预设→光效叠加→接触阴影→色彩和谐化 | 上传任意 JPG/PNG/WEBP 人物图后 C 态拖动可见六步层变化，全程 ≤2s 卡顿；处理中即为关键帧预加载窗口 |
| P0-8 | 状态管理 | Zustand 全局 store 单一持有 progress/当前阶段/Agent 状态，GSAP/Canvas 直接读写，不逐帧 setState | 拖动 60fps（Debug Overlay FPS ≥55）；React 重渲染频率与动画帧率解耦 |

### P1 — 完整功能

| # | 需求 | 描述 | 验收标准 |
|---|------|------|----------|
| P1-1 | Processing 细节 | 扫描线动画 + IMAGE RECEIVED chip + 总进度条（约 82% 处 "Preparing…"）+ 五步步骤条（✓✓●脉冲○○，hover tooltip）+ Agent Thinking（约 3s/圈）+「跳过等待」 | 处理完成后 1s 内自动进 C；跳过等待立即进 C 且不破坏后续状态 |
| P1-2 | 鼠标五式补充交互 | 移动±轻视差（背景+4px/背景块−2px）；悬停主体浮出「Subject · 98.2%」标签、63% 后光斑跟随光源；点击吸附最近阶段锚点，Final 态点击进工作台 | 各交互在 C 态均可用且不干扰拖动主操作 |
| P1-3 | State D Final | HARMONIZED·FINAL chip + 成片 + AI CHECK 面板（Lighting 94/Shadow 91/Color 95/Edge 97/Overall 95 + PASSED，分数逐项数字滚动入场）+ 进入工作台/重新体验双按钮 | 分数入场动画 800–1200ms；两按钮跳转正确 |
| P1-4 | 三模式 | Explore（进 C 后 5s 无操作自动播放 0→1 一遍，结束提示 Try it yourself）/ Control（纯手动）/ Create（上传真实图走完整流程） | 三模式切换正确；Explore 自动播放期间用户操作可随时打断 |
| P1-5 | Debug Overlay | 反引号键切换，显示 Progress/Stage/StageProgress/FPS/Agent 状态，默认隐藏 | 按键切换即时生效；隐藏时不渲染任何调试 DOM |
| P1-6 | Research 页 | 四研究卡（R1 抠取/R2 光影一致/R3 Agent/R4 交互）+ 七阶段 SVG 流程图 + T01–T08 工具链表 + 量化指标表 + 技术栈条 + CTA | 静态内容完整渲染；CTA 路由正确 |
| P1-7 | Workspace 三栏+DAG | 左 Assets（缩略图切换 + AI 生图/AI 建模双 Tab 面板）/ 中 Canvas（原图对比、导出）/ 右 Agent（对话流、Plan DAG 卡、Critic 五维卡、输入框+麦克风+4 快捷 chips）/ 底部 DAG（n1→n7 状态 pending/running/done/failed，点击节点看中间产物） | 三栏布局 1024px 宽不破版；DAG 节点点击弹出中间产物图；4 条快捷指令（改傍晚/暖光/阴影减弱/条件回滚）各自触发正确动作 |
| P1-8 | 多轮指令与条件回滚 | 关键词→动作解析；版本树 V1→Vn；「回滚此节点并重跑下游」确认→重放→新版本；5 轮连续编辑不崩溃、状态不丢失 | 连续 5 轮编辑后内存与 UI 状态一致；回滚后下游节点重跑且生成新版本号 |
| P1-9 | 语音能力 | Web Speech API 中文识别（不可用文本兜底）+ 低置信度二次确认 + TTS 播报 +「你说了什么/AI 在做什么」实时显示 | 麦克风不可用时输入框可正常完成所有流程；语音识别失败不阻塞主流程 |
| P1-10 | AI 生图/AI 建模面板 | 4 个 AI 场景预设（傍晚咖啡馆/夕阳湖边/现代城市/森林晨光）+ prompt 输入→本地引擎产出加入 Assets 并更新 DAG；AI 建模：亮度+mask→heightmap→Three.js displaced geometry，可轨道旋转/缩放，含预置 GLB 示例 | 生成的背景立即出现在 Assets 且 DAG 新增对应节点；3D 视图可旋转缩放无报错 |
| P1-11 | 导出 | PNG/JPG、1024/2048 两档、附元数据 JSON | 导出文件尺寸正确、元数据含阶段/参数/版本信息 |

### P2 — 增强打磨

| # | 需求 | 描述 | 验收标准 |
|---|------|------|----------|
| P2-1 | 真实麦克风波形 | Listening 且已授权时用 Web Audio AnalyserNode 驱动真实波形 | 授权后波形随环境音起伏；拒绝授权时降级为呼吸圆点 |
| P2-2 | 中文 TTS 播报 | speechSynthesis 中文播报各阶段解说 | 浏览器无中文语音时静默降级，不影响其他功能 |
| P2-3 | prefers-reduced-motion | 检测系统降级设置，削减非必要动画 | 开启后无长时位移动画，核心信息仍完整可达 |
| P2-4 | 后端 API 配置层 | 环境变量驱动的 service 抽象，可切换本地引擎/真实后端（Spring Boot + Python AI Service 预留） | 未配置时全部走本地；配置后调真实接口，UI 不变 |
| P2-5 | 微交互打磨 | 上传卡 dragover 边框深绿+scale 1.02；首次拖动后提示胶囊淡出；阶段切换 tooltip 等 | 各微交互符合 180–240ms / ease-out 规范 |

## 4. UI/交互设计要点

**全局令牌（硬约束）**
- 色彩：bg #F4F3EF / surface #FFFFFF / ink #17191C / ink-2 #777A7E / green-d #315C52 / green-s #DCE9E4 / success #48796B / border rgba(23,25,28,.12)；克制配色，大面积留白，视觉重心永远是图片本身。
- 字体：Noto Sans SC；字号阶梯 11/12/13/15/18/24/46；8px 网格；卡片圆角 12–16px；阴影仅用于浮起卡片与手柄。
- 动效：普通 UI 180–240ms / Image Morph 400–800ms / Agent 出现 300–500ms / Final 800–1200ms，ease-out 系；WCAG AA 对比度；键盘可达。

**Showcase（`/`）**
1. 单屏叙事：Empty 态 = Header + Hero（eyebrow「AI COMPOSITION AGENT」+ 主标题「从一张图，到真实合成」）+ 虚线上传卡 + Demo 按钮 + 底部流程提示，首屏无滚动即可完成主操作。
2. C 态画布固定 900×480 居中；左竖排 FROM IMAGE / TO REALITY，右 LIGHT 参数面板（随 progress 联动），右下 MATTE 面板（EXTRACT 段浮出），首次拖动提示胶囊用后即淡。
3. 所有 progress 驱动的视觉（光效/面板数值/阶段高亮）必须由同一 store 数值推导，禁止各组件独立计时。

**Research（`/research`）**
1. 共享 Header；四研究卡等宽栅格；流程图用纯 SVG 绘制七阶段管线。
2. 两张数据表（工具链 T01–T08、量化指标）用统一表格样式；底部 CTA「返回首页 / 进入工作台」。

**Workspace（`/workspace`）**
1. 固定三栏（Assets / Canvas / Agent）+ 底部 Execution DAG；左窄右宽，中栏 Canvas 拿最大面积。
2. Agent 对话流必须同时显示用户指令与 AI 动作（透明化）；Plan 卡 DAG 节点与底部 DAG 状态同步。
3. DAG 节点用颜色区分四态，可点击查看产物；版本树与回滚入口放在节点详情内，回滚前必须二次确认。

**可达性与降级**
1. 键盘完整可达：Controller 方向键/Shift 组合、Tab 焦点顺序、按钮均可 Enter 触发。
2. prefers-reduced-motion 与 Web Speech 不可用均有明确降级路径，不阻塞核心流程。

## 5. 关键假设

1. Demo 8 层关键帧资产（`public/assets/`）由主理人侧 AI 预生成后提供，前端只做加载与插值，不负责资产生成。
2. 本地合成引擎的"显著性抠图"采用轻量浏览器端算法（如色块/边缘显著性 + 棋盘格 Matte 展示），产出效果达到"演示级"即可，不追求与 BiRefNet 同等精度——真实模型推理在 Out of Scope。
3. Workspace 的 DAG 执行、多轮指令、条件回滚在无后端时由前端编排器（本地任务队列 + 状态机）模拟真实执行节奏（节点 running 有可见时延），有后端时切换为真实 API。
4. AI 生图面板在无后端时以「本地背景预设 + 简单 prompt 关键词匹配」产出结果；4 个预设图视为关键帧资产的一部分。
5. 语音能力（ASR/TTS/麦克风波形）全部基于浏览器原生 API（Web Speech / Web Audio），不引入第三方付费服务；不可用时静默降级。
6. 响应式只需覆盖 ≥1024px 桌面宽度；不做移动端原生适配与用户登录系统。
7. 「AI 预生成 GLB 模型示例」作为静态资产随项目提供，AI 建模面板仅负责展示与交互。
8. performance 目标：拖动期间稳定 60fps（中端笔记本集显）；关键帧总资产体积假设 ≤15MB，首屏预加载 P0 阶段所需的前 3 层。

## 6. 风险与规避

1. **60fps 性能风险**：Canvas 绘制 + GSAP + React 重渲染叠加可能掉帧。规避：动画值全部走 store 直读、GSAP ticker 内不触发 React setState；关键路径用 Canvas 2D 合帧而非 DOM 动画；Debug Overlay FPS 实测纳入验收。
2. **本地抠图效果不佳**：轻量算法对复杂背景人物可能抠取粗糙，影响演示说服力。规避：Demo 关键帧兜底主路径（首页默认引导 Try Demo Image）；上传路径用棋盘格 Matte 与边缘描边等视觉手段强化"专业感"，并在文档中说明为演示级实现。
3. **浏览器 API 兼容性**：Web Speech API 在部分浏览器不可用/需联网。规避：所有语音功能均有文本兜底，语音失败不阻塞任何主流程；功能探测后降级而非报错。
4. **状态机复杂度**：四态 × 三模式 × 七阶段 × 语音三态的组合易出错态。规避：以 Zustand 单一 store + 显式状态机（有限状态转移表）实现，禁止组件各自持有 progress；Debug Overlay 暴露全部状态便于联调。
5. **资产交付时序风险**：Demo 关键帧/GLB 若未及时就绪会阻塞前端联调。规避：约定资产清单与占位符（低分辨率 placeholder）先行，前端按固定文件名/路径加载，资产就绪即替换无需改码。
