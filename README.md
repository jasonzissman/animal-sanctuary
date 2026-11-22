# Santuario de Animales

A low-poly 3D animal sanctuary for 2nd-grade dual-language learners. Find, care for and build habitats for real
animals while learning Spanish words for animals, body parts and traits. Built autonomously by agentic-sdlc.

- **Play:** open `index.html` in Chrome (works from `file://`, offline).
- **Telemetry receiver (optional, local only):** `npm start` → http://127.0.0.1:5100
- **Classroom file:** `npm run bundle` (or `node scripts/bundle.js`) writes `dist/santuario.html`, a single
  self-contained file (all scripts, three.js and CSS inlined; no network, no other files needed). Copy that one
  file to a USB stick, shared drive or email it; students double-click it to open it in Chrome, offline. The build is
  deterministic (same sources → byte-identical file), so you can compare copies with a checksum. The bundle sets
  `window.SA_CLASSROOM = true`, which switches telemetry sending off completely (no network calls at all); progress
  and the grown-up stats stay on the device. `dist/` is git-ignored: rebuild after each update.
- **Tests:** `npm test`
- Spec: `docs/SPEC.md`. Rules for agents: `CLAUDE.md`.
