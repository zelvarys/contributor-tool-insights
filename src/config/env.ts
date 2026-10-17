import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: Number(optional('PORT', '3000')),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),

  // Phase 1
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),

  // Phase 2
  GITHUB_CLIENT_ID: required('GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: required('GITHUB_CLIENT_SECRET'),
  GITHUB_CALLBACK_URL: required('GITHUB_CALLBACK_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),
  TOKEN_ENCRYPTION_KEY: required('TOKEN_ENCRYPTION_KEY'),
} as const;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

if (!Number.isFinite(env.PORT) || env.PORT <= 0) {
  console.error(`❌ Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

if (env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

if (env.TOKEN_ENCRYPTION_KEY.length !== 64) {
  console.error('❌ TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  process.exit(1);
}