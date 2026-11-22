// Ingests event batches flushed by the browser (game/telemetry.js) and fans them out into the SDLC contract files:
//   every event      -> data/events.jsonl    (raw gameplay log; source for health metrics)
//   type "error"     -> data/telemetry.jsonl (level error, event "game.error" -> bug tickets)
//   type "feedback"  -> data/feedback.jsonl  (grown-up feedback button -> tickets, with the game `context`)
// The browser retries until acknowledged, so ingestion is idempotent by event id.
// Privacy: events carry no names or identifiers of children; `sid` is a random per-session id.
import { dataFile } from './paths.js';
import { appendJsonl, readJsonl } from './jsonl.js';

const MAX_BATCH = 1000;
const MAX_EVENT_CHARS = 8000;
const MAX_CONTEXT_CHARS = 3000;
const ID_RE = /^[a-z0-9]{6,40}$/;
const TYPE_RE = /^[a-z][a-z0-9._-]{0,40}$/;

let seen = null;
function seenIds() {
  if (!seen) seen = new Set(readJsonl(dataFile('events.jsonl')).map((e) => e.id));
  return seen;
}
/** Tests: forget the in-memory id cache (e.g. after switching data dirs). */
export function resetSeen() {
  seen = null;
}

export function validEvent(e) {
  return !!e && typeof e === 'object' && !Array.isArray(e) && ID_RE.test(String(e.id)) && TYPE_RE.test(String(e.type)) && !Number.isNaN(Date.parse(e.ts));
}

function feedbackContext(e) {
  const c = e.context;
  if (!c || typeof c !== 'object' || Array.isArray(c) || JSON.stringify(c).length > MAX_CONTEXT_CHARS) return {};
  return { context: c };
}

/** Returns { ok, accepted: ids the browser may drop (new or already stored), rejected: invalid count, stored }. */
export function ingest(batch) {
  if (!Array.isArray(batch)) return { ok: false, error: 'expected an array of events' };
  if (batch.length > MAX_BATCH) return { ok: false, error: `batch too large (max ${MAX_BATCH})` };
  const ids = seenIds();
  const accepted = [];
  const fresh = [];
  let rejected = 0;
  for (const raw of batch) {
    if (!validEvent(raw)) {
      rejected++;
      continue;
    }
    const e = JSON.stringify(raw).length <= MAX_EVENT_CHARS ? raw : { id: raw.id, ts: raw.ts, type: raw.type, sid: raw.sid, truncated: true };
    accepted.push(e.id);
    if (ids.has(e.id)) continue;
    ids.add(e.id);
    fresh.push({ ...e, receivedAt: new Date().toISOString() });
  }
  appendJsonl(dataFile('events.jsonl'), fresh);
  appendJsonl(
    dataFile('telemetry.jsonl'),
    fresh.filter((e) => e.type === 'error').map((e) => ({ ts: e.ts, level: 'error', event: 'game.error', message: String(e.message ?? 'unknown'), source: e.source, line: e.line, stack: e.stack, sid: e.sid })),
  );
  appendJsonl(
    dataFile('feedback.jsonl'),
    fresh.filter((e) => e.type === 'feedback' && String(e.text ?? '').trim()).map((e) => ({ ts: e.ts, text: String(e.text).slice(0, 4000), kind: ['feedback', 'bug', 'idea'].includes(e.kind) ? e.kind : 'feedback', page: 'game', ...feedbackContext(e) })),
  );
  return { ok: true, accepted, rejected, stored: fresh.length };
}
