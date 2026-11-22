# animal-sanctuary (Santuario de Animales): rules for agents (and humans)

This project is built and maintained autonomously by **agentic-sdlc** (`/Users/jasonzissman/projects/agentic-sdlc`).
It is a browser-based, low-poly 3D animal sanctuary for **~7-year-old 2nd-grade dual-language learners**. Players
observe, find and care for real animals and build habitats while picking up Spanish words for **animals, body parts
and descriptive traits** (sizes, colours, counts, actions, habitats). Learning comes from play and actions. Never
use text walls or quiz gates. The full product spec is **`docs/SPEC.md`**. Read the sections that relate to your ticket.

## Deployment (read this first)

The game runs by **opening `index.html` straight from disk (`file://`)**, on Jason's Mac or offline in a classroom.
Merging to `main` is the deployment. Later, a deterministic local bundler will produce one standalone `.html` file
for classrooms. Therefore:

1. **No build step to run, no ES modules in the browser, no `fetch()` of local files, no CDN/network assets.**
   Load classic `<script src="game/...">` tags from `index.html` in dependency order. Each one attaches to one
   global namespace, `window.SA` (e.g. `SA.data`, `SA.parts`, `SA.animals`, `SA.clues`, `SA.save`, `SA.audio`).
   three.js **r128** is vendored at `game/vendor/three.min.js` (global `THREE`, a protected path).
2. **Content is data, not code.** Body parts, animals, biomes, traits/adjectives, clue templates and props are
   plain JSON-serialisable objects registered from `game/data/*.js` (e.g. `SA.data.register('animals', [...])`).
   They are validated at load with clear errors. Engine code never special-cases an animal id.
3. **Procedural low-poly art only.** Build models from three.js primitives (Box/Cone/Cylinder/Sphere…) and flat
   materials, parameterised by data. No `.glb`/`.obj`/image-texture files.
4. **Never break `main`.** The page must boot with zero console errors and the core loop must stay playable.
5. **Persistence:** `localStorage` key `santuario_save_v1` (versioned, migrated, never wiped on a bad read). The
   game must still run when `localStorage` is unavailable (in-memory fallback).
6. **Privacy:** no names, accounts, identifiers, ads, external links or network calls. The only exception is the
   optional local telemetry receiver on `127.0.0.1:5100`.

## Design rules for this audience

- **Visual first, low reading.** On-screen text is a short Spanish phrase (≤ ~6 words) paired with an icon,
  3D highlight, animation and audio. An optional English toggle is scaffolding. It is off by default.
- **Never punish.** A wrong pick gets a gentle, funny reaction (boing, wobble, sneeze) and the round continues.
  There are no timers that fail you and no lives.
- **Two kinds of learners.** Beginners (English-background) need silhouettes, highlights, Replay-audio and
  trial-and-error. Heritage Spanish speakers need deduction (multi-trait clues), counts, colours, close pairs
  and humour. Difficulty adapts per player (scaffold level in the save).
- **Big targets.** Generous hitboxes (invisible enlarged pick volumes on body parts), click/tap-first controls,
  plus arrow/WASD. It must work on a touch Chromebook/iPad-sized screen and a mouse.
- **Spanish correctness matters:** correct articles/gender/number (*las orejas*, *el pico*, *la cola*,
  *el caparazón*), accents, and agreement in generated clues (*orejas largas*, *pico corto*). Clue templates
  must declare grammatical gender/number so generated phrases agree.
- **Easter-egg creatures are original.** They may be playful archetypes (an electric mouse, a turtle with a
  headband) built from the same part system. Do NOT copy or name existing franchise characters, logos or designs.

## Architecture contracts (keep these)

- **Pure logic in small classic-script modules** under `game/` that attach to `window.SA` and can be loaded in
  `node:vm` for unit tests without `THREE` or a DOM (data validation, clue generation, round state, save/migrate,
  scaffolding/difficulty, reward math). Rendering lives under `game/render/` and is the only code that touches
  `THREE`. Keep it thin, or test it against a stub `THREE`.
- **Body parts are raycastable:** every part mesh carries `userData = { animalId, part: '<key>', side? }`.
  Picking raycasts only the current animals' pick volumes, never the whole scene.
- **Audio** goes through `SA.audio`: procedural Web Audio SFX, plus voice clips looked up by vocabulary key
  in `game/data/vocab.js`. It falls back to `speechSynthesis` (es-ES/es-MX) when a clip is missing, and to text
  when muted. The `AudioContext` is created/resumed on the first user gesture. Every prompt has a Replay button.
  There is always a visible Mute toggle.
- Keep each file focused (aim for < ~300 lines). Prefer adding a new module over growing a big one.

## SDLC contract (agentic-sdlc reads these files)

Telemetry flows: game → `localStorage` queue (`game/telemetry.js`, `window.SAT`) → `POST /api/events` on the local
receiver (`src/server.js`, http://127.0.0.1:5100, which agentic-sdlc's `./start.sh` runs) → files below. When the
receiver is not running (a classroom), events stay queued (capped) and the game works normally.

| File | Written by | Purpose |
| --- | --- | --- |
| `data/events.jsonl` | `src/events.js` | Raw game events (source for health metrics) |
| `data/telemetry.jsonl` | `src/events.js` (`type:"error"` → `game.error`), `src/telemetry.js` | `level:"error"` → bug tickets |
| `data/feedback.jsonl` | `src/events.js` (`type:"feedback"`, via `SAT.feedback(text, kind, context)`) | grown-up feedback → tickets |
| `data/health.json` | `src/health.js` (`writeHealth`) | Goal metrics |

Events the metrics depend on (exact names and fields are in the header of `src/health.js`):
`session.tick`/`session.end` `{sid, seconds}`, `perf.fps` `{fps, hidden}`, `round.complete` `{roundId, seconds,
misses, hints, level}`, `part.tap` `{part, correct}`, `error`. Other gameplay events use `SAT.track('<area>.<what>', {...})`
with stable names. Metric names in `src/health.js` `METRICS` match agentic-sdlc's goal config, so don't rename them.

## Conventions

- Node.js ≥ 22. ES modules in `src/` and `test/` (the receiver). Classic scripts in `game/` (the browser).
  **Zero dependencies.** `package.json`, `.github/`, `CLAUDE.md` and `game/vendor/` are protected paths.
- `npm test` runs `node:test` with a 70% line-coverage floor on `src/`. Tests never touch the network or a real
  browser. Test game logic by loading the classic scripts into `node:vm` (a shared helper in `test/helpers/`).
- Spanish identifiers in data keys (`orejas`, `cola`, `patas`, `alas`, `pico`, `caparazon`), English in code.
