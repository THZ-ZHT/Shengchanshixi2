/* ImageCompose QA walkthrough — puppeteer-core driving dedicated Chrome */
const puppeteer = require('C:/Users/THZ/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const SHOTS = 'D:/ZHT/生产实习/frontend/qa/shots';
const CHROME = 'C:/Users/THZ/.agent-browser/browsers/chrome-153.0.8010.36/chrome.exe';
const APP = 'http://127.0.0.1:4173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const report = { consoleErrors: [], requestFailed: [], steps: [] };
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.includes('favicon')) report.requestFailed.push(`${r.failure()?.errorText} ${u.slice(0, 120)}`);
  });
  const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, name) }); report.steps.push(name); };
  const clickText = async (text) => {
    const ok = await page.evaluate((t) => {
      const all = [...document.querySelectorAll('button, a, [role=button], .chip, span, div')];
      const leaf = all.filter((e) => e.childElementCount === 0 && e.textContent.trim().includes(t));
      const interactive = leaf.filter((e) => e.tagName === 'BUTTON' || e.tagName === 'A' || e.hasAttribute('role') || e.classList.contains('chip'));
      const el = interactive[0] || leaf[0];
      if (el) { el.scrollIntoView({ block: 'nearest' }); el.click(); return true; } return false;
    }, text);
    if (!ok) report.steps.push(`CLICK_MISS:${text}`);
    return ok;
  };

  await page.goto(APP + '/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await shot('10_stateA.png');

  // A -> B
  await clickText('试用示例图');
  await sleep(500);
  await shot('11_stateB_early.png');   // fix check: Processing visible with scanline
  await sleep(1200);
  await shot('12_stateB_late.png');
  // wait into C
  await sleep(2600);
  await shot('13_stateC_initial.png');

  // drag through stages
  await page.mouse.move(420, 500);
  await page.mouse.down();
  const steps = [ [520, '14_extract.png'], [640, '15_compose.png'], [800, '16_illuminate.png'], [980, '17_ground.png'], [1160, '18_harmonize.png'] ];
  for (const [x, name] of steps) {
    await page.mouse.move(x, 500, { steps: 6 });
    await sleep(450);
    await shot(name);
  }
  // push to 100%
  for (const x of [1280, 1380, 1435]) { await page.mouse.move(x, 500, { steps: 4 }); await sleep(250); }
  await page.mouse.up();
  await sleep(2200);
  await shot('19_final.png');

  // enter workspace
  await clickText('进入工作台');
  await sleep(1500);
  await shot('20_workspace.png');

  // wait initial DAG run
  await sleep(8000);
  await shot('21_dag_done.png');

  // quick command 1 — use a command that maps to a DIFFERENT preset than the
  // workspace default (bg_lake) so the re-composition is actually visible.
  const grabPreviewHash = async () => page.evaluate(() => {
    const host = document.querySelector('[class*="canvasHost"], [class*="previewHost"]');
    const imgs = host ? [...host.querySelectorAll('img')] : [...document.querySelectorAll('img')];
    const r = imgs
      .filter((i) => i.alt && (i.alt.includes('成片') || i.alt.includes('合成结果') || i.alt.includes('合成 ·')))
      .sort((a, b) => (b.src || '').length - (a.src || '').length)[0];
    if (!r) return { src: null, len: 0, hash: 0, alt: 'none' };
    const s = r.src || '';
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return { src: s.slice(0, 50), len: s.length, hash: h, alt: r.alt };
  });
  const before = await grabPreviewHash();
  await page.evaluate(() => {
    const inp = document.querySelector('input[type=text][placeholder*="输入指令"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '把背景换成咖啡馆');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const send = btns.find((b) => b.textContent.trim() === '发送');
    if (send) send.click();
  });
  // wait long enough for the full 7-node DAG (each ~600-1500ms) plus composition render.
  await sleep(14000);
  await shot('22_cmd_cafe.png');
  const after = await grabPreviewHash();
  const msgStream = await page.evaluate(() => {
    return [...document.querySelectorAll('[class*="msgRow"], [class*="bubble"]')]
      .slice(-8)
      .map((m) => m.textContent.trim().replace(/\s+/g, ' ').slice(0, 60));
  });
  report.steps.push(`BG_SWITCH:hashBefore=${before.hash} hashAfter=${after.hash} lenBefore=${before.len} lenAfter=${after.len} changed=${before.hash !== after.hash || before.len !== after.len}`);
  report.steps.push(`BG_MSGS:${JSON.stringify(msgStream)}`);

  // quick command 2 via input box (AgentPanel input, matched by placeholder)
  const typed = await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="输入指令"]');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    inp.focus();
    setter.set.call(inp, '光线太冷了');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return inp.tagName;
  });
  report.steps.push('TYPED:' + String(typed));
  if (typed) {
    await page.keyboard.press('Enter');
    await sleep(8000);
    await shot('23_cmd_warm.png');
  }

  // quick command 3: rollback chip
  await clickText('换回上一版背景');
  await sleep(9000);
  await shot('24_cmd_rollback.png');

  // AI image gen panel (real preset names: 傍晚湖边 / 咖啡馆 / 城市夜色 / 森林)
  await clickText('AI 生图');
  await sleep(600);
  await clickText('森林');
  await sleep(400);
  const genBtn = await clickText('生成');
  await sleep(6000);
  await shot('25_aigen.png');

  // AI modeling panel
  await clickText('AI 建模');
  await sleep(9000);
  await page.evaluate(() => { const el = document.querySelector('aside'); if (el) el.scrollTop = el.scrollHeight; });
  await sleep(400);
  const glbCanvas = await page.evaluate(() => document.querySelectorAll('aside canvas').length);
  report.steps.push(`GLB_CANVAS:${glbCanvas}`);
  await shot('26_model_glb.png');

  // local heightmap tab
  const localTab = await clickText('图生 3D');
  if (localTab) {
    await sleep(600);
    await clickText('生成网格');
    await sleep(4500);
    await page.evaluate(() => { const el = document.querySelector('aside'); if (el) el.scrollTop = el.scrollHeight; });
    await sleep(400);
    const meshCanvas = await page.evaluate(() => document.querySelectorAll('aside canvas').length);
    report.steps.push(`MESH_CANVAS:${meshCanvas}`);
    await shot('27_model_heightmap.png');
  }

  // P3: compare slider (原图 <-> 成片)
  await clickText('对比');
  await sleep(900);
  await shot('30_compare.png');

  // P2: fullscreen 3D scene
  await clickText('AI 生成示例');
  await sleep(400);
  await clickText('全屏查看三维场景');
  await sleep(3000);
  await shot('31_3d_fullscreen.png');
  await clickText('关闭');
  await sleep(600);

  // research page
  await page.goto(APP + '/research', { waitUntil: 'networkidle2' });
  await sleep(900);
  await shot('28_research.png');

  // showcase debug overlay + keyboard check
  await page.goto(APP + '/', { waitUntil: 'networkidle2' });
  await clickText('试用示例图');
  await sleep(5200);
  await page.keyboard.press('ArrowRight');
  await sleep(600);
  await shot('29_keyboard.png');

  // ---- real user upload: drop an arbitrary photo, walk the full pipeline ----
  await page.goto(APP + '/', { waitUntil: 'networkidle2' });
  await sleep(600);
  const fileInput = await page.$('input[type=file]');
  if (fileInput) {
    await fileInput.uploadFile(path.resolve(__dirname, '..', 'qa', 'test_subject.jpg'));
    report.steps.push('UPLOAD:OK');
  } else {
    report.steps.push('UPLOAD:NO_INPUT');
  }
  // wait for reading + in-browser matting + composing + State B overlay
  await sleep(6000);
  await shot('32_user_stateB.png');
  // drag into interactive + mid pipeline
  await page.mouse.move(420, 500, { steps: 4 });
  await sleep(150);
  await page.mouse.down();
  for (const x of [560, 720, 900, 1080, 1260, 1400]) {
    await page.mouse.move(x, 500, { steps: 4 });
    await sleep(110);
  }
  await page.mouse.up();
  await sleep(900);
  await shot('33_user_mid.png');
  // drag all the way to final
  await page.mouse.move(420, 500, { steps: 4 });
  await page.mouse.down();
  for (const x of [700, 1000, 1300, 1400]) {
    await page.mouse.move(x, 500, { steps: 4 });
    await sleep(100);
  }
  await page.mouse.up();
  await sleep(1200);
  await shot('34_user_final.png');
  const userImgInfo = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    const o = imgs.find((i) => i.alt && i.alt.includes('原图'));
    return o ? { src: o.src.slice(0, 40), alt: o.alt } : null;
  });
  report.steps.push('USER_IMG:' + JSON.stringify(userImgInfo));

  // ---- verify uploaded image flows into workspace (not demo) ----
  await clickText('进入工作台');
  await sleep(7000);
  await shot('35_user_workspace.png');
  const wsInfo = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    const find = (pred) => imgs.find(pred);
    const src = find((i) => i.alt && i.alt.includes('原图'));
    const result = find((i) => i.alt && (i.alt.includes('成片') || i.alt.includes('合成结果')));
    return {
      source: src ? src.src.slice(0, 30) : null,
      sourceAlt: src ? src.alt : null,
      result: result ? result.src.slice(0, 30) : null,
    };
  });
  report.steps.push('WS_SOURCE:' + JSON.stringify(wsInfo));

  // ---- new: verify uploaded-image command actually re-composes background ----
  const userBefore = await grabPreviewHash();
  await page.evaluate(() => {
    const inp = document.querySelector('input[type=text][placeholder*="输入指令"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '把背景换成咖啡馆');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const send = btns.find((b) => b.textContent.trim() === '发送');
    if (send) send.click();
  });
  await sleep(14000);
  await shot('35b_user_bg_switch.png');
  const userAfter = await grabPreviewHash();
  report.steps.push(`USER_BG_SWITCH:hashBefore=${userBefore.hash} hashAfter=${userAfter.hash} lenBefore=${userBefore.len} lenAfter=${userAfter.len} changed=${userBefore.hash !== userAfter.hash || userBefore.len !== userAfter.len}`);

  // ---- new: AI 生图面板选背景 + 生成（验证不回归 demo 主体）----
  await clickText('AI 生图');
  await sleep(600);
  await clickText('城市夜色');
  await sleep(400);
  const genBefore = await grabPreviewHash();
  await clickText('生成');
  await sleep(6000);
  await shot('35c_ws_aigen.png');
  const genAfter = await grabPreviewHash();
  report.steps.push(`WS_AIGEN:hashBefore=${genBefore.hash} hashAfter=${genAfter.hash} lenBefore=${genBefore.len} lenAfter=${genAfter.len} changed=${genBefore.hash !== genAfter.hash || genBefore.len !== genAfter.len}`);

  // play the transition animation and capture mid-frame
  await clickText('结果');
  await sleep(300);
  await clickText('播放过渡');
  await sleep(400);
  await shot('36_user_play.png');
  await sleep(800);
  await shot('37_user_play_done.png');

  // ---- new: subject animation styles + natural language ----
  // turn off compare mode so we can see the overlay
  await clickText('结果');
  await sleep(400);
  // helper: set animation via puppeteer page.select to trigger React onChange
  const setAnim = async (value) => {
    return page.select('select', value);
  };
  for (const [val, name] of [
    ['float', '38_anim_float.png'],
    ['breathe', '39_anim_breathe.png'],
    ['pulse', '40_anim_pulse.png'],
    ['spin', '41_anim_spin.png'],
    ['walk', '42_anim_walk.png'],
    ['swing', '43_anim_swing.png'],
  ]) {
    await setAnim(val);
    await sleep(900);
    await shot(name);
  }
  await setAnim('none');
  await sleep(400);

  // natural language: combined intent via 让人物 ... 并且 ...
  await page.evaluate(() => {
    const inp = document.querySelector('input[type=text][placeholder*="输入指令"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '让人物轻轻浮动，并且把背景换成傍晚');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const send = btns.find((b) => b.textContent.includes('发送'));
    if (send) send.click();
  });
  await sleep(3000);
  await shot('44_nl_combo.png');
  const nlInfo = await page.evaluate(() => {
    const msgs = [...document.querySelectorAll('[class*="msgRow"], [class*="bubble"]')];
    return msgs.slice(-4).map((m) => m.textContent.trim().slice(0, 50));
  });
  report.steps.push('NL_REPLY:' + JSON.stringify(nlInfo));

  // ---- new: custom background upload ----
  // generate a tiny 4x4 red jpeg as a custom background
  const tmpBg = path.resolve(__dirname, '..', 'qa', 'custom_bg.jpg');
  require('fs').writeFileSync(tmpBg, Buffer.from([
    0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xdb,0,0x43,0,8,6,6,7,6,5,8,7,7,7,9,9,8,10,12,20,13,12,11,11,12,25,18,19,15,20,29,26,31,30,29,26,28,28,32,36,46,39,32,34,44,35,28,28,40,55,41,44,48,49,52,52,52,31,39,57,61,56,50,60,46,51,52,50,0xff,0xc0,0,0xb,8,0,4,0,4,1,1,0x11,0,0xff,0xc4,0,0x14,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,9,0xff,0xc4,0,0x14,0x10,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0xff,0xda,0,8,1,1,0,0,0x3f,0,0x37,0xff,0xd9
  ]));
  // pick the LAST file input on the page (ImageGenPanel's hidden upload)
  const fileInputs = await page.$$('input[type=file]');
  const customInput = fileInputs[fileInputs.length - 1];
  if (customInput) {
    await customInput.uploadFile(tmpBg);
    report.steps.push('CUSTOM_BG:OK');
  } else {
    report.steps.push('CUSTOM_BG:NO_INPUT');
  }
  await sleep(2500);
  await shot('45_custom_bg.png');

  // ---- new: workspace person upload + animation preview toggle + asset ops ----
  // 1. upload another person via the workspace "上传人像" button
  const personInput = await page.evaluateHandle(() => {
    const buttons = [...document.querySelectorAll('button')];
    const upload = buttons.find((b) => b.textContent.trim() === '上传人像');
    return upload;
  });
  if (personInput?.asElement) {
    await personInput.asElement().click();
    await sleep(300);
    // find the FIRST file input on the workspace page (UploadCard's hidden input is gone here)
    const wsFileInputs = await page.$$('input[type=file]');
    const personUploadInput = wsFileInputs[0];
    if (personUploadInput) {
      await personUploadInput.uploadFile(path.resolve(__dirname, '..', 'qa', 'test_subject.jpg'));
      report.steps.push('PERSON_UPLOAD:OK');
    }
  }
  await sleep(4000);
  await shot('46_ws_person.png');

  // 2. enable animation preview toggle + pick a style
  await page.select('select', 'pulse');
  await sleep(400);
  const toggleInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const toggle = btns.find((b) => b.textContent.trim().startsWith('动画预览'));
    if (!toggle) return { found: false };
    toggle.click();
    return { found: true, active: toggle.className.includes('Active') || toggle.className.includes('Active'.toLowerCase()) };
  });
  report.steps.push('ANIM_TOGGLE:' + JSON.stringify(toggleInfo));
  await sleep(800);
  await shot('47_anim_preview_on.png');
  // toggle off
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const toggle = btns.find((b) => b.textContent.trim().startsWith('动画预览'));
    if (toggle) toggle.click();
  });
  await sleep(400);

  // 3. hover an asset thumbnail to surface the operations menu
  const hoverInfo = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('[class*="assetThumbWrap"]')];
    if (wraps.length === 0) return { count: 0 };
    const target = wraps[0];
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    return { count: wraps.length, x: rect.x, y: rect.y };
  });
  report.steps.push('HOVER:' + JSON.stringify(hoverInfo));
  await sleep(300);
  await page.mouse.move(hoverInfo.x + 20, hoverInfo.y + 20);
  await sleep(400);
  await shot('48_asset_ops.png');

  // ---- animation audit (A: motion system) ----
  for (const [name, url] of [['/', 'home'], ['/workspace', 'workspace'], ['/research', 'research']]) {
    await page.goto(APP + name, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const anim = await page.evaluate(() => {
      const list = document.getAnimations ? document.getAnimations() : [];
      const names = {};
      list.forEach((a) => {
        const n = (a.animationName || (a.effect && a.effect.getKeyframes && 'css') || 'unknown');
        if (n && n !== 'css' && n !== 'unknown') names[n] = (names[n] || 0) + 1;
      });
      return {
        total: list.length,
        running: list.filter((a) => a.playState === 'running').length,
        infinite: list.filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity).length,
        names: Object.keys(names).slice(0, 12),
      };
    });
    report.steps.push(`ANIM@${url}: total=${anim.total} running=${anim.running} infinite=${anim.infinite} [${anim.names.join(',')}]`);
  }

  // background ambient layer + reveal check
  await page.goto(APP + '/', { waitUntil: 'networkidle2' });
  await sleep(1200);
  const bg = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div')].filter((d) => {
      const s = getComputedStyle(d);
      return s.position === 'fixed' && (s.zIndex === '-1' || s.zIndex === '0') && d.getBoundingClientRect().width > 1000;
    });
    return cands.length;
  });
  report.steps.push(`BG_LAYER:${bg}`);

  await browser.close();
  fs.writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify(report, null, 2));
  console.log('QA DONE. steps=' + report.steps.length, 'consoleErrors=' + report.consoleErrors.length, 'reqFail=' + report.requestFailed.length);
})().catch((e) => { console.error('QA FATAL', e.message); process.exit(1); });
