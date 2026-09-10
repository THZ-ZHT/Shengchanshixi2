# 真正的多模态 Agent · 后端部署方案

> 本文档是「多模态图像合成 Agent」的**生产级后端**实施蓝图。当前前端演示用的是浏览器内轻量引擎（关键词正则 + 本地抠图 + 预设背景），已经能跑通完整七阶段管线并展示效果。真正部署时用本文档的方案替换本地引擎，接入 LLM 与图像/视频生成 API。

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                           │
│  UploadCard → Workspace → CanvasPanel + AgentPanel (WebSocket)      │
└───────────────┬─────────────────────────────────────┬───────────────┘
                │ HTTPS                               │ WSS
┌───────────────▼────────────────┐         ┌──────────▼──────────────┐
│  Agent Gateway (Node.js)       │ ◄─────► │  Tool Sandbox (Python)   │
│  /api/agent/run                │         │  BiRefNet / IC-Light     │
│  /ws/agent/stream              │         │  SAM 2 / Diffusion       │
│  LLM 调用 + 工具路由            │         │  Hunyuan-3D / SVD        │
└───────────────┬────────────────┘         └─────────────────────────┘
                │
   ┌────────────┼─────────────────────┐
   │            │                     │
┌──▼────────┐ ┌─▼──────────┐  ┌───────▼────────┐
│ LLM API   │ │ Image Gen  │  │ Video / 3D Gen │
│ 通义千问  │ │ 通义万相   │  │ 可灵 / 混元     │
│ OpenAI    │ │ SDXL       │  │                │
└───────────┘ └────────────┘  └────────────────┘
```

**核心组件**：
- **Agent Gateway**：Node.js (Fastify 或 Express)，负责 WebSocket 长连接、对话上下文管理、LLM 调用、工具路由、消息广播。
- **Tool Sandbox**：Python (FastAPI)，跑模型推理（BiRefNet 抠图、IC-Light 重打光、SAM 2、Hunyuan-3D），暴露为内部 HTTP 接口。
- **对象存储**：S3 / 阿里云 OSS，存放用户上传、生成的中间图与最终图。
- **CDN**：静态资源 + 签名 URL。
- **数据库**（可选）：Postgres 存对话历史 / 任务状态。

---

## 2. 仓库结构

```
imagecompose-agent/
├── gateway/                  # Node.js Agent Gateway
│   ├── package.json
│   ├── src/
│   │   ├── server.ts         # Fastify 启动 + 路由挂载
│   │   ├── ws.ts             # WebSocket hub
│   │   ├── llm/
│   │   │   ├── client.ts     # 通义千问 / OpenAI 客户端
│   │   │   ├── prompts.ts    # 系统提示词 + 工具定义
│   │   │   └── parser.ts     # 工具调用 JSON 解析
│   │   ├── tools/
│   │   │   ├── matting.ts    # 调用 Python sandbox
│   │   │   ├── background.ts
│   │   │   ├── relight.ts
│   │   │   ├── harmonize.ts
│   │   │   ├── animate.ts    # 可灵视频生成
│   │   │   └── model3d.ts    # 混元文生 3D
│   │   ├── dag/
│   │   │   ├── planner.ts    # LLM 驱动 DAG 生成
│   │   │   ├── executor.ts   # DAG 节点调度
│   │   │   └── store.ts      # 节点版本 / 回滚
│   │   └── auth/
│   │       └── jwt.ts
│   └── tsconfig.json
├── sandbox/                  # Python 模型推理服务
│   ├── pyproject.toml
│   ├── app.py                # FastAPI
│   ├── models/
│   │   ├── birefnet.py       # BiRefNet 抠图
│   │   ├── iclight.py        # IC-Light 重打光
│   │   ├── sam2.py           # SAM 2 分割
│   │   ├── hunyuan3d.py      # 混元文生 3D
│   │   └── svd.py            # 视频生成（可选）
│   └── requirements.txt
├── web/                      # 现有 React 前端（已实现）
│   └── src/
└── deploy/
    ├── docker-compose.yml
    ├── Dockerfile.gateway
    ├── Dockerfile.sandbox
    └── nginx.conf
```

---

## 3. Agent Gateway 核心实现

### 3.1 server.ts

```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { registerWs } from './ws';

const app = Fastify({ logger: { level: 'info' } });
await app.register(websocket, { options: { maxPayload: 1048576 } });

app.register(import('./routes/upload'));   // POST /api/upload
app.register(import('./routes/agent'));    // POST /api/agent/run
await registerWs(app);                      // /ws/agent/:conversationId

