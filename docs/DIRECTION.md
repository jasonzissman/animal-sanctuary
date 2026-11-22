# Direction: where Santuario de Animales is heading

Jason's standing decisions, newest first. **Where this differs from `docs/SPEC.md`, this file wins.** Agents: keep it
current; when your change sets or changes something future tickets must follow, add or adjust a line here.

## Standing preferences (repeated or explicit)

- **Third-person exploration game.** You play a kid character in a free-roam world, with the camera behind and a
  little above them. You walk up to animals to do things. The old top-down/orbit view is no longer the main view;
  the orbit keys and buttons now swing the camera around the player.
- **One camera: the chase camera.** Everything happens from behind the player: finding animals, care, reveals. No
  overhead, close-up or focus views, and no camera that leaves the player. To draw attention to something, turn the
  player and chase camera toward it. In code: `SA.render.createCameraRig` is chase-only (the classic top-down mode,
  `focusOn` and `release` are deleted); `rig.glideTo(x, z)` turns the player toward a point (hint arrow, easter-egg
  reveal). Care tasks do not touch the camera at all.
- **No modes: keys always move the player.** Arrow keys/WASD only ever walk the player; nothing (finding an animal,
  care, menus) switches the keyboard to controlling something else, and there is never an "Escape to unlock". The
  mouse or a tap clicks on things (body parts, items); Space uses the equipped item.
- **Being close matters.** Inspecting, caring and photographing need the player within reach. Too far gives a
  friendly "¡Acércate!", never a wrong answer. Rule: `SA.reach.canReach(player, animal, part?)` (game/reach.js, player
  `y` is its standing height so climbing raises reach); `render/picking.js` gates every pick and rub through it and
  fires `SA.reach.notifyFar` (bubble + hint-arrow nudge) instead of `SA.picking.emit`.
- **Go vertical.** Birds, monkeys and toucans live in tree canopies, so you climb trees to reach them (and the fruit
  up there). Climbing down is always safe. Data: animal `perch: "tree"` (mono, tucán); `SA.perch` (game/perch.js, pure,
  seeded) picks canopy branch spots on the biome's trees and hops between them; they are out of reach from the ground
  (`SA.reach` compares heights) until the player climbs. Climbing: `SA.climb` (game/climb.js, pure, also
  `SA.player.climb`) steps a player state `{ x, z, heading, y, climb }`; icon-only 🧗/⬇️ button
  (`game/ui/climb-button.js`) plus Space/C when next to a tree (Space does nothing elsewhere, so it stays free for
  "use item"). On the canopy you walk freely; walking off the edge or the down button climbs down to dry ground, no fall.
- **Tasks while roaming.** Missions ("Busca un animal con orejas largas") sit on a card while you explore freely. You
  complete a find by taking a photo with *la cámara*, and the photo album rewards exploring.
- **Inventory and tools.** You start with *cámara, cepillo, esponja, venda* and find more (*plátanos, rocas, flores,
  hojas, peces*). Equip an item from the hotbar (tap or 1-9) and use it with **Space, a mouse click or a tap** on
  the highlighted part. Clicking and touching animals directly stays first-class.
  Model (AS-0078): items are data in `game/data/items.js` (kind tool|food|find, food ids reuse `foods.js`);
  `SA.inventory` (game/inventory.js, pure) does add/remove/count/list/equip/equipped over `SA.save` (save v3,
  `inventory: { items: [{id, count}], equipped }`; new and old saves get the starting kit, nothing equipped).
  Hotbar (AS-0102): `SA.hotbar` (game/hotbar.js, pure) maps inventory items to slots 1-9 (`pressKey('1'-'9')` equips,
  `'0'` empties hands, `tapSlot(n)` toggles); `game/ui/hotbar-view.js` is the icon-only bar at the bottom centre
  (72px slots, count badge, ringed equipped slot). Digits 0-9 belong to the hotbar; don't bind them elsewhere.
  Name chip (AS-0103): equipping shows a chip above the bar (icon + "el cepillo") and speaks `item:<id>` via
  `SA.audio.say`; unequipping hides it. `SA.hotbar.nameChip(id)` is the pure lookup (item data/vocab, no special cases).
  Item in hand (AS-0104): every item needs a spec in `game/data/hand-models.js` (kind `handmodels`: boxes, cylinders,
  spheres, cones, flat colours, validated; a test fails if an item has none). `SA.render.createHandItem` builds it on the
  avatar's right arm and swaps/removes it as `SA.inventory.equipped()` changes. It is never part of any pick volume.
- **Forgiving aim.** The nearest in-reach part within a generous radius highlights and stays highlighted, so being a
  few pixels off the feet still counts. A 7-year-old should never fight the aim.
- **You always see what Space will hit.** Whatever Space would act on right now (an animal part, a climbable tree, a
  pickup) is the one object with a bright outline; nothing else has it. No outline means Space does nothing.
- **Care is physical and silly.** Brush fur, wash with the sponge, bandage, rub *la barriga*, feed by hand, tug a leaf
  off a tangled wing so the bird can fly. The wrong tool or part gets a funny reaction plus the Spanish words, never
  a penalty.

## Unchanged from the spec

Visual-first and low-reading, correct Spanish grammar agreement, never punish, original Easter-egg creatures (no
franchise copies), file:// with vendored three.js, data-driven content, privacy-safe local telemetry.

## Log

- 2026-11-22: pivot to third-person free roam, reach, climbing, inventory, tools, photo missions and album
  (tickets AS-0069 to AS-0085). Mouse/tap on a part works as well as Space.
- 2026-11-22: chase camera only. The care close-up ("on top of the player" view) is removed (AS ticket from Jason's playtest).
- 2026-11-22: no keyboard lock-in. Part-cycling with arrows/Escape is removed (AS-0093); keys always move the player, mouse/tap picks parts.
- 2026-11-22: one visible Space target. Whatever Space would act on gets a distinct outline (AS-0101; folds in AS-0100).
