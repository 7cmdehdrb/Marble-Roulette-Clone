export type WinnerRange = { start: number; end: number };

export type SkillSettings = {
  cooldownMs: number;
  chancePercent: number;
  /** Maximum successful activations per marble and race; 0 means unlimited. */
  maxUses: number;
  strength: number;
};

export const DEFAULT_SKILL_SETTINGS: Readonly<SkillSettings> = Object.freeze({
  cooldownMs: 4600,
  chancePercent: 2,
  maxUses: 0,
  strength: 1,
});

export function normalizeSkillSettings(input: unknown = {}): SkillSettings {
  const settings = typeof input === 'object' && input !== null ? input as Partial<SkillSettings> : {};
  const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback;

  return {
    cooldownMs: bounded(settings?.cooldownMs, DEFAULT_SKILL_SETTINGS.cooldownMs, 500, 10000),
    chancePercent: bounded(settings?.chancePercent, DEFAULT_SKILL_SETTINGS.chancePercent, 0, 100),
    maxUses: Math.floor(bounded(settings?.maxUses, DEFAULT_SKILL_SETTINGS.maxUses, 0, 100)),
    strength: bounded(settings?.strength, DEFAULT_SKILL_SETTINGS.strength, 0.25, 3),
  };
}

class Options {
  useSkills: boolean = true;
  skillSettings: SkillSettings = { ...DEFAULT_SKILL_SETTINGS };
  /** 0-based, 양끝 포함. 1명 추첨은 start === end */
  winnerRange: WinnerRange = { start: 0, end: 0 };
  autoRecording: boolean = true;
}

const options = new Options();
export default options;