app.listen({ host: '0.0.0.0', port: 8080 });
```

### 3.2 llm/prompts.ts（工具定义）

```typescript
export const SYSTEM_PROMPT = `
你是「多模态图像合成 Agent」。用户会上传一张带人像的图片，你需要：
1. 调用工具抠取主体、生成或选择背景、重打光、和谐化、添加运动。
2. 严格按 DAG 顺序：抠图 → 背景 → 光照 → 重打光 → 阴影 → 和谐化 → 自检。
3. 每一步都向用户简短说明意图。
4. 自然语言驱动，不要假设固定流程；用户可能让你"换成傍晚城市，并让人物慢慢走路"。
`;

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'matting',
      description: '抠取主体，输出 RGBA 图',
      parameters: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string' },
          method: { type: 'string', enum: ['birefnet', 'sam2', 'rembg'], default: 'birefnet' },
        },
        required: ['imageUrl'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'background',
      description: '生成或选择背景图，支持预设或文字生成',
      parameters: {
        type: 'object',
        properties: {
          presetId: { type: 'string', enum: ['bg_lake', 'bg_cafe', 'bg_city', 'bg_forest'] },
          prompt: { type: 'string' },
          uploadUrl: { type: 'string' },
        },
      },
    },
  },
  { type: 'function', function: { name: 'relight',
    description: '调整光照方向/色温/强度',
    parameters: { type: 'object',
      properties: { tempK: { type: 'number' }, intensity: { type: 'number' }, azimuthDeg: { type: 'number' } } } } },
  { type: 'function', function: { name: 'animate',
    description: '让人物在画面中动起来',
    parameters: { type: 'object',
      properties: { style: { type: 'string', enum: ['float', 'breathe', 'walk', 'swing', 'spin'] } } } } },
  { type: 'function', function: { name: 'model3d',
    description: '将人物转为 3D 模型',
    parameters: { type: 'object', properties: { subjectUrl: { type: 'string' } } } } },
];
```

### 3.3 llm/client.ts

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.TONGYI_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

export async function planTools(messages: ChatMessage[]) {
  const resp = await client.chat.completions.create({
    model: 'qwen-plus',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    tools: TOOLS,
    tool_choice: 'auto',
  });
  return resp.choices[0].message;
}
```

### 3.4 ws.ts（WebSocket 长连接）

```typescript
import type { FastifyInstance } from 'fastify';
import { planTools } from './llm/client';
import { executeDag } from './dag/executor';
import { broadcast } from './ws/hub';

export async function registerWs(app: FastifyInstance) {
  app.get('/ws/agent/:conversationId', { websocket: true }, async (socket, req) => {
    const conversationId = (req.params as any).conversationId;
    socket.on('message', async (raw) => {
      const { text, images } = JSON.parse(raw.toString());
      // 推送"思考中"
      broadcast(socket, { type: 'thinking' });
      const plan = await planTools([{ role: 'user', content: text, images }]);
      // 边执行边推送节点状态
      await executeDag(plan.tool_calls, conversationId, (node, status, assetUrl) => {
        broadcast(socket, { type: 'node_update', node, status, assetUrl });
      });
      broadcast(socket, { type: 'done' });
    });
  });
}
```

### 3.5 dag/executor.ts

```typescript
import { callMatting } from '../tools/matting';
import { callBackground } from '../tools/background';
import { callRelight } from '../tools/relight';

const HANDLERS = {
  matting: callMatting,
  background: callBackground,
  relight: callRelight,
  animate: callAnimate,
  model3d: callModel3d,
};

export async function executeDag(toolCalls, conversationId, onUpdate) {
  let state = { subjectUrl: null, bgUrl: null, finalUrl: null };
  for (const call of toolCalls) {
    onUpdate(call.function.name, 'running', null);
    const result = await HANDLERS[call.function.name](JSON.parse(call.function.arguments), state);
    state = { ...state, ...result };
    onUpdate(call.function.name, 'done', result.assetUrl);
  }
  return state;
}
```

---

## 4. Tool Sandbox（Python）

### 4.1 app.py

```python
from fastapi import FastAPI, UploadFile
from models.birefnet import birefnet_matting
from models.iclight import iclight_relight
from models.hunyuan3d import generate_3d
import tempfile, os

app = FastAPI()

@app.post('/matting')
async def matting(file: UploadFile, method: str = 'birefnet'):
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as t:
        t.write(await file.read())
        path = t.name
    out = birefnet_matting(path, method=method)
    return {'url': upload_to_oss(out)}

@app.post('/relight')
async def relight(subject_url: str, bg_url: str, temp_k: int = 4800, intensity: float = 0.7):
    out = iclight_relight(subject_url, bg_url, temp_k=temp_k, intensity=intensity)
    return {'url': upload_to_oss(out)}

@app.post('/model3d')
async def model3d(subject_url: str):
    out = generate_3d(subject_url)
    return {'glb_url': upload_to_oss(out)}
```

