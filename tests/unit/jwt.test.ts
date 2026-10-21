import { describe, it, expect, beforeAll } from 'vitest';

describe('jwt', () => {
  let signJwt: (userId: string, expiresInSeconds: number) => string;
  let verifyJwt: (token: string) => { sub: string; iat: number; exp: number };
  let parseExpiresIn: (value: string) => number;

  beforeAll(async () => {
    // Ensure JWT_SECRET is long enough before importing the module
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      process.env.JWT_SECRET = 'x'.repeat(64);
    }
    const mod = await import('../../src/utils/jwt.js');
    signJwt = mod.signJwt;
    verifyJwt = mod.verifyJwt;
    parseExpiresIn = mod.parseExpiresIn;
  });

  it('signs and verifies a token', () => {
    const token = signJwt('user-123', 3600);
    const payload = verifyJwt(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('rejects a tampered signature', () => {
    const token = signJwt('user-123', 3600);
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A');
    expect(() => verifyJwt(tampered)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signJwt('user-123', -1);
    expect(() => verifyJwt(token)).toThrow(/expired/i);
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyJwt('not-a-jwt')).toThrow();
    expect(() => verifyJwt('a.b')).toThrow();
    expect(() => verifyJwt('')).toThrow();
  });

  it('parses expires-in values', () => {
    expect(parseExpiresIn('3600')).toBe(3600);
    expect(parseExpiresIn('60s')).toBe(60);
    expect(parseExpiresIn('5m')).toBe(300);
    expect(parseExpiresIn('2h')).toBe(7200);
    expect(parseExpiresIn('7d')).toBe(604800);
    expect(() => parseExpiresIn('7x')).toThrow();
  });
});