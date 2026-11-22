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
- **Soft things don't block.** The player walks through flowers, grass and small animals; only trees, rocks, ponds and
  big animals block. You never start stuck or have to wait for an animal to move. Built (AS-0105): the spawn is fixed
  (`SA.player` SPAWN) with a clear radius `SA.player.SPAWN_CLEAR` (5): seeded decor skips it, `animal-plan` placements
  stay SPAWN_CLEAR + 1 away, wanderers get `SA.player.spawnZone()` as an avoid point, and `SA.player.step` lets a player
  who overlaps obstacles (wedged between trees and an animal) walk or slide out instead of being pinned.
  Built (AS-0106): the player walks through flowers and small animals, never through trees, rocks or big animals.
  Blocking is data: decor in `game/data/decor.js` (`solid`, `radius`; builders tag meshes `userData.decor`), placed props
  carry `solid` (flores false), animals use `SA.animals.BLOCK_RADIUS` by size trait (pequeño 0). `SA.blocking`
  (game/blocking.js, pure) builds the obstacle list; wanderers still keep clear of every decor item and prop.
  New decor or props must declare `solid`; untagged decor blocks by default.
- **Everything sits on the terrain (AS-0091).** `SA.map.groundHeight(x, z)` is the one height source. The player's `y` follows
  it every frame through `SA.map.followHeight` (eased, bounded lag; used by `SA.climb.step`), animals (`render/ambient.js`),
  pickups, decor and props all read it, and the chase camera is lifted by `SA.map.cameraHeight` so it never dips into hills.
  New things placed in the world must take their `y` from `groundHeight`, never a constant.
- **Water is a soft wall for the player (AS-0077).** `SA.player.step` never leaves the player in `SA.map.isWater`: walking
  into water slides along the shore (never a penalty), and a player who starts in water goes to `SA.player.nearestDry`.
  `SA.player.heightAt(x, z)` is the pure feet-height helper. Tree canopies pass `{ water: false }`. Because the river
  runs the full map height, `SA.map.FORD` (z = 19, near the spawn) is a dry crossing so the west half and the montaña stay
  reachable; a test flood-fills the map from the spawn. Keep any new water body crossable the same way.
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
  Built (AS-0084): the round IS the photo mission. The top card keeps the clue, Replay and a 📷 badge (tap = equip la cámara);
  only a pick made with `item: 'camara'` answers it (`SA.prompt` `photoMode`, set by main.js; other tools or empty hands on an
  animal leave the mission alone so you can roam and care meanwhile). `SA.photo` (game/photo.js, pure): `isShot`, `judge`
  (match|other|none), `record` (save `photos: { animalId: count }` for EVERY photo, right or not, for the album AS-0085) and
  `take(game, pick)`. A shot plays SFX `shutter`, a white flash and a framed snapshot (icon + Spanish name) that slides in; a
  match is the normal celebration + star; a different animal gets "¡Qué foto! Pero busca…" (`phrase:quefoto`) and the clue
  is replayed, the round continues (counts a miss for adaptive difficulty, never a penalty).
- **Photo album (AS-0085).** The 📖 button (right side, under 🏡) opens a page of cards, one per species: photographed = icon, Spanish
  name and its body parts as icon chips (tap the card or a chip to hear it); not yet photographed = a dark "?" silhouette that stays
  silent. Easter-egg creatures only appear once photographed. `SA.album` (game/album.js, pure) reads/writes save `album: { animalId:
  'YYYY-MM-DD' }` (first-photo date, no images; `SA.photo.record` calls `SA.album.add`) and builds the cards from animal/part data
  (parts carry an optional `icon`); `game/ui/album-view.js` is the DOM page and pauses picking while open.
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
- **Collectible finds (AS-0080).** Pickups are data in `game/data/pickups.js` (rule: item, where `tree|ground|water`, biomes,
  count, respawn seconds; vocab `found:<item>` = "¡Un plátano!"). `SA.pickups` (game/pickups.js, pure, seeded) lays them out
  (fruit on canopy branches via `SA.perch.spots`, so you climb for it) and handles collect + respawn; `game/render/pickups.js`
  draws them (item model, bob, sparkle). Walking into one or pressing Space next to one adds it to `SA.inventory`, with pop
  SFX and the spoken name. Keep new finds as data rules, not special cases.
