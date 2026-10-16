type Level = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configured = (process.env.LOG_LEVEL ?? 'info') as Level;
const currentLevel = levels[configured] ?? levels.info;

function emit(level: Level, msg: string, meta?: unknown): void {
  if (levels[level] < currentLevel) return;

  const prefix = `[${level.toUpperCase()}]`;
  if (meta === undefined) {
    console.log(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`, meta);
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};