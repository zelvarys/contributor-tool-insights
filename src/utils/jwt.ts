import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

type JwtPayload = {
  sub: string;      // user id
  iat: number;
  exp: number;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(data: string): string {
  return base64url(createHmac('sha256', env.JWT_SECRET).update(data).digest());
}

export function signJwt(userId: string, expiresInSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const body = base64url(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [header, body, signature] = parts as [string, string, string];

  const expected = sign(`${header}.${body}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid signature');
  }

  const payload = JSON.parse(base64urlDecode(body).toString()) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');

  return payload;
}

export function parseExpiresIn(value: string): number {
  // Accepts "7d", "24h", "60m", "3600s", or bare number of seconds
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid JWT_EXPIRES_IN: ${value}`);
  const [, numStr, unit] = match;
  const num = Number(numStr);
  switch (unit) {
    case 's':
    case undefined:
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 3600;
    case 'd':
      return num * 86_400;
    default:
      throw new Error(`Invalid JWT_EXPIRES_IN unit: ${unit}`);
  }
}