- **Forgiving aim.** The nearest in-reach part within a generous radius highlights and stays highlighted, so being a
  few pixels off the feet still counts. A 7-year-old should never fight the aim. Built (AS-0081): `SA.aim` (game/aim.js,
  pure) = `nearest(pointer, candidates, {touch})` + `create()` sticky target with hysteresis (acquire 48px, ×1.5 for touch,
  kept to 1.3× that, a challenger must be 30% closer to steal it; an exact pick-volume hit wins). `render/picking.js`
  projects the in-reach parts every frame, aims from the mouse (or the screen centre for keyboard/touch play), keeps that part
  highlighted, and exposes `picking.target()` / `picking.useTarget()`. **Space** (via the one `SA.spaceUse` dispatcher), a click, a tap (falls back to the nearest in-reach part when it misses every volume) or the touch
  🤚/item **use button** (`game/ui/use-button.js`) all go through one `select()`, which emits
  `SA.picking.emit({ animalId, part, item? })`; `item` is the equipped item id, absent for empty hands (= pet/inspect).
  Tool/food behaviours (AS-0082) read `item` from `SA.picking.onPick`; don't add a second Space path.
- **One Space target (AS-0107).** `SA.spaceTarget` (game/space-target.js, pure, allocation-free) picks the single thing Space acts
  on: the AS-0081 aim part first, else the nearest and most in-front climbable tree (`SA.climb.RANGE`) or pickup in reach
  (`SA.pickups` SPACE_RADIUS), with hysteresis so it never flickers. `SA.spaceUse` (game/space-use.js) is the ONLY Space key
  handler: it uses the part, climbs that tree (`rig.climbTree`) or collects that pickup (`pickups.collectSpot`), never two at
  once; with no target Space does nothing (up a tree it still climbs down). `render/picking.js`, `camera-rig.js` (C still
  climbs) and `render/pickups.js` have no Space key. `spaceUse.target()` is what the outline (AS-0101 slice 2) should glow.
- **You always see what Space will hit.** Whatever Space would act on right now (an animal part, a climbable tree, a
  pickup) is the one object with a bright outline; nothing else has it. No outline means Space does nothing.
  Built (AS-0108): `render/target-outline.js` draws a warm yellow, gently pulsing back-face shell (one shared material, no
  per-frame allocation) on `spaceUse.target()` only; it is also the climbable-tree cue, so never add a second highlight.
  Mouse hover glow is separate.
- **Care is physical and silly.** Brush fur, wash with the sponge, bandage, rub *la barriga*, feed by hand, tug a leaf
  off a tangled wing so the bird can fly. The wrong tool or part gets a funny reaction plus the Spanish words, never
  a penalty.
  Built (AS-0082): tool actions are data in `game/data/actions.js` (`{ id, item: itemId | "hands" | "food", parts, verb {es,
  imperative}, reaction, sfx }`: cepillar=cepillo on *el pelo*, lavar=esponja, curar=venda, acariciar=empty hands on *la barriga*,
  alimentar=any food item); each `careTasks` entry names its `action` and its prompt starts with that verb ("Lava las patas",
  "Cepilla el pelo", prompt shows the tool icon). `SA.care.tap({ animalId, part, item })` only progresses on the right tool AND part;
  anything else is `wrong` with `reason` `tool|part` and `careFlow` toasts and speaks `item:<id>` then `part:<key>` (never a
  penalty). Hand feeding: Space with a food equipped calls `care.feed(food, true)` and removes it from `SA.inventory` only when
  accepted; the tray still feeds for free. New actions are table rows, not special cases. Only mammals have *pelo*/*barriga* so far.
  Built (AS-0083): tangled wing. Action `desenredar` (empty hands on *las alas*, `tangled: true`, `gives: 'hoja'`, `say:
  'phrase:yapuedevolar'`) + care task "Quita la hoja de las alas" (3 tugs, only animals with alas). While it runs
  `ambient.setTangled` makes the bird hop on the ground with drooping wings (no flying) and `care-fx` puts green leaf bits on
  one wing; the last tug calls `fx.fly` (`ambient.flyLoop`: a spinning circle in the air), adds the leaf to `SA.inventory`
  and speaks "¡Ya puede volar!". Optional action fields `tangled`/`gives`/`say` are the pattern for other "stuck" care needs.

## Unchanged from the spec

Visual-first and low-reading, correct Spanish grammar agreement, never punish, original Easter-egg creatures (no
franchise copies), file:// with vendored three.js, data-driven content, privacy-safe local telemetry.

## Log

- 2026-11-22: pivot to third-person free roam, reach, climbing, inventory, tools, photo missions and album
  (tickets AS-0069 to AS-0085). Mouse/tap on a part works as well as Space.
- 2026-11-22: chase camera only. The care close-up ("on top of the player" view) is removed (AS ticket from Jason's playtest).
- 2026-11-22: no keyboard lock-in. Part-cycling with arrows/Escape is removed (AS-0093); keys always move the player, mouse/tap picks parts.
- 2026-11-22: one visible Space target. Whatever Space would act on gets a distinct outline (AS-0101; folds in AS-0100).
- 2026-11-22: clear spawn, never stuck (AS-0105); walk through flowers and small animals (AS-0106).
