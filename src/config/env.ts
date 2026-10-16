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
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),
} as const;

// Phase 0 uses none of these yet — kept here as a placeholder
// so required() has a purpose in later phases. Uncomment as needed:
// export const DATABASE_URL = () => required('DATABASE_URL');
// export const REDIS_URL    = () => required('REDIS_URL');
// export const JWT_SECRET   = () => required('JWT_SECRET');

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

// Fail fast on malformed PORT
if (!Number.isFinite(env.PORT) || env.PORT <= 0) {
  console.error(`❌ Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}