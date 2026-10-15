import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'roulette-name-input-'));
after(() => rm(directory, { recursive: true, force: true }));

for (const [source, destination] of [
  ['../src/utils/utils.ts', 'utils.mjs'],
  ['../src/nameInput.ts', 'nameInput.mjs'],
]) {
  const input = await readFile(new URL(source, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  await writeFile(join(directory, destination), outputText.replace("'./utils/utils'", "'./utils.mjs'"));
}

const { normalizeNames } = await import(pathToFileURL(join(directory, 'nameInput.mjs')).href);

test('normalizes commas, CRLF, surrounding whitespace, and empty names', () => {
  assert.deepEqual(normalizeNames('  수박  ,\r\n 키위\r딸기\n , /3, *2'), {
    entries: ['수박', '키위', '딸기'],
    text: '수박\n키위\n딸기',
    total: 3,
    limited: false,
  });
});

test('merges duplicate names and weights in their first appearance order', () => {
  assert.deepEqual(normalizeNames('수박,키위/3,수박,수박/2,키위/3'), {
    entries: ['수박*2', '키위/3*2', '수박/2'],
    text: '수박*2\n키위/3*2\n수박/2',
    total: 5,
    limited: false,
  });
});

test('preserves multiplicities and removes default count and weight markers', () => {
  const result = normalizeNames('수박/1*1, 키위*3/2, 딸기/3*2');
  assert.deepEqual(result.entries, ['수박', '키위/2*3', '딸기/3*2']);
  assert.equal(result.total, 6);
});

test('zero counts and zero weights do not create marbles', () => {
  assert.deepEqual(normalizeNames('수박*0,키위/0,딸기/2*0'), {
    entries: [], text: '', total: 0, limited: false,
  });
});

test('bounds the total without expanding huge counts into an array', () => {
  assert.deepEqual(normalizeNames(`수박*${'9'.repeat(200)},키위`), {
    entries: ['수박*500'], text: '수박*500', total: 500, limited: true,
  });
});

test('does not accept counts and weights that parse to infinity', () => {
  const unbounded = '9'.repeat(400);
  assert.deepEqual(normalizeNames(`수박*${unbounded},키위/${unbounded},딸기`), {
    entries: ['딸기'], text: '딸기', total: 1, limited: false,
  });
});

test('applies the remaining capacity to duplicates and subsequent names', () => {
  assert.deepEqual(normalizeNames('수박*300,키위*150,수박*100,딸기'), {
    entries: ['수박*350', '키위*150'], text: '수박*350\n키위*150', total: 500, limited: true,
  });
  assert.equal(normalizeNames('수박*500').limited, false);
});

test('bounds weights and merges entries with the same resulting weight', () => {
  assert.deepEqual(normalizeNames('수박/1001,수박/1000').entries, ['수박/1000*2']);
});

test('object prototype property names remain ordinary participant names', () => {
  assert.deepEqual(normalizeNames('__proto__,constructor,toString,__proto__*2').entries, [
    '__proto__*3', 'constructor', 'toString',
  ]);
});

test('limits names to 80 characters and merges the resulting duplicates', () => {
  const name = '가'.repeat(80);
  const result = normalizeNames(`${name}나,${name}`);
  assert.deepEqual(result.entries, [`${name}*2`]);
  assert.equal(result.limited, true);
  assert.equal(normalizeNames(name).limited, false);
  const emojiBoundary = normalizeNames(`${'가'.repeat(79)}😀`);
  assert.equal(emojiBoundary.entries[0], '가'.repeat(79));
});

test('canonical text can be normalized again without changing the entries', () => {
  const result = normalizeNames('수박,키위/3*2,수박*4');
  assert.deepEqual(normalizeNames(result.text), result);
});
