import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Set PLAYWRIGHT_MODULE to an existing playwright-core module if it is not installed locally.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:4173';
const artifactDir = path.resolve('research/browser-smoke');
await mkdir(artifactDir, { recursive: true });

const scenarios = [
  { map: 0, title: 'Wheel of fortune', mode: 'first', range: [0, 0], winners: 1 },
  { map: 1, title: 'BubblePop', mode: 'last', range: [5, 5], winners: 1 },
  { map: 2, title: 'Pot of greed', mode: 'multi', range: [1, 2], winners: 2 },
  { map: 3, title: 'Yoru ni Kakeru', mode: 'custom', range: [2, 2], winners: 1 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const results = [];
try {
  await Promise.all(scenarios.map(async scenario => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    const failedRequests = [];
    const httpErrors = [];
    const externalRequests = [];
    const started = Date.now();
    let raceStarted;
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() }); });
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) externalRequests.push(request.url());
    });
    const result = { ...scenario, status: 'running' };
    try {
      await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 20000 });
      await page.locator('#loading').waitFor({ state: 'detached', timeout: 20000 });
      if (await page.locator('#closeNotice').isVisible()) await page.locator('#closeNotice').click();
      await page.locator('#sltMap').selectOption(String(scenario.map));
      await page.locator('#in_names').fill('수박*2,키위*2,귤*2');
      await page.locator('#in_names').blur();
      await page.waitForFunction(() => window.roulette.getCount() === 6);
      if (scenario.mode === 'custom') {
        await page.locator('#in_winningRank').fill('3');
        await page.locator('#in_winningRank').dispatchEvent('change');
      } else {
        await page.locator(`[data-winner="${scenario.mode}"]`).click();
        if (scenario.mode === 'multi') {
          await page.locator('#in_rangeStart').fill('2');
          await page.locator('#in_rangeStart').dispatchEvent('change');
          await page.locator('#in_rangeEnd').fill('3');
          await page.locator('#in_rangeEnd').dispatchEvent('change');
        }
      }
      const readyState = await page.evaluate(() => ({ count: window.roulette.getCount(), range: window.roulette.getWinnerRange(), map: window.roulette.getCurrentMap(), recording: document.querySelector('#chkAutoRecording').checked }));
      assert.deepEqual(readyState.range, { start: scenario.range[0], end: scenario.range[1] });
      assert.equal(readyState.recording, false);
      assert.equal(readyState.map.title, scenario.title);
      await page.evaluate(() => {
        window.__smokeGoal = null;
        window.roulette.addEventListener('goal', event => { window.__smokeGoal = event.detail; }, { once: true });
        window.roulette.setSpeed(15);
      });
      raceStarted = Date.now();
      await page.locator('#btnStart').click();
      await page.waitForFunction(() => !!window.__smokeGoal, null, { timeout: 90000 });
      result.raceMs = Date.now() - raceStarted;
      result.goal = await page.evaluate(() => window.__smokeGoal);
      assert.equal(result.goal.winners.length, scenario.winners);
      assert.ok(result.goal.winners.every(name => ['수박', '키위', '귤'].includes(name)));
      const announcement = await page.locator('#announcement').textContent();
      assert.equal(announcement, `당첨: ${result.goal.winners.join(', ')}`);
      result.announcement = announcement;
      await page.waitForFunction(() => document.querySelector('#settings').dataset.state === 'finished' && !document.querySelector('#settings').classList.contains('hide'), null, { timeout: 10000 });
      await page.screenshot({ path: path.join(artifactDir, `map-${scenario.map}-${scenario.mode}.png`) });
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(failedRequests, []);
      assert.deepEqual(httpErrors, []);
      assert.deepEqual(externalRequests, []);
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.error = error.stack || String(error);
      result.raceMs = raceStarted ? Date.now() - raceStarted : null;
      result.diagnostics = await page.evaluate(() => {
        const roulette = window.roulette;
        return {
          announcement: document.querySelector('#announcement')?.textContent,
          currentMap: roulette?.getCurrentMap(),
          range: roulette?.getWinnerRange(),
          active: roulette?._marbles?.map(marble => ({ id: marble.id, name: marble.name, x: marble.x, y: marble.y, skill: marble.skill })),
          completed: roulette?._winners?.map(marble => marble.name),
        };
      }).catch(() => null);
      await page.screenshot({ path: path.join(artifactDir, `map-${scenario.map}-failure.png`) }).catch(() => {});
    } finally {
      Object.assign(result, { durationMs: Date.now() - started, pageErrors, failedRequests, httpErrors, externalRequests });
      results.push(result);
      console.log(JSON.stringify(result));
      await page.close();
    }
  }));
} finally {
  await browser.close();
  results.sort((a, b) => a.map - b.map);
  await writeFile(path.join(artifactDir, 'results.json'), `${JSON.stringify({ baseURL, generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
}
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
