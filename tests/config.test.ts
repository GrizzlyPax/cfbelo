import { describe, expect, it } from 'vitest';
import { parseConfig, PRESETS, serializeConfig } from '../engine/config';

describe('config serialization', () => {
  it('round-trips every preset through URL params', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(parseConfig(serializeConfig(preset))).toEqual(preset);
    }
  });

  it('partial params fall back to the fifa preset', () => {
    const config = parseConfig('d=400&mov=1');
    expect(config.divisor).toBe(400);
    expect(config.movEnabled).toBe(true);
    expect(config.knockoutImmunityCfp).toBe(PRESETS.fifa!.knockoutImmunityCfp);
    expect(config.importance).toEqual(PRESETS.fifa!.importance);
  });

  it('parses per-tier importance overrides', () => {
    const config = parseConfig('i=1,2,3,4,5,6,7,8,9');
    expect(config.importance.fcs).toBe(1);
    expect(config.importance.bowl).toBe(9);
  });

  it('rejects malformed numbers and unknown enums', () => {
    expect(() => parseConfig('d=abc')).toThrow(/not a number/);
    expect(() => parseConfig('i=1,2')).toThrow(/comma-separated/);
    expect(() => parseConfig('seed=vibes')).toThrow(/seeding/);
    expect(() => parseConfig('rt=galaxy')).toThrow(/reversion target/);
  });
});
