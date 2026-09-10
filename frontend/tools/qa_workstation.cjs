/* ImageCompose Workstation QA — focused on the new "通用 AI 软件" layout */
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
  const shot = async (name) => {
    await page.screenshot({ path: path.join(SHOTS, name) });
    report.steps.push(name);
  };
  const clickText = async (text) => {
    const ok = await page.evaluate((t) => {
      const all = [...document.querySelectorAll('button, a')];
      const el = all.find((e) => e.textContent.trim() === t || e.textContent.trim().startsWith(t));
      if (el) { el.scrollIntoView({ block: 'nearest' }); el.click(); return true; }
      return false;
    }, text);
    if (!ok) report.steps.push(`CLICK_MISS:${text}`);
    return ok;
  };

  // ---- 1. Workstation loads ----
  await page.goto(APP + '/workspace', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);
  await shot('ws_01_initial.png');

  // ---- 2. Read pipeline state ----
  const initialState = await page.evaluate(() => {
    const steps = [...document.querySelectorAll('[class*="wsStep"]')];
    const live = document.querySelector('[class*="wsLiveText"]');
    return {
      stepCount: steps.filter((s) => s.className.includes('wsStepLabel') === false).length,
      liveText: live?.textContent?.trim() || '',
      brand: document.querySelector('[class*="wsBrandTitle"]')?.textContent?.trim() || '',
      hasCommandBar: !!document.querySelector('[class*="wsInputRow"]'),
    };
  });
  report.steps.push('INITIAL:' + JSON.stringify(initialState));

  // ---- 3. Mid-run capture: wait 2-3s, then snapshot the timeline while running ----
  // The DAG runs on mount; capture early to see "running" state.
  await page.goto(APP + '/workspace', { waitUntil: 'networkidle2' });
  await sleep(2200);
  await shot('ws_02_timeline_running.png');
  const runningState = await page.evaluate(() => {
    const running = [...document.querySelectorAll('[class*="wsStepRunning"]')];
    const done = [...document.querySelectorAll('[class*="wsStepDone"]')];
    const live = document.querySelector('[class*="wsLiveText"]')?.textContent?.trim() || '';
    return { running: running.length, done: done.length, live };
  });
  report.steps.push('MID_RUN:' + JSON.stringify(runningState));

  // ---- 4. Wait for DAG to finish (full 7 steps × ~0.6-1.5s + render) ----
  await sleep(9000);
  await shot('ws_03_timeline_done.png');
  const doneState = await page.evaluate(() => {
    const running = [...document.querySelectorAll('[class*="wsStepRunning"]')];
    const done = [...document.querySelectorAll('[class*="wsStepDone"]')];
    const failed = [...document.querySelectorAll('[class*="wsStepFailed"]')];
    const live = document.querySelector('[class*="wsLiveText"]')?.textContent?.trim() || '';
    return { running: running.length, done: done.length, failed: failed.length, live };
  });
  report.steps.push('DONE_STATE:' + JSON.stringify(doneState));

  const waitForIdle = async (timeout = 20000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const idle = await page.evaluate(() => {
        const running = document.querySelectorAll('[class*="wsStepRunning"]').length;
        return running === 0;
      });
      if (idle) return true;
      await sleep(300);
    }
    return false;
  };

  // ---- helper: grab preview hash ----
  const grabPreviewHash = async () => page.evaluate(() => {
    const host = document.querySelector('[class*="wsCanvasHost"]');
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

  // ---- 5. Type a background switch command that is guaranteed different ----
  const beforeBg = await grabPreviewHash();
  await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="对 AI 助手说点什么"]');
    if (inp) {
      inp.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '把背景换成咖啡馆');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.keyboard.press('Enter');
  await waitForIdle();
  await shot('ws_04_cmd_cafe.png');
  const afterBg = await grabPreviewHash();
  const liveAfterBg = await page.evaluate(() => document.querySelector('[class*="wsLiveText"]')?.textContent?.trim() || '');
  report.steps.push(`CMD_BG:hashBefore=${beforeBg.hash} hashAfter=${afterBg.hash} lenBefore=${beforeBg.len} lenAfter=${afterBg.len} changed=${beforeBg.hash !== afterBg.hash || beforeBg.len !== afterBg.len} live="${liveAfterBg}"`);

  // ---- 6. Quick chip: "光线暗一点" — exposure ----
  await clickText('光线暗一点');
  await waitForIdle();
  await shot('ws_05_cmd_dark.png');
  const liveAfterDark = await page.evaluate(() => document.querySelector('[class*="wsLiveText"]')?.textContent?.trim() || '');
  report.steps.push(`CMD_DARK:live="${liveAfterDark}"`);

  // ---- 7. Right tabs: assets ----
  await clickText('🗂 资产');
  await sleep(400);
  await shot('ws_06_tab_assets.png');
  const assetInfo = await page.evaluate(() => {
    return {
      sections: [...document.querySelectorAll('[class*="wsAssetSectionTitle"]')].map((s) => s.textContent.trim()),
      bgPresets: document.querySelectorAll('[class*="wsPresetCard"]').length,
    };
  });
  report.steps.push('TAB_ASSETS:' + JSON.stringify(assetInfo));

  // ---- 8. Right tabs: params ----
  await clickText('⚙ 参数');
  await sleep(400);
  await shot('ws_07_tab_params.png');

  // ---- 9. Right tabs: chat — confirm messages exist ----
  await clickText('💬 对话');
  await sleep(400);
  const chatInfo = await page.evaluate(() => {
    return {
      bubbles: document.querySelectorAll('[class*="wsBubble"]').length,
      lastBubble: document.querySelectorAll('[class*="wsBubbleAgent"]').length > 0
        ? [...document.querySelectorAll('[class*="wsBubbleAgent"]')].pop()?.textContent?.trim().slice(0, 80)
        : 'none',
    };
  });
  report.steps.push('TAB_CHAT:' + JSON.stringify(chatInfo));
  await shot('ws_08_tab_chat.png');

  // ---- 10. Type into the command bar directly ----
  await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="对 AI 助手说点什么"]');
    if (inp) {
      inp.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '边缘延伸一下');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(200);
  // click the send button
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('发送'));
    if (btn) btn.click();
  });
  await waitForIdle();
  await shot('ws_09_cmd_feather.png');
  const liveAfterFeather = await page.evaluate(() => document.querySelector('[class*="wsLiveText"]')?.textContent?.trim() || '');
  report.steps.push(`CMD_FEATHER:live="${liveAfterFeather}"`);

  // ---- 11. Click a step in the timeline to open version history popup ----
  await page.evaluate(() => {
    const steps = [...document.querySelectorAll('[data-step-id]')];
    const first = steps.find((s) => s.getAttribute('data-step-id') === 'n1' || s.className.includes('wsStepDone'));
    if (first) first.click();
  });
  await sleep(800);
  await shot('ws_10_step_popup.png');
  const popupInfo = await page.evaluate(() => {
    const modal = document.querySelector('[data-testid="node-modal"]');
    return {
      hasModal: !!modal,
      title: modal?.querySelector('[data-testid="node-modal-title"]')?.textContent?.trim() || '',
    };
  });
  report.steps.push('STEP_POPUP:' + JSON.stringify(popupInfo));
  // close popup
  await page.evaluate(() => {
    const modal = document.querySelector('[data-testid="node-modal"]');
    if (modal) modal.click();
  });
  await sleep(400);

  // ---- 12. Verify command bar at bottom + enter key submits ----
  const cmdBar = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="对 AI 助手说点什么"]');
    return {
      hasInput: !!input,
      hasMic: !!document.querySelector('[class*="wsMic"]'),
      hasSend: !!document.querySelector('[class*="wsSend"]'),
      chips: [...document.querySelectorAll('[class*="wsChip"]')].map((c) => c.textContent.trim()),
    };
  });
  report.steps.push('CMD_BAR:' + JSON.stringify(cmdBar));

  // ---- 13. Animation audit on workstation ----
  const anim = await page.evaluate(() => {
    const list = document.getAnimations ? document.getAnimations() : [];
    return {
      total: list.length,
      running: list.filter((a) => a.playState === 'running').length,
      infinite: list.filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity).length,
    };
  });
  report.steps.push(`ANIM: total=${anim.total} running=${anim.running} infinite=${anim.infinite}`);

  // ---- 14. Final glamour shot ----
  await sleep(500);
  await shot('ws_99_final.png');

  await browser.close();
  fs.writeFileSync(path.join(SHOTS, 'ws_report.json'), JSON.stringify(report, null, 2));
  console.log('WS_QA DONE. steps=' + report.steps.length, 'consoleErrors=' + report.consoleErrors.length, 'reqFail=' + report.requestFailed.length);
})().catch((e) => { console.error('WS_QA FATAL', e.message); process.exit(1); });
