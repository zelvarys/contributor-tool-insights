import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;   // GCM standard
const TAG_LENGTH = 16;

function key(): Buffer {
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
}

/**
 * Returns a base64 string of: iv (12) || ciphertext || authTag (16)
 * Safe to store as TEXT in Postgres.
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

export function decryptToken(payload: string): string {
  if (!payload || payload.trim() === '') {
    throw new Error('Empty token payload');
  }

  const buf = Buffer.from(payload, 'base64');

  // Minimum valid length = IV (12) + auth tag (16) = 28 bytes.
  // Anything shorter cannot be a well-formed ciphertext.
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Token payload too short to be valid ciphertext');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}