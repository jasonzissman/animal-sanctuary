// SDLC contract: goal metrics -> data/health.json, read by agentic-sdlc to check this project's goals.
// Computed from data/events.jsonl. A metric is null when the window has no data (nobody played this week);
// agentic-sdlc treats that as "no-data", not a failure.
//
// Event contract (emitted by game/telemetry.js, window.SAT; see CLAUDE.md):
//   session.tick / session.end  { sid, seconds }                      every ~15s and on pagehide
//   perf.fps                    { fps, hidden }                       10s average frame rate
//   round.complete              { sid, roundId, seconds, misses, hints, level }  a Scout & Spot / care round finished
//   part.tap                    { sid, part, correct }                a body-part / animal selection when one was asked for
//   error                       { message, source, line, stack }
import fs from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';
import { readJsonl } from './jsonl.js';

/** Metric names must match the goals in agentic-sdlc/config/projects.json. Don't rename. */
export const METRICS = Object.freeze([
  'client_errors_7d', //                JS errors reported by the game, last 7 days
  'fps_p10_7d', //                      10th percentile of 10s average-fps samples (visible tab only)
  'median_session_minutes_7d', //       median length of play sessions (>= 30s)
  'rounds_per_session_7d', //           completed rounds per session (>= 30s), average
  'median_round_seconds_7d', //         median seconds from prompt to correct answer (lower = less stuck)
  'tap_accuracy_7d', //                 correct / all part.tap selections (hitboxes + clue clarity)
]);

const DAY = 86_400_000;
const MIN_SESSION_SECONDS = 30;

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

const round = (v, d = 3) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** One record per session id: longest reported duration and completed rounds. */
export function sessions(events) {
  const by = new Map();
  for (const e of events) {
    if (!e.sid) continue;
    const s = by.get(e.sid) ?? { sid: e.sid, seconds: 0, rounds: 0 };
    if (e.type === 'session.tick' || e.type === 'session.end') s.seconds = Math.max(s.seconds, Number(e.seconds) || 0);
    if (e.type === 'round.complete') s.rounds++;
    by.set(e.sid, s);
  }
  return [...by.values()];
}

export function computeMetrics(events, now = new Date()) {
  const since = now.getTime() - 7 * DAY;
  const recent = events.filter((e) => Date.parse(e.ts) >= since);
  const played = sessions(recent).filter((s) => s.seconds >= MIN_SESSION_SECONDS);
  const fps = recent.filter((e) => e.type === 'perf.fps' && e.hidden !== true && Number.isFinite(e.fps)).map((e) => e.fps);
  const roundSecs = recent.filter((e) => e.type === 'round.complete' && Number.isFinite(e.seconds)).map((e) => e.seconds);
  const taps = recent.filter((e) => e.type === 'part.tap' && typeof e.correct === 'boolean');
  return {
    client_errors_7d: recent.filter((e) => e.type === 'error').length,
    fps_p10_7d: percentile(fps, 10),
    median_session_minutes_7d: round(median(played.map((s) => s.seconds / 60)), 2),
    rounds_per_session_7d: played.length ? round(played.reduce((a, s) => a + s.rounds, 0) / played.length, 2) : null,
    median_round_seconds_7d: round(median(roundSecs), 1),
    tap_accuracy_7d: taps.length ? round(taps.filter((t) => t.correct).length / taps.length) : null,
  };
}

export function computeHealth(now = new Date()) {
  const computed = computeMetrics(readJsonl(dataFile('events.jsonl')), now);
  const metrics = {};
  for (const m of METRICS) metrics[m] = typeof computed[m] === 'number' && Number.isFinite(computed[m]) ? computed[m] : null;
  return { generatedAt: now.toISOString(), metrics };
}

export function writeHealth(now = new Date()) {
  const health = computeHealth(now);
  const file = dataFile('health.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(health, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
  return health;
}
