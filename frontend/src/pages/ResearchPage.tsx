import { Link } from 'react-router-dom';
import { STAGES, STAGE_LABELS } from '../constants/stages';
import { useReveal } from '../hooks/useReveal';
import styles from '../styles/research.module.css';

const RESEARCH_CARDS = [
  {
    id: 'R1',
    title: '透明 / 半透明抠取',
    body: '基于 BiRefNet 与 SAM 2 的 alpha 估计，处理发丝、玻璃、烟雾等半透明边界，输出像素级 Alpha 遮罩。',
  },
  {
    id: 'R2',
    title: '光影 + 阴影 + 几何联合一致',
    body: 'IC-Light 重打光、接触阴影生成与几何先验联合优化，消除「贴纸感」，让主体真正落进新场景。',
  },
  {
    id: 'R3',
    title: '执行计划 DAG 的稳定多轮交互',
    body: '以 DAG 编排七阶段管线，支持节点级版本管理、条件回滚与下游重跑，保证多轮指令下状态一致。',
  },
  {
    id: 'R4',
    title: '语音 + 空间指代的中文多模态交互',
    body: 'ASR + TTS 全链路中文交互，结合空间指代解析（「这里」「右边」）实现所见即所指的编辑。',
  },
];

const TOOLS = [
  { id: 'T01', name: '主体抠图', desc: 'BiRefNet 估计像素级 Alpha' },
  { id: 'T02', name: '光照估计', desc: '从场景推断光源方向与色温' },
  { id: 'T03', name: '重打光', desc: 'IC-Light 将主体融入目标光照' },
  { id: 'T04', name: '接触阴影', desc: '生成与地面接触的软阴影' },
  { id: 'T05', name: '色彩和谐化', desc: '统一前景背景的色调与颗粒' },
  { id: 'T06', name: 'Critic 评分', desc: 'VLM 五维度量化自检' },
  { id: 'T07', name: '执行计划', desc: 'DAG Planner 生成并调度节点链' },
  { id: 'T08', name: '语音交互', desc: 'ASR + TTS 中文语音回路' },
];

const METRICS = [
  { name: '工具选择准确率', value: '≥95%' },
  { name: '执行顺序正确率', value: '≥95%' },
  { name: '参数填参准确率', value: '≥90%' },
  { name: '端到端草稿出图耗时', value: '≤10 秒' },
  { name: '自检分数与主观评价相关性', value: '斯皮尔曼 ≥0.6' },
];

/** Research overview page (lazy loaded). */
export default function ResearchPage(): JSX.Element {
  const cardsRef = useReveal<HTMLDivElement>({ childSelector: '[data-reveal-item]', stagger: 90 });
  const toolsRef = useReveal<HTMLTableSectionElement>({ childSelector: '[data-reveal-item]', stagger: 55 });
  const metricsRef = useReveal<HTMLTableSectionElement>({ childSelector: '[data-reveal-item]', stagger: 60 });
  const pipelineRef = useReveal<HTMLDivElement>();

  return (
    <div className={styles.page ?? undefined} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className={styles.rHero} style={{ padding: '32px 32px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ fontSize: 15, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: 'linear-gradient(135deg, var(--green-d), var(--success))',
                display: 'inline-block',
              }}
            />
            ImageCompose
          </Link>
          <nav style={{ display: 'flex', gap: 8 }}>
            <Link to="/" className={styles.techChip}>
              演示
            </Link>
            <Link to="/workspace" className={styles.techChip}>
              工作台
            </Link>
          </nav>
        </div>
      </header>

      <section className={styles.rHero}>
        <div className={styles.rCardId}>研究方向</div>
        <h1 className={styles.rH1}>抠取与光影一致合成 · 研究总览</h1>
        <p className={styles.rSub}>
          围绕「把一个人放进另一个场景而不违和」这一问题，我们构建了从抠取、光影重建到多轮交互的完整研究管线。
        </p>
      </section>

      <section className={styles.rSection}>
        <div ref={cardsRef} className={styles.rCards}>
          {RESEARCH_CARDS.map((c) => (
            <div key={c.id} data-reveal-item className={`${styles.rCard} reveal`}>
              <div className={styles.rCardId}>{c.id}</div>
              <div className={styles.rCardTitle}>{c.title}</div>
              <div className={styles.rCardBody}>{c.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.rSection}>
        <div ref={pipelineRef} className={`${styles.rPipeline} reveal`}>
          <div className={styles.rCardId}>执行管线 · 七阶段</div>
          <div className={styles.rSvgWrap}>
            <svg viewBox="0 0 1000 120" width="1000" height="120" role="img" aria-label="七阶段管线">
              {STAGES.map((s, i) => {
                const x = 20 + i * 140;
                return (
                  <g key={s.id}>
                    <rect
                      x={x}
                      y={30}
                      width={120}
                      height={44}
                      rx={10}
                      fill={i % 2 === 0 ? '#DCE9E4' : '#315C52'}
                    />
                    <text
                      x={x + 60}
                      y={50}
                      textAnchor="middle"
                      fontSize={13}
                      fontWeight={700}
                      fill={i % 2 === 0 ? '#315C52' : '#FFFFFF'}
                    >
                      {STAGE_LABELS[s.id]}
                    </text>
                    <text
                      x={x + 60}
                      y={66}
                      textAnchor="middle"
                      fontSize={10}
                      fill={i % 2 === 0 ? '#48796B' : '#DCE9E4'}
                    >
                      {s.start}%–{s.end}%
                    </text>
                    {i < STAGES.length - 1 && (
                      <text x={x + 128} y={57} fontSize={14} fill="#777A7E">
                        →
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      <section className={styles.rSection}>
        <div className={styles.rCardId} style={{ marginBottom: 10 }}>
          工具链 T01–T08
        </div>
        <table className={styles.rTable}>
          <thead>
            <tr>
              <th>编号</th>
              <th>名称</th>
              <th>作用</th>
            </tr>
          </thead>
          <tbody ref={toolsRef}>
            {TOOLS.map((t) => (
              <tr key={t.id} data-reveal-item className="reveal">
                <td className={styles.rTableId}>{t.id}</td>
                <td>{t.name}</td>
                <td style={{ color: 'var(--ink-2)' }}>{t.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.rSection}>
        <div className={styles.rCardId} style={{ marginBottom: 10 }}>
          量化指标
        </div>
        <table className={styles.rTable}>
          <thead>
            <tr>
              <th>指标</th>
              <th>目标</th>
            </tr>
          </thead>
          <tbody ref={metricsRef}>
            {METRICS.map((m) => (
              <tr key={m.name} data-reveal-item className="reveal">
                <td>{m.name}</td>
                <td className={styles.rTableId}>{m.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.rSection}>
        <div className={styles.rCardId} style={{ marginBottom: 10 }}>
          技术栈
        </div>
        <div className={styles.techChips}>
          {['BiRefNet', 'SAM 2', 'IC-Light', 'Diffusion', 'VLM', 'ASR', 'TTS'].map((t) => (
            <span key={t} className={styles.techChip}>
              {t}
            </span>
          ))}
        </div>
      </section>

      <div className={styles.rCta}>
        <Link to="/" className={styles.techChip}>
          返回首页
        </Link>
        <Link to="/workspace" className={styles.techChip}>
          进入工作台
        </Link>
      </div>
    </div>
  );
}
