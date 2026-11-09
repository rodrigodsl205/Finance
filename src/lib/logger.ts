type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

const MAX_ENTRIES = 200;
let entries: LogEntry[] = [];

function log(level: LogLevel, message: string, data?: unknown) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);

  const prefix = `[DualCash ${entry.timestamp}]`;
  if (level === 'error') console.error(prefix, message, data ?? '');
  else if (level === 'warn') console.warn(prefix, message, data ?? '');
  else if (level === 'debug') console.debug(prefix, message, data ?? '');
  else console.log(prefix, message, data ?? '');
}

export const logger = {
  info: (msg: string, data?: unknown) => log('info', msg, data),
  warn: (msg: string, data?: unknown) => log('warn', msg, data),
  error: (msg: string, data?: unknown) => log('error', msg, data),
  debug: (msg: string, data?: unknown) => log('debug', msg, data),
  getEntries: (): LogEntry[] => [...entries],
  clear: () => { entries = []; },
  exportText: (): string => {
    return entries.map(e => {
      const dataStr = e.data ? ` | ${typeof e.data === 'object' ? JSON.stringify(e.data) : String(e.data)}` : '';
      return `[${e.timestamp}] ${e.level.toUpperCase()} | ${e.message}${dataStr}`;
    }).join('\n');
  },
};
