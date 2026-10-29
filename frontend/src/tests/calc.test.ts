import { describe, it, expect } from 'vitest';
import { evaluate, formatNumber, looksLikeMath } from '../lib/calc';

describe('calculator expression engine', () => {
  it('respects operator precedence and parentheses', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('(2+3)*4')).toBe(20);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('-3^2')).toBe(-9);
  });
  it('handles percentages, functions and constants', () => {
    expect(evaluate('50%')).toBeCloseTo(0.5);
    expect(evaluate('sqrt(16)+abs(-2)')).toBe(6);
    expect(evaluate('2pi')).toBeCloseTo(2 * Math.PI);
    expect(evaluate('10 mod 3')).toBe(1);
  });
  it('rejects unsafe or malformed input instead of executing it', () => {
    expect(() => evaluate('alert(1)')).toThrow();
    expect(() => evaluate('2+')).toThrow();
    expect(() => evaluate('constructor')).toThrow();
  });
  it('formats results like a calculator display', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(1e21)).toMatch(/e/);
  });
  it('detects Spotlight math queries', () => {
    expect(looksLikeMath('12*7')).toBe(true);
    expect(looksLikeMath('notes')).toBe(false);
  });
});
