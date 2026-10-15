import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'roulette-skills-'));

for (const source of [
  'options', 'skillTrigger', 'marble', 'physics-box2d', 'data/constants',
  'utils/Vector', 'utils/utils', 'utils/transformGuard',
]) {
  const input = await readFile(new URL(`../src/${source}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  const destination = join(directory, `${source}.mjs`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, outputText
    .replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, 'from $1$2.mjs$1')
    .replace("'box2d-wasm'", JSON.stringify(import.meta.resolve('box2d-wasm'))));
}

const { default: options, DEFAULT_SKILL_SETTINGS, normalizeSkillSettings } =
  await import(pathToFileURL(join(directory, 'options.mjs')).href);
const { SkillTrigger } = await import(pathToFileURL(join(directory, 'skillTrigger.mjs')).href);
const { Marble } = await import(pathToFileURL(join(directory, 'marble.mjs')).href);
const { Skills } = await import(pathToFileURL(join(directory, 'data/constants.mjs')).href);
const { Box2dPhysics } = await import(pathToFileURL(join(directory, 'physics-box2d.mjs')).href);
after(() => rm(directory, { recursive: true, force: true }));

function settings(overrides = {}) {
  return { ...DEFAULT_SKILL_SETTINGS, ...overrides };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('skill settings preserve defaults and bound persisted or programmatic inputs', () => {
  assert.deepEqual(normalizeSkillSettings(), settings());
  assert.deepEqual(normalizeSkillSettings(null), settings());
  assert.deepEqual(normalizeSkillSettings('invalid'), settings());
  assert.deepEqual(normalizeSkillSettings({
    cooldownMs: NaN, chancePercent: Infinity, maxUses: '3', strength: -Infinity,
  }), settings());
  assert.deepEqual(normalizeSkillSettings({
    cooldownMs: 50, chancePercent: 200, maxUses: 2.9, strength: 5,
  }), { cooldownMs: 500, chancePercent: 100, maxUses: 2, strength: 3 });
  assert.deepEqual(normalizeSkillSettings({
    cooldownMs: 20000, chancePercent: -1, maxUses: -1, strength: 0,
  }), { cooldownMs: 10000, chancePercent: 0, maxUses: 0, strength: 0.25 });
  assert.equal(normalizeSkillSettings({ maxUses: 200 }).maxUses, 100);
  assert.ok(Object.isFrozen(DEFAULT_SKILL_SETTINGS));
  assert.notEqual(options.skillSettings, DEFAULT_SKILL_SETTINGS);
  assert.ok(!Object.isFrozen(options.skillSettings));
});

test('default settings preserve original cooldowns and probabilities across normalized weights', () => {
  for (const weight of [0.1, 0.6, 1, 1.1]) {
    const trigger = new SkillTrigger(settings(), weight, () => 0.5);
    close(trigger.intervalMs, 1000 + (1 - weight) * 4000);
    close(trigger.probability, 0.2 * weight);
    close(trigger.remainingMs, trigger.intervalMs / 2);
  }
});

test('configured cooldown and chance retain weight bias while bounding probability and invalid weights', () => {
  const selected = settings({ cooldownMs: 9200, chancePercent: 37 });
  const ordinary = new SkillTrigger(selected, 0.1, () => 0.25);
  close(ordinary.intervalMs, 9200);
  close(ordinary.remainingMs, 2300);
  close(ordinary.probability, 0.37);
  const heavy = new SkillTrigger(selected, 1.1, () => 0);
  close(heavy.intervalMs, 1200);
  assert.equal(heavy.probability, 1);
  close(new SkillTrigger(settings(), NaN).intervalMs, 1000);
  close(new SkillTrigger(settings(), -100).intervalMs, 4600);
  close(new SkillTrigger(settings(), 100).intervalMs, 600);
});

test('first check waits its randomized delay and each subsequent check waits the full cooldown', () => {
  const rolls = [0.5, 0.9, 0.1, 0.1];
  const trigger = new SkillTrigger(settings({ cooldownMs: 1000, chancePercent: 50 }), 0.1, () => rolls.shift());
  assert.equal(trigger.update(499), false);
  assert.equal(rolls.length, 3);
  assert.equal(trigger.update(1), false);
  assert.equal(trigger.uses, 0);
  assert.equal(trigger.update(999), false);
  assert.equal(trigger.update(1), true);
  assert.equal(trigger.uses, 1);
  assert.equal(trigger.update(999), false);
  assert.equal(trigger.update(1), true);
  assert.equal(trigger.uses, 2);
});

test('0 percent never activates and 100 percent activates at each eligible check', () => {
  const never = new SkillTrigger(settings({ chancePercent: 0 }), 0.1, () => 0);
  for (let index = 0; index < 10; index++) assert.equal(never.update(4600), false);
  assert.equal(never.uses, 0);
  const always = new SkillTrigger(settings({ chancePercent: 100 }), 0.1, () => 0.999);
  assert.equal(always.update(4600), true);
  assert.equal(always.update(4599), false);
  assert.equal(always.update(1), true);
});

test('successful activations alone consume a per-marble cap; zero remains unlimited', () => {
  const rolls = [0, 0.9, 0.1, 0.1];
  const limited = new SkillTrigger(settings({ chancePercent: 50, maxUses: 2 }), 0.1, () => rolls.shift());
  assert.equal(limited.update(0), false);
  assert.equal(limited.uses, 0);
  assert.equal(limited.exhausted, false);
  assert.equal(limited.update(4600), true);
  assert.equal(limited.update(4600), true);
  assert.equal(limited.exhausted, true);
  assert.equal(limited.update(4600), false);
  assert.equal(limited.uses, 2);
  assert.equal(rolls.length, 0);
  const unlimited = new SkillTrigger(settings({ chancePercent: 100, maxUses: 0 }), 0.1, () => 0);
  for (let index = 0; index < 200; index++) assert.equal(unlimited.update(4600), true);
  assert.equal(unlimited.uses, 200);
  assert.equal(unlimited.exhausted, false);
});

test('disabled skills and invalid elapsed time do not advance timers or consume randomness', () => {
  let calls = 0;
  const trigger = new SkillTrigger(settings({ chancePercent: 100 }), 0.1, () => { calls++; return 0.5; });
  assert.equal(trigger.update(10000, false), false);
  for (const delta of [-1, NaN, Infinity]) assert.equal(trigger.update(delta), false);
  assert.equal(trigger.remainingMs, 2300);
  assert.equal(calls, 1);
  assert.equal(trigger.update(2300), true);
  assert.equal(calls, 2);
});

test('a stalled frame performs one check instead of replaying a burst of overdue activations', () => {
  const trigger = new SkillTrigger(settings({ chancePercent: 100 }), 0.1, () => 0);
  assert.equal(trigger.update(60000), true);
  assert.equal(trigger.uses, 1);
  assert.equal(trigger.update(4599), false);
  assert.equal(trigger.update(1), true);
});

test('new race state resets the activation cap and snapshots the selected settings', () => {
  const selected = settings({ chancePercent: 100, maxUses: 1 });
  const first = new SkillTrigger(selected, 0.1, () => 0);
  assert.equal(first.update(0), true);
  selected.cooldownMs = 1000;
  selected.maxUses = 10;
  assert.equal(first.update(4600), false);
  assert.equal(first.intervalMs, 4600);
  const next = new SkillTrigger(selected, 0.1, () => 0.5);
  assert.equal(next.uses, 0);
  assert.equal(next.update(499), false);
  assert.equal(next.update(1), true);
});

test('Marble emits skills only when active and enabled, respects the cap, and resets on recreation', (t) => {
  const previousSettings = options.skillSettings;
  const previousEnabled = options.useSkills;
  t.after(() => { options.skillSettings = previousSettings; options.useSkills = previousEnabled; });
  t.mock.method(Math, 'random', () => 0);
  options.skillSettings = settings({ cooldownMs: 500, chancePercent: 100, maxUses: 1 });
  options.useSkills = true;
  const physics = {
    createMarble() {}, getMarblePosition: () => ({ x: 0, y: 0, angle: 0 }), shakeMarble() {},
  };
  const first = new Marble(physics, 0, 1, '첫 경기', 0.1);
  first.update(1000);
  assert.equal(first.skill, Skills.None);
  first.isActive = true;
  options.useSkills = false;
  first.update(1000);
  assert.equal(first.skill, Skills.None);
  options.useSkills = true;
  first.update(0);
  assert.equal(first.skill, Skills.Impact);
  first.update(500);
  assert.equal(first.skill, Skills.None);
  const next = new Marble(physics, 0, 1, '다음 경기', 0.1);
  next.isActive = true;
  next.update(0);
  assert.equal(next.skill, Skills.Impact);
});

test('Box2dPhysics impact applies the selected impulse multiplier and preserves the radius', (t) => {
  const previousSettings = options.skillSettings;
  t.after(() => { options.skillSettings = previousSettings; });
  class FakeVector {
    constructor(x, y) { this.x = x; this.y = y; }
    op_sub(other) { this.x -= other.x; this.y -= other.y; }
    LengthSquared() { return this.x ** 2 + this.y ** 2; }
    Length() { return Math.sqrt(this.LengthSquared()); }
    Normalize() { const length = this.Length(); this.x /= length; this.y /= length; }
    op_mul(value) { this.x *= value; this.y *= value; }
  }
  const impulses = [];
  const body = (x, y, label) => ({
    GetPosition: () => ({ x, y }),
    ApplyLinearImpulseToCenter: (vector) => impulses.push({ label, x: vector.x, y: vector.y }),
  });
  const physics = new Box2dPhysics();
  physics.Box2D = { b2Vec2: FakeVector };
  physics.marbleMap = {
    0: body(0, 0, 'source'), 1: body(3, 4, 'nearby'),
    2: body(10, 0, 'boundary'), 3: body(12, 0, 'outside'),
  };
  const amplitudes = new Map();
  for (const strength of [0.25, 1, 2, 3]) {
    impulses.length = 0;
    options.skillSettings = settings({ strength });
    physics.impact(0);
    assert.equal(impulses.length, 1);
    assert.equal(impulses[0].label, 'nearby');
    amplitudes.set(strength, Math.hypot(impulses[0].x, impulses[0].y));
    close(impulses[0].x / impulses[0].y, 3 / 4);
  }
  for (const strength of [0.25, 2, 3]) close(amplitudes.get(strength), amplitudes.get(1) * strength);
  impulses.length = 0;
  options.skillSettings = settings({ strength: NaN });
  physics.impact(0);
  close(Math.hypot(impulses[0].x, impulses[0].y), amplitudes.get(1));
  impulses.length = 0;
  physics.impact(999);
  assert.equal(impulses.length, 0);
});
