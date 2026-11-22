# Project Specification: *Santuario de Animales* (Animal Sanctuary & Body-Parts Vocabulary Sandbox)

> Written by Jason (2026-11-21). The work is split into small agentic-sdlc tickets, not the PR plan in section 8,
> which is only a suggestion. Where this spec and `CLAUDE.md` differ on engineering details, `CLAUDE.md` wins.
> **The game direction has since evolved: `docs/DIRECTION.md` overrides this spec** (third-person free roam, inventory, photo missions).

## 1. Overview & Purpose
Build **Santuario de Animales**, a browser-based 3D low-poly creature observation, care, and habitat-building game designed for ~7-year-old 2nd-grade dual-language learners (combining kids from Spanish-speaking households who may have informal/conversational Spanish with kids from English-speaking households learning Spanish).

The game helps players build comfort and vocabulary around **real animals, animal body parts, and descriptive traits** (sizes, colors, counts, actions, and habitats) through playful, visual, action-first mechanics, never through reading walls of text or passing quiz gates.

The game will be distributed as a **self-contained HTML file** (or local bundle with vendored Three.js) so it can run offline/locally in a classroom with minimal privacy overhead and zero external server dependencies.

---

## 2. Hard Technical & Architectural Constraints
- **Stack:** Vanilla JavaScript (clean classic-script structure, see CLAUDE.md) with **Three.js vendored locally** in the project/bundle.
- **No build step required to run in browser / No npm runtime dependencies / No CDN or external network requests at runtime.** (Any build/bundling script used during development to produce a single standalone `.html` file must be deterministic, local, and cleanly tested.)
- **No backend required for core gameplay** (optional tiny localhost telemetry server only if explicitly enabled in dev/test; **zero remote network calls or student PII/identifiers** in classroom distribution).
- **Persistence:** Save progress cleanly in `localStorage` using a versioned schema (e.g., `santuario_save_v1`) that degrades gracefully if `localStorage` is unavailable or cleared.
- **Data-Driven Content:** Animals, body parts, habitats/biomes, traits/adjectives, clues/prompts, and sandbox props must live in structured data (JS data modules / inline `<script type="application/json">` in the single-file build) rather than being hard-coded inside rendering or game-loop logic. Avoid `fetch()` of local files in ways that break on `file://` URLs; prefer bundled/inlined data.
- **Procedural / Low-Poly Art:** All 3D models, animals, modular body parts, terrain, props, and animations must be generated procedurally in Three.js code from simple geometries (`BoxGeometry`, `ConeGeometry`, `CylinderGeometry`, `SphereGeometry`, etc.) and clean materials, with no external `.glb`/`.gltf`/`.obj` or image texture URLs required.
- **Agentic SDLC Compatibility:** Structure code into small, cohesive, well-tested modules with clear contracts and unit/integration tests so autonomous implementer/reviewer agents can add animals, body parts, clues, biomes, and polish in small, incremental PRs that keep the game working on every merge.

---

## 3. Target Audience & Pedagogical Design
- **Age & Grade:** ~7 years old, 2nd grade, dual-language classroom context (split English/Spanish instruction, math and social studies taught in Spanish).
- **Diverse Spanish Backgrounds:**
  - *English-background learners:* Need immediate visual/spatial affordances, clear animations, optional audio playback, and low-friction trial-and-error so they aren't blocked by vocabulary gaps.
  - *Spanish-speaking / heritage learners:* Need lively gameplay, humor, multi-attribute deduction, and nuanced vocabulary (e.g., distinguishing closely related animals or body parts, counting/quantities, adjectives, and subtle Easter eggs) so the game stays engaging rather than trivial.
- **Low-Reading / Visual-First Rule:** Keep on-screen text short, scannable, and paired with visual indicators (3D highlighting, icons, animations, and audio). Never block progression behind dense instructions.

---

## 4. Core Gameplay Loop & Mechanics

### A. Biomes / Habitats
Create a low-poly sanctuary world divided into distinct, recognizable biomes (starting with 2–3 core biomes and structured for easy expansion):
- **El Río / El Bosque** (River & Forest)
- **La Selva** (Jungle)
- **El Desierto** (Desert)
- **La Montaña** (Mountain)

Each biome should have distinct procedural terrain colors/features, roaming/ambient movement patterns, and placeable sandbox props.

### B. Loop 1: Scout & Spot (Observation & Trait Deduction)
1. A prompt/mission asks the player to find an animal in the habitat using a short Spanish description (and visual/audio support):
   - *Beginner / Scaffolded:* Visual silhouette/hint + short phrase, e.g., **"Busca el animal con orejas largas"** or **"Toca las patas"**.
   - *Intermediate / Deduction:* Multi-trait clue without direct visual giveaway, e.g., **"Tiene cola larga, cuatro patas y vive en la selva"** or **"Tiene caparazón y camina lento"**.
   - *Challenge / Mastery:* Close-pair distinction or counts/colors, e.g., distinguishing animals with similar silhouettes by *pico*, *alas*, *cuernos*, *cola*, or *patas*, or counting items/parts.