### 4.2 模型清单与成本

| 模型 | 用途 | 推荐供应商 | 单次成本 |
|---|---|---|---|
| BiRefNet | 高质量抠图（含发丝/玻璃） | 本地 GPU / 阿里云 PAI | ~¥0.05 |
| SAM 2 | 交互式分割（可选） | 本地 GPU | ~¥0.10 |
| IC-Light | 重打光（方向/色温） | 本地 GPU / Replicate | ~¥0.03 |
| Hunyuan-3D | 文生 3D / 图生 3D | 腾讯混元 / Replicate | ~¥0.30 |
| 通义万相 | 背景生成（文字/图像） | 阿里云百炼 | ~¥0.08 |
| 可灵 / Vidu | 人物动作视频 | 快手 / 生数 | ~¥0.50 |
| 通义千问 Qwen-Plus | 任务规划与对话 | 阿里云百炼 | ~¥0.004/千 token |

**单次完整合成（含 3D 与视频）**：约 ¥1.5 - ¥3.0。

---

## 5. 部署

### 5.1 Docker Compose

```yaml
version: '3.9'
services:
  gateway:
    build: ./deploy/Dockerfile.gateway
    ports: ['8080:8080']
    environment:
      - TONGYI_API_KEY=xxx
      - SANDBOX_URL=http://sandbox:8000
      - OSS_KEY=xxx
      - OSS_SECRET=xxx
      - OSS_BUCKET=imagecompose
    depends_on: [sandbox, redis]

  sandbox:
    build: ./deploy/Dockerfile.sandbox
    ports: ['8000:8000']
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]   # 需要 NVIDIA GPU
    volumes:
      - ./models-cache:/root/.cache

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

  nginx:
    image: nginx:alpine
    ports: ['80:80', '443:443']
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on: [gateway]
```

### 5.2 Dockerfile.gateway

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
CMD ["node", "dist/server.js"]
```

### 5.3 阿里云一键部署

若不想自建 GPU，推荐路径：
1. **网关层**：阿里云函数计算 FC（Node.js 运行时），WebSocket 通过 API 网关暴露。
2. **模型层**：阿里云 PAI-EAS 部署 BiRefNet / IC-Light / Hunyuan-3D（自动伸缩）。
3. **LLM / 图像生成**：直接调 DashScope SDK，免运维。
4. **存储**：OSS + CDN。

---

## 6. 前端接入

前端 `compositionStore` / `workspaceStore` 已经按 LLM Agent 友好的接口设计。只需把：

```typescript
// 当前 orchestrator 内的本地实现：
const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

// 替换为：
const AGENT_WS_URL = import.meta.env.VITE_AGENT_WS_URL;
```

启动时建立 WebSocket 连接，监听节点状态推送：
```typescript
const ws = new WebSocket(AGENT_WS_URL);
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'node_update') {
    useWorkspaceStore.getState().setNodeStatus(msg.node, msg.status);
    if (msg.assetUrl) {
      const id = useWorkspaceStore.getState().addAsset({
        kind: msg.kind, label: msg.label, src: msg.assetUrl,
      });
      useWorkspaceStore.getState().completeNode(msg.node, msg.versionId, id);
    }
  }
};
```

`parseCommand.ts` 改为薄壳：直接发到 LLM，让 LLM 决定工具调用，前端只负责展示 DAG 推进。

---

## 7. 评估与监控

- **离线评测**：收集 50 张人像 + 50 个 prompt，自动跑完整链路，监控 5 维评分 + 耗时。
- **在线评测**：用户对每个结果 5 星评分，写回数据库，作为后续微调的反馈数据。
- **监控**：Prometheus + Grafana，关注 LLM 调用次数、工具调用成功率、P95 延迟、错误率。

---

## 8. 时间表

| 周次 | 内容 |
|---|---|
| W1 | 网关 + WebSocket + 通义千问接入；前端 `parseCommand` 改为远端调用 |
| W2 | BiRefNet 抠图 + IC-Light 重打光 sandbox；DAG 调度 + 节点回滚 |
| W3 | 通义万相背景生成 + Hunyuan-3D 集成；自定义背景上传 |
| W4 | 人物动作视频（可灵 / SVD） + 3D 模型查看器增强 |
| W5 | Docker 化 + 阿里云部署；评测与监控 |

---

## 9. 当前前端与真正 Agent 的关系

- **当前前端 = 离线演示**：本地引擎 + 关键词正则，能完整跑通七阶段，适合答辩演示 / 离线体验。
- **真正 Agent = 在线生产**：LLM 驱动 + 云端模型，质量更高、范围更广，支持视频与 3D。

两者**数据流兼容**：当前 store 的 asset / DAG 节点结构已对齐生产 Agent 的消息格式，等后端就绪后切换即可。