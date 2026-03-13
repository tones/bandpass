import { describe, it, expect } from 'vitest';
import { toCamelot, normalizeBpm, formatKey } from '../camelot';

describe('toCamelot', () => {
  it('converts major keys', () => {
    expect(toCamelot('C', 'major')).toBe('8B');
    expect(toCamelot('G', 'major')).toBe('9B');
    expect(toCamelot('F', 'major')).toBe('7B');
    expect(toCamelot('Bb', 'major')).toBe('6B');
  });

  it('converts minor keys', () => {
    expect(toCamelot('A', 'minor')).toBe('8A');
    expect(toCamelot('F', 'minor')).toBe('4A');
    expect(toCamelot('D', 'minor')).toBe('7A');
    expect(toCamelot('C#', 'minor')).toBe('12A');
  });

  it('handles enharmonic equivalents', () => {
    expect(toCamelot('F#', 'major')).toBe('2B');
    expect(toCamelot('Gb', 'major')).toBe('2B');
    expect(toCamelot('G#', 'minor')).toBe('1A');
    expect(toCamelot('Ab', 'minor')).toBe('1A');
  });

  it('returns null for unknown keys', () => {
    expect(toCamelot('X', 'major')).toBeNull();
    expect(toCamelot('C', 'dorian')).toBeNull();
  });
});

describe('normalizeBpm', () => {
  it('doubles BPM below 70', () => {
    expect(normalizeBpm(60)).toBe(120);
    expect(normalizeBpm(55)).toBe(110);
    expect(normalizeBpm(35)).toBe(70);
  });

  it('halves BPM above 180', () => {
    expect(normalizeBpm(200)).toBe(100);
    expect(normalizeBpm(240)).toBe(120);
  });

  it('leaves BPM in range untouched', () => {
    expect(normalizeBpm(120)).toBe(120);
    expect(normalizeBpm(128)).toBe(128);
    expect(normalizeBpm(70)).toBe(70);
    expect(normalizeBpm(180)).toBe(180);
  });

  it('rounds to one decimal place', () => {
    expect(normalizeBpm(60.15)).toBe(120.3);
  });

  it('returns 0 for 0 or negative', () => {
    expect(normalizeBpm(0)).toBe(0);
    expect(normalizeBpm(-10)).toBe(0);
  });
});

describe('formatKey', () => {
  it('formats minor keys with "m" suffix', () => {
    expect(formatKey('A', 'minor')).toBe('Am');
    expect(formatKey('F#', 'minor')).toBe('F#m');
  });

  it('formats major keys without suffix', () => {
    expect(formatKey('C', 'major')).toBe('C');
    expect(formatKey('Bb', 'major')).toBe('Bb');
  });
});
