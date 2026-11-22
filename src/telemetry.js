// SDLC contract: structured events -> data/telemetry.jsonl. agentic-sdlc turns level=error events into tickets.
import { dataFile } from './paths.js';
import { appendJsonl } from './jsonl.js';

export function logEvent(level, event, fields = {}) {
  const entry = { ts: new Date().toISOString(), level, event, ...fields };
  try {
    appendJsonl(dataFile('telemetry.jsonl'), [entry]);
  } catch (e) {
    console.error('telemetry write failed', e);
  }
  return entry;
}

export const info = (event, fields) => logEvent('info', event, fields);
export const warn = (event, fields) => logEvent('warn', event, fields);
export const error = (event, err, fields = {}) =>
  logEvent('error', event, { message: String(err?.message ?? err), stack: err?.stack?.split('\n').slice(0, 5).join('\n'), ...fields });
