import { parseName } from './utils/utils';

const MAX_NAME_LENGTH = 80;
const MAX_MARBLES = 500;
const MAX_WEIGHT = 1000;

export function normalizeNames(text: string): {
  entries: string[];
  text: string;
  total: number;
  limited: boolean;
} {
  const members = new Map<string, { name: string; weight: number; count: number }>();
  let total = 0;
  let limited = false;

  for (const token of text.split(/[,\r\n]+/)) {
    const parsed = parseName(token.trim());
    if (!parsed) continue;
    let name = parsed.name.trim();
    if (
      !name ||
      !Number.isFinite(parsed.count) ||
      !Number.isInteger(parsed.count) ||
      parsed.count <= 0 ||
      !Number.isFinite(parsed.weight) ||
      !Number.isInteger(parsed.weight) ||
      parsed.weight <= 0
    ) {
      continue;
    }

    if (name.length > MAX_NAME_LENGTH) {
      name = name.slice(0, MAX_NAME_LENGTH);
      // Avoid leaving half of an emoji at the truncation boundary.
      if (/[\uD800-\uDBFF]$/.test(name)) name = name.slice(0, -1);
      limited = true;
    }

    const weight = Math.min(parsed.weight, MAX_WEIGHT);
    const count = Math.min(parsed.count, MAX_MARBLES - total);
    if (count < parsed.count) limited = true;
    if (count === 0) continue;

    const key = JSON.stringify([name, weight]);
    const existing = members.get(key);
    if (existing) existing.count += count;
    else members.set(key, { name, weight, count });
    total += count;
  }

  const entries = [...members.values()].map(
    ({ name, weight, count }) => `${name}${weight === 1 ? '' : `/${weight}`}${count === 1 ? '' : `*${count}`}`
  );
  return { entries, text: entries.join('\n'), total, limited };
}
