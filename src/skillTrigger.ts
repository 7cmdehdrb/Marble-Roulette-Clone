import { normalizeSkillSettings, type SkillSettings } from './options';

/** Per-marble race state. New marbles receive a fresh randomized first wait and use count. */
export class SkillTrigger {
  readonly intervalMs: number;
  readonly probability: number;
  readonly maxUses: number;
  private _remainingMs: number;
  private _uses = 0;

  constructor(settings: SkillSettings, weight: number, private random: () => number = Math.random) {
    const normalized = normalizeSkillSettings(settings);
    // Participant weights are normalized by Roulette to 0.1..1.1. Keep that original bias.
    const normalizedWeight = Number.isFinite(weight) ? Math.min(1.1, Math.max(0.1, weight)) : 1;
    this.intervalMs = Math.max(1, normalized.cooldownMs * (1000 + (1 - normalizedWeight) * 4000) / 4600);
    this.probability = Math.min(1, (normalized.chancePercent / 100) * (normalizedWeight / 0.1));
    this.maxUses = normalized.maxUses;
    this._remainingMs = this.intervalMs * this.random();
  }

  get remainingMs() {
    return this._remainingMs;
  }

  get uses() {
    return this._uses;
  }

  get exhausted() {
    return this.maxUses > 0 && this._uses >= this.maxUses;
  }

  update(deltaTime: number, enabled = true): boolean {
    if (!enabled || this.exhausted || !Number.isFinite(deltaTime) || deltaTime < 0) return false;

    this._remainingMs -= deltaTime;
    if (this._remainingMs > 0) return false;

    // As in the original, a frame performs one check and starts the next full cooldown.
    // A suspended browser tab therefore cannot release a burst of accumulated skills.
    this._remainingMs = this.intervalMs;
    if (this.random() >= this.probability) return false;

    this._uses++;
    return true;
  }
}
