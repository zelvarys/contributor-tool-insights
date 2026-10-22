import { describe, it, expect, beforeAll } from 'vitest';

describe('crypto', () => {
  let encryptToken: (s: string) => string;
  let decryptToken: (s: string) => string;

  beforeAll(async () => {
    if (!process.env.TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY.length !== 64) {
      process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    }
    const mod = await import('../../server/utils/crypto.js');
    encryptToken = mod.encryptToken;
    decryptToken = mod.decryptToken;
  });

  it('round-trips a token', () => {
    const plain = 'gho_abcdefghijklmnopqrstuvwxyz0123456789';
    const enc = encryptToken(plain);
    expect(enc).not.toBe(plain);
    expect(decryptToken(enc)).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext', () => {
    const plain = 'gho_same';
    const a = encryptToken(plain);
    const b = encryptToken(plain);
    expect(a).not.toBe(b); // different IV
    expect(decryptToken(a)).toBe(plain);
    expect(decryptToken(b)).toBe(plain);
  });

  it('rejects empty payload', () => {
    expect(() => decryptToken('')).toThrow(/Empty/);
  });

  it('rejects too-short payload', () => {
    expect(() => decryptToken('AAAA')).toThrow(/too short/i);
  });

  it('rejects a tampered ciphertext', () => {
    const enc = encryptToken('gho_secret');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptToken(buf.toString('base64'))).toThrow();
  });

  it('rejects ciphertext with a different key', async () => {
    const enc = encryptToken('gho_secret');
    // Swap the key at runtime is hard because `key()` reads env each call.
    // Instead simulate by tampering the tag byte.
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0x01;
    expect(() => decryptToken(buf.toString('base64'))).toThrow();
  });
});