import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:5173';
const artifactDir = 'research/skill-controls';
await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling'] });
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 15000 });
  assert.equal(await page.locator('#notice, #btnNotice, #btnShop, a[href*="marblerouletteshop"]').count(), 0);
  assert.ok(await page.locator('#btnStart').isEnabled());
  assert.equal(await page.locator('#skillCooldownValue').textContent(), '4.6초');
  await page.screenshot({ path: `${artifactDir}/desktop.png` });
  checks.push('no Shop or notice flow; ready on first visit');

  async function setRange(selector, value) {
    await page.locator(selector).evaluate((input, next) => {
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
  }
  await setRange('#skillCooldown', 0.5);
  await setRange('#skillChance', 100);
  await setRange('#skillStrength', 2);
  await page.locator('#skillMaxUses').fill('1');
  await page.locator('#skillMaxUses').blur();
  assert.deepEqual(await page.evaluate(() => window.options.skillSettings), { cooldownMs: 500, chancePercent: 100, maxUses: 1, strength: 2 });
  assert.match(await page.locator('#skillSummary').textContent(), /0.5초.*100%.*최대 1회/);
  await page.reload();
  await page.locator('#loading').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#skillCooldown').inputValue(), '0.5');
  assert.equal(await page.locator('#skillChance').inputValue(), '100');
  assert.equal(await page.locator('#skillStrengthValue').textContent(), '2배');
  assert.equal(await page.locator('#skillMaxUses').inputValue(), '1');
  checks.push('four controls bind to engine settings and persist across reloads');

  await page.evaluate(() => {
    window.__skillHits = [];
    const physics = window.roulette.physics;
    const impact = physics.impact.bind(physics);
    physics.impact = id => { window.__skillHits.push(id); impact(id); };
  });
  await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.__skillHits.length === 6, null, { timeout: 5000 });
  await page.waitForTimeout(1200);
  const hits = await page.evaluate(() => window.__skillHits);
  assert.equal(hits.length, 6);
  assert.equal(new Set(hits).size, 6);
  await page.locator('#btnReset').click();
  checks.push('100% chance invokes real physics once per marble and respects the one-use cap');

  await setRange('#skillChance', 0);
  await page.evaluate(() => { window.__skillHits = []; });
  await page.locator('#btnStart').click();
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.__skillHits.length), 0);
  await page.locator('#btnReset').click();
  checks.push('0% chance produces no skill activations');

  await page.locator('#chkSkill').uncheck();
  assert.ok(await page.locator('#skillCooldown').isDisabled());
  assert.ok(await page.locator('#btnSkillDefaults').isDisabled());
  assert.equal(await page.locator('#skillSummary').textContent(), '스킬이 꺼져 있습니다.');
  await page.locator('#chkSkill').check();
  await page.locator('#btnSkillDefaults').click();
  assert.deepEqual(await page.evaluate(() => window.options.skillSettings), { cooldownMs: 4600, chancePercent: 2, maxUses: 0, strength: 1 });
  checks.push('skill off disables controls; defaults restore all four settings');

  for (const width of [320, 390, 750, 751, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    if (width <= 750 && await page.locator('#extraSettings').getAttribute('class').then(value => value.includes('collapsed'))) await page.locator('#btnToggleSettings').click();
    const panel = await page.locator('#settings').boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1, `panel overflows at ${width}px`);
    const field = await page.locator('#skillSettings').boundingBox();
    for (const id of ['skillCooldown', 'skillChance', 'skillStrength', 'skillMaxUses']) {
      const box = await page.locator(`#${id}`).boundingBox();
      assert.ok(box.x >= field.x && box.x + box.width <= field.x + field.width, `${id} overflows at ${width}px`);
    }
    if (width === 390) await page.screenshot({ path: `${artifactDir}/mobile.png` });
  }
  checks.push('controls fit desktop and mobile layouts at 320–1440px');

  await page.evaluate(() => localStorage.setItem('mbr_skill_settings', '{invalid json'));
  await page.reload();
  await page.locator('#loading').waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => window.options.skillSettings), { cooldownMs: 4600, chancePercent: 2, maxUses: 0, strength: 1 });
  assert.deepEqual(errors, []);
  checks.push('invalid saved settings recover to defaults without page errors');
  const result = { checks, pageErrors: errors, status: 'passed' };
  await writeFile(`${artifactDir}/results.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