2. The player moves around the 3D scene (simple, forgiving kid-friendly camera/movement controls: click/tap, arrow/WASD, or orbit/pan with generous hitboxes and clear visual targets) and selects/inspects animals.
3. Selecting the matching animal triggers celebratory feedback, speaks/displays its Spanish name and key body parts, and advances the round. Selecting a non-matching animal gives gentle, funny feedback without harsh punishment.

### C. Loop 2: Care & Body-Part Interaction
Once an animal is spotted or brought to a care interaction:
1. Animals have modular 3D body parts tagged with semantic metadata (e.g., `orejas`, `cola`, `patas`, `alas`, `pico`, `caparazón`, `nariz`/`hocico`, `ojos`).
2. Players can interact with body parts directly via raycasting:
   - **Identify / Inspect:** Clicking or hovering a body part highlights it, shows/plays its Spanish label (and optional English translation toggle for scaffolding), and triggers a cute reaction.
   - **Care Actions:** Simple tools/actions like **limpiar / lavar** (clean mud/dust off *las patas* or *el caparazón*), **curar** (patch a scrape near *la cola* or *el ala*), or **alimentar** (give food matching diet/count cues, e.g., *tres frutas* or *dos peces*).
   - **Playful Wrong-Part Reactions:** Touching an unexpected part causes harmless, comical animation/SFX (e.g., boing, wobble, spin, or silly expression) rather than a dead end.

### D. Loop 3: Habitat Sandbox & Easter Eggs
1. Completing spotting and care tasks awards stars/tokens used to place or unlock low-poly sandbox items in the habitat (e.g., *árboles, rocas, un puente, agua/charca, flores*).
2. Include **hidden / unlockable Easter-egg creatures**. They are original, playful archetypes (e.g., a blocky yellow electric mouse with long ears and a zigzag tail, or a turtle with a colorful headband), built from the same procedural part system and data schema, and never copies of existing franchise characters. Make them unlockable through playful discovery or habitat conditions.

---

## 5. Audio Architecture
- **Do NOT rely solely on raw browser `speechSynthesis`**, as OS/browser TTS voices (especially in Spanish) can sound robotic or unnatural.
- **Primary Strategy: Pre-Generated Voice Clips + Procedural Web Audio SFX:**
  - Design a clean vocabulary/audio manifest listing every Spanish word, body part, animal name, adjective/number, and short prompt phrase.
  - Support playing pre-generated local voice clips (bundled audio assets, or Base64 data URIs in the single-file HTML build) alongside **procedural Web Audio API sound effects** (clicks, chimes, pops, splashes, boings, fanfare) that require zero external files.
  - Include an optional fallback (`speechSynthesis` or visual/text-only mode) if a clip is missing or muted, plus a prominent **Mute / Sound** control and a **Replay Audio** button on prompts.
  - Respect browser autoplay policies by initializing/resuming `AudioContext` on user interaction.

---

## 6. Data-Driven Schema & Extensibility
Design clean, validated schemas for:
1. **Body Part Definitions:** `key` (Spanish canonical key like `"orejas"`, `"cola"`, `"patas"`, `"alas"`, `"pico"`, `"caparazon"`), display labels (`es`, optional `en`), grammatical gender/number, geometry builder type, default scale/attachment anchor, and animation behavior.
2. **Animal Definitions:** `id`, `name` (`es`, optional `en`), `biome`, `traits` (size, color, movement, diet, special attributes), `parts` (configured body parts with size/color/count/offset overrides), `easterEgg` flag, and unlock condition.
3. **Clue / Prompt Templates:** Parameterized prompts referencing animal traits, body parts, counts, or colors so the game can generate varied, non-repetitive rounds from data.
4. **Save State (`localStorage`):** Unlocked animals, unlocked/placed habitat props, completed rounds/streaks, difficulty/scaffolding settings, and aggregate local stats.

---

## 7. Telemetry & Measurable Goals (Localhost / Testable)
Instrument clean, privacy-safe gameplay metrics that can be asserted in automated tests and inspected locally (without sending PII externally):
- **Session & Loop Metrics:** Session duration, rounds started/completed, core loop completion rate, current streak/progress persistence across reloads.
- **Performance & Stability:** Frame rate (FPS) sampling/averages in Three.js, zero uncaught runtime errors or console errors during play.
- **Learning & UX Friction Metrics:** Time spent per prompt ("time spent stuck" / high latency before successful selection), raycast/part selection accuracy, hint/audio replay usage, and per-word/per-part miss rates so triage tickets can pinpoint confusing clues, tricky hitboxes, or awkward procedural meshes.

---

## 8. Suggested Incremental Plan (advisory only)
1. Project skeleton, vendored Three.js, core loop shell: scene, camera/movement, save manager, audio manager, single-file bundle script.
2. Procedural low-poly animal & body-part assembler with raycastable part metadata, idle/reaction animations, 4–6 real animals across 2 biomes.
3. Scout & Spot mechanic + clue engine: data-driven clues, selection, scaffolding, difficulty progression, rewards.
4. Care interactions & body-part vocabulary loop: clean, heal, feed; playful wrong-part reactions.
5. Habitat sandbox, more animals & Easter eggs.
6. Local telemetry, polish & classroom controls: teacher/settings drawer (difficulty, mute, reset/export local summary), end-to-end tests.
