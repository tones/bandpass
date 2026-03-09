import { describe, it, expect } from 'vitest';
import { formatPrice } from '../formatters';

describe('formatPrice', () => {
  it('uses symbol prefix for short symbols like $ and €', () => {
    expect(formatPrice(9.99, 'USD')).toBe('$9.99');
    expect(formatPrice(12, 'EUR')).toBe('€12.00');
  });

  it('uses symbol prefix for multi-char symbols ending in $', () => {
    expect(formatPrice(15, 'AUD')).toBe('A$15.00');
    expect(formatPrice(10, 'NZD')).toBe('NZ$10.00');
  });

  it('uses code with space for non-symbol currencies', () => {
    expect(formatPrice(100, 'SEK')).toBe('SEK 100.00');
    expect(formatPrice(50, 'CHF')).toBe('CHF 50.00');
  });
});
