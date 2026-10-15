import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const cacheDir = await mkdtemp(path.join(tmpdir(), 'roulette-vite-cache-'));
const server = await createServer({
  cacheDir,
  server: { host: 'localhost', port: 0, strictPort: false, open: false },
});
let browser;

try {
  await server.listen();
  const baseURL = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const simd of [true, false]) {
    const page = await browser.newPage();
    if (!simd) await page.addInitScript(() => { WebAssembly.validate = () => false; });
    const errors = [];
    const binaries = [];
    const pageError = new Promise(resolve => {
      page.on('pageerror', error => { errors.push(error.message); resolve(); });
    });
    page.on('response', response => {
      if (new URL(response.url()).pathname.endsWith('.wasm')) {
        binaries.push(response.body().then(body => ({
          path: new URL(response.url()).pathname,
          status: response.status(),
          type: response.headers()['content-type'],
          magic: body.subarray(0, 4).toString('hex'),
        })));
      }
    });

    try {
      await page.goto(baseURL);
      await Promise.race([
        pageError,
        page.waitForFunction(() => window.roulette?.isReady && !document.querySelector('#loading'), null, { timeout: 10000 }),
      ]);
      const state = await page.evaluate(() => ({
        ready: window.roulette?.isReady,
        loading: document.querySelector('#loading')?.textContent,
        enabled: !document.querySelector('#btnStart').disabled,
      }));
      const responses = await Promise.all(binaries);
      assert.equal(state.ready, true, JSON.stringify({ simd, state, errors, responses }, null, 2));
      assert.equal(state.loading, undefined, 'the loading overlay must disappear');
      assert.equal(state.enabled, true, 'the start button must become enabled');
      assert.deepEqual(errors, [], 'dev startup must not throw a browser error');
      assert.equal(responses.length, 1, 'one real physics binary must be loaded');
      assert.equal(responses[0].status, 200);
      assert.match(responses[0].type, /^application\/wasm/);
      assert.equal(responses[0].magic, '0061736d', 'HTML fallback must never be used as WASM');
      assert.match(responses[0].path, simd ? /Box2D\.simd\.wasm$/ : /Box2D\.wasm$/);

      await page.locator('#btnStart').click();
      await page.waitForFunction(() => document.querySelector('#settings').dataset.state === 'running');
      await page.locator('#btnReset').click();
      assert.equal(await page.locator('#settings').getAttribute('data-state'), 'ready');
      console.log(`PASS fresh Vite cache: ${simd ? 'SIMD' : 'fallback'} WASM, ready, start and reset`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
