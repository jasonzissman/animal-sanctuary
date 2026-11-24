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
  reveal) with a ~300 ms eased, shortest-angle turn (`SA.turn`, pure); walking input cancels it. Care tasks do not touch the camera at all. The camera does not clip through trees, rocks or big animals:
  `SA.camera.clearPath(player, wantedCamPos, obstacles)` (same `[[x, z, r], ...]` list the player collides with) returns
  how far out the camera may sit (never below `minClear`), smoothed by `easeClearance` (pulls in fast, relaxes slowly).
- **The chase camera shows what is above you (AS-0116).** Near tree animals or up in a canopy it eases back and tilts
  up on its own so birds and monkeys are on screen; on open ground it eases back to normal. Still one camera, no
  button to learn (`SA.camera.frameAbove` in `game/camera-frame.js`: extra distance, lower pitch, higher look-at, small fov
  widening, eased ~0.5 s; a drag overrides it; `hooks.chase.above()` supplies perched animals). Space jumps everywhere, including in a canopy (AS-0115).
  **Never tilt away from a ground animal (AS-0216):** a Use target on the ground in reach (`hooks.chase.ground()`: animal part,
  pickup, NPC) cancels the look-up; a perched animal counts only inside a ±50° forward cone and after ~0.6 s standing still
  (`SA.camera.frameHold`; walking resets it at once); the look-at rises only enough to keep the player's feet and the animal
  on screen. Canopy framing is unchanged.
- **The game starts at a research station (AS-0141, slice 1 = AS-0145).** A small low-poly building (door, window, roof, dish, antenna,
  "Estación" sign with an atom icon, bench, crates) stands on the flattest dry ground by the bosque/selva border; the kid spawns just outside
  the door. **Spawn pose (AS-0212):** on every load the kid stands ~2.6 in front of the front wall, straight in front of the scientist's post
  (`layout().scientist`, 1.7 right of the door's centre line, 0.9 in front of the wall) and faces her and the building (heading 0 = +z); she
  fills the view and the doorway is beside her (~30° off-axis). `SA.station.spawn()` / `SA.player.spawn()` stay the single source;
  `SA.npc.scientist()` reads her post from the layout. `SA.station` (game/station.js, pure) is the one source: `layout()`, `collisionBoxes()` (doorway left open),
  `obstacles()` (those boxes as circle chains, appended to the player's obstacle list in scene.js), `spawn()` (what `SA.player.spawn()`
  returns when the module is loaded) and `inFootprint()` (decor and animal placement keep out). `game/render/station.js` builds the model
  from flat primitives (the sign letters are boxes, no textures; the block font is shared in `render/block-text.js`). Later slices put the scientist and briefing in/at the station.
  **"Lista de misiones" board (AS-0210, slice 1 of AS-0205):** `layout().board` sits on the back wall's inner face facing the door (it is in `collisionBoxes()`);
  `render/station-board.js` builds it (frame, title, scribbles, doodles) and `update()` swaps the title to "Mission list" when the English scaffold is on.
  **The board is the missions entry point (AS-0211, slice 2 of AS-0205; it replaces the AS-0146 door target).** The door frame is no
  Use target, glows nothing and has no tap volume: walking through the doorway just enters. `game/station-board.js` adds
  `SA.station.boardTarget()/boardTargets()` (the board's centre from `layout().board`, reach `BOARD_REACH` 3.0, i.e. the back half of the
  room) and `canTapBoard(player)`, plus the menu hook (unchanged): `SA.station.open(source)` / `close()` / `toggle()` / `isOpen()` /
  `onOpen(fn)` / `onClose(fn)` (`SAT.track('station.open', { source: 'board' | 'tap' })` once per opening). `SA.spaceTarget` takes `boards`
  (kind `'board'`, scored like trees and pickups, so it hands off by proximity and facing) and `npcs` (kind `'npc'`, the scientist);
  `SA.spaceUse` calls `openBoard(board)` (scene.js: `SA.station.toggle('board')`) or `talk(npc)` on E / Enter (Space jumps, it never
  opens it); the board group (`station.userData.board.group`) is what the one outline glows; `render/station-board-tap.js` raycasts the
  board's invisible pick volume (`userData.stationBoardPick`) so a tap/click on it calls `SA.station.open('tap')` too. `ui/station-menu-view.js` is only a
  placeholder card (⚛️ + "La estación" + ✕); the customizer (AS-0144) attaches via `SA.station.onOpen` and renders into the view's `body`.
  **Insignias board (AS-0239, slice 1 of AS-0219):** a second board on the FRONT wall's inner face, left of the doorway, opposite the
  missions board (`layout().badgesBoard`, faces +z, solid like the other). `SA.station.badgesTarget()` (`{ id: 'station-badges', kind:
  'board', source: 'badges' }`) joins `boardTargets()`; the chooser, the outline (scene.js `nodeFor`) and `render/station-board-tap.js` (a second
  instance with `target` + `source: 'badges'`) treat it like the missions board, but it opens the card with source `'badges'`
  (`SAT.track('station.open', { source: 'badges' })`; `SA.station.openSource()` says which board opened the card). The model is
  `SA.render.createStationBoard(THREE, { key: 'badgesBoard', badges: true, titles })`: "Insignias" ("Badges" with English on) and medal doodles.
  The pure `SA.badgesBoard.rows()` (`badges-board.js`) maps `SA.badges.progress()` to `{ id, icon, name, have, need, earned, text }` (`text` =
  `n/m` or ✅); `ui/badges-board-view.js` draws icon + name + text rows into the same station `body` and shows only for source `'badges'`
  (the missions view hides itself for that source). **Card polish (AS-0240, slice 2):** rows also carry `es`, `goal`, `say`, `fraction`
  (0..1), `state` (`earned` | `progress` | `locked`) and `locked`; `SA.badgesBoard.goal(rule)` builds the short Spanish goal ('Rescata 5
  conejos', 'Quita 1 espina', digits + an agreeing noun, never over ~6 words). The view adds a progress bar per row, ✅ when earned,
  grey for not-started rows, a scrolling list (title + rows only), and a tap says `row.say` = name + goal via `SA.audio.say`.
  **Misiones board (AS-0197):** `ui/missions-board-view.js` renders into that `body` (re-rendered on every open) from the pure
  `SA.missionsBoard` (`missions-board.js`: `cards()` maps `SA.missions.list()` to done ✅ / next ⭐ / active ▶️ / locked 🔒 cards,
  `layout()` sizes a wrapping, scrolling grid so cards never overlap each other or the ✕). Tap done = replay, next = start (the
  scientist's intro comes in the next ticket), active = En curso + Continuar / Abandonar; locked cards are grey numbered silhouettes
  that only say "Misión N". Every card speaks via `SA.audio.say`.
  **Every prompt needs at most one press; one short line per prompt (AS-0220).** No "Siguiente" steps anywhere. The mission start is
  ONE card: mission icon, title, one spoken line and a big "¡Vamos!" (tap, Enter or E) that calls `SA.missions.start` at once; 🔊
  replays, ✕ goes back to the board. The finish cheer is one strip with no button. Data: `intro: { es, icon, en? }` (one object, ≤ 4
  words, validated at load; arrays are rejected). New prompts must follow this rule.
  **Scientist on the board (AS-0198, simplified by AS-0220):** tapping the glowing next card no longer starts it: the scientist
  shows the start card above (a done card still replays at once). The talk replaces the grid inside the same station
  card (never a second overlay). `SA.missionsDialogue` (`missions-dialogue.js`, pure): `begin/view` build the single card;
  `celebration()` / `markSeen()` give the one-time cheer (fanfare + "¡Lo lograste! ¡Nueva misión!") the first station visit after a
  mission is finished, pointing 👇 at the unlocked card; "seen" is `missions.celebrated: [id]` in the save, so replays never re-cheer.
  **Scientist greeting on every load (AS-0213, replaces the AS-0202 first-run intro):** the long intro that started Mission 1 by
  itself is retired (`SA.introDialogue`, `intro-view.js`, `data/intro.js` are gone). As soon as the world is shown (every load, not just
  a new save) ONE card shows the scientist's message: exactly the lines `SA.scientistTalk.reminder()` returns at that moment, in the
  same order, as plain icon-free text (AS-0227: the old separate `saludo1/2` lines are gone, so startup and talking to her always
  match); English toggle text comes from each line's `en`; `SA.audio.say` speaks the lines in order; 🔊 replays. It closes on ✕, Enter / E (swallowed so it does not also talk to her), a tap, or the moment the kid walks
  (WASD / arrows, or moving more than ~0.35 away from where it opened). Never stepped through. The open/close rules are the pure
  `SA.greeting` (`greeting.js`: `create() -> open/close/onKey/onTap/update`, tested in node:vm); `ui/greeting-view.js` is the overlay.
  No mission starts by itself: missions are chosen at the board. A fresh save still has la cámara (the starting kit). `introSeen` in
  the save is retired: new saves do not get it, existing saves keep it untouched (nothing reads it; no version bump).
  **Hook for the board (AS-0142):** `SA.missionsBoard.pointAndStartFirst()` opens the station, points at the next card
  (mission 1 on a fresh save) and runs its intro; returns `{ ok, id }` or `{ ok:false, reason:'busy'|'none'|'no-board' }`.
  **Using the scientist (AS-0204, slice 3/3 of AS-0142):** E / Enter (she is a target in `SA.spaceUse`'s `npcs` list, kind `'npc'`,
  `SA.npc.useTarget()`) or a tap on her invisible pick volume (`userData.scientist`, `render/scientist-tap.js`) calls `SA.npc.talk(source)`.
  `ui/scientist-view.js` shows a card and speaks it: the one-line mission "Ayuda a los animales: busca, ayuda, foto", then the current
  mission title and the step it is on, or "Elige una misión en la estación" when none runs. **One shared, icon-free message
  (AS-0227):** the text comes from the pure `SA.scientistTalk.reminder()` (`scientist-talk.js`, step kinds -> vocab key); both this
  card and the startup greeting render exactly those lines as plain text, with no emoji icon rows (only 🔊 and ✕). `icon` stays in
  the line data for other users (board cards), but these two cards never draw it. 🔊 replays it, ✕ closes it (the old 💬
  "replay the intro" button went away with the intro, AS-0213). She never starts a mission: missions start only at the Misiones board.
- **Climb anything too steep to walk (AS-0163 to AS-0165).** Trees, mountain peaks and the station all climb the same way:
  face it -> outline -> E/Enter, or push forward 0.6 s. Tops are flat enough to stand and turn (peaks: a 2-3 unit summit);
  walk or jump off the edge to drop down safely. Climb targets are data; anything new that is too steep joins them.
  Built (AS-0192): `SA.climb` takes plain target data `{ kind: 'tree'|'peak'|'building', x, z, radius | footprint {w,d}, topY,
  top: { shape: 'circle'|'rect', size } }` (range is to the base edge; `SA.climb.fromTree` adapts trees, so tree callers are
  unchanged). On top the climb mode is `'canopy'` for trees and `'top'` for the rest (`SA.climb.onTop(state)` covers both); you
  walk the flat top at `topY`. Walking off the edge is a short no-damage fall arc (`climb.mode 'down'`, `fall: true`) to dry
  in-bounds ground (else the spot you climbed from); the landing frame carries `state.land` (`SA.climb.landed(state)`) to track.
  Built (AS-0193): the six grey peaks are data in `game/peaks.js` (`SA.peaks.LIST` rows `{ id, x, z, height }`). `SA.map.groundHeight`
  raises each into a cone mound with an exactly flat summit of radius 1.4 at `topY` (`SA.map.baseHeight` is the terrain without them);
  `SA.peaks.targets()` gives the `kind: 'peak'` climb targets and decor draws a flat-topped grey cone over each mound (solid 'pico').
  scene.js builds ONE `climbables` list (trees + peaks) for the camera rig (E/C/auto-climb), the Space chooser/outline and the ring;
  the rig tracks the walk-off landing as `SAT.track('climb.land', { kind, y })`. New steep things: add a data row, no engine branch.
  **Stay on the surface (AS-0214):** the terrain mound IS the drawn 8-sided cone (`SA.peaks.moundY` / `surfaceY`, PAD wider than the old
  straight mound; the renderer draws it 0.02 wider again so nothing z-fights). Every climb animation frame (up, down button, walk-off fall,
  landing-assist hop) and every walking frame is lifted to `moundY` (`aboveRock` in `game/climb.js`), a peak's climb slides along its side
  over the whole climb, and the chase camera's height is lifted by `SA.peaks.cameraY` so it and its sight line never pass through a peak.
  Built (AS-0194): `SA.station.climbTarget()` is the `kind: 'building'` target (wall footprint, flat rect roof at topY) and joins
  `climbables` (trees + peaks + station). The Space chooser measures reach with `SA.climb.edgeDistance` for every kind, and the
  outline finds a target's node by `userData.climbId === target.id` (peaks, station), so no kind-specific branches remain.
  Built (AS-0165): the station doorway never climbs. Target data may carry `noClimb: [{x0,x1,z0,z1}]` ground zones (the station: the doorway
  strip and the room inside); `SA.climb.edgeDistance` is Infinity there, so nearest/start/auto-climb/the Space chooser skip it. The chooser
  scores a rect-footprint target by its nearest wall point (`SA.climb.focusPoint`), so a wall beside the door is a climb and the door is
  still the Use target when you face it. `top.solids [[x, z, r]]` keeps the dish and antenna solid on the roof (walked with SA.player.step).
  Jumping on any top works as on the ground (lift on top of topY); jumping past the edge is the normal walk-off fall.
  Treetop hopping (AS-0166): treetops are flat standable tops (decor draws a flat leafy pad at canopy height), and a landing
  assist lands you on the tree you jump roughly toward (~7 units, ~40 degrees). Be generous: kids should chain tree to tree easily.
  Built: `SA.climb.landAssist(state, targets, lift)` (`game/climb-assist.js`, pure; `ASSIST_RANGE` 7, 40 degrees, top at most
  0.6 above y + lift, so a hop (1.2) or double jump (2.4) never pulls you up a much taller tree). `SA.climb.step(state, input, dt,
  obstacles, targets)` calls it when you leave a top (jump or plain walk-off; `input.lift` is the hop lift): a 0.5-0.9 s hop (climb mode
  `'down'` with `assist: true`) that ends standing ON the new top with the usual `land` frame. No target = the safe fall. The rig passes
  the climbables list; targets are generic, so peaks and the station roof can be hop targets too.
- **The world reacts to bumping (AS-0156, AS-0157).** A cactus pricks: bounce back with "¡Ay! ¡Pica!" (never a penalty).
  Built (`SA.prick`, pure): decor data `prick: true` marks a prickly solid; touching it knocks the player ~1.5 units straight
  away over ~0.25 s (eased, little hop, red flash), shortened so it never ends in or crosses another solid or leaves the map; the
  `ouch` SFX + `phrase:ay` play at most once per 2 s. The camera rig runs it after the walking step.
  Keep pushing forward into a tree for 0.6 s and you climb it (a filling ring shows it coming); C/E still climb instantly.
  Built (AS-0157): `SA.climb.autoStep(timer, before, after, input, trees, dtMs)` (pure; `AUTO_CLIMB_MS` = 600) runs after the walking
  step in `camera-rig.js`; it needs forward held (keys or joystick), a climbable tree within ~2.2 units, facing within 45 degrees,
  and no real progress (blocked). Only the climb-target list is passed in, so cacti and rocks never trigger it. The ring is
  `render/auto-climb-ring.js` (fed by `rig.autoClimb()`). New climb targets (peaks, station) join by being in that list.
- **Movement has sound (AS-0118 to AS-0120).** Soft footsteps (quicker when running, splashy in water, leafy in a
  canopy), a hop and a landing thump, a splash entering water, a rustle while climbing. Short, quiet, never spammy; mute silences all.
  Footsteps are done (AS-0118): pure `SA.footsteps.step(state, {moving, running, air, climbing, surface}, dt)` -> `{state, event}`
  (0.45 s walking, 0.28 s running, none still / airborne / climbing); the camera rig only wires it to `SA.audio.sfx(name, volume, rate)`
  (`rate` = tiny pitch shift). Recipes `step`, `stepWet`, `stepLeaf` (gain <= 0.15). Landing/climb sounds reuse `sfx` the same way.
  Water and climbing are done (AS-0120): pure `SA.movesound.step(state, {water, air, climbing, canopy}, dt)` -> `{state, events}`
  (`game/movement-sounds.js`): one `splash` (volume 0.5) on the dry-to-water edge, at most once per 1 s (a hop landing in water is
  `SA.footsteps.landSound`'s, so no double); `rustle` every 0.35 s while the climb up/down animation runs; one `leafPop` on arriving in the canopy.
- **Uncluttered screen, nothing overlaps (AS-0147 to AS-0149).** All HUD positions come from one pure layout (SA.hud),
  tested for overlaps at phone to desktop sizes. The mission is a small pill (tap = replay), not a banner: audio carries
  instructions. Few icons: pill, stars, hotbar and one 🎒 menu; touch controls only on touch. When in doubt, remove an icon.
  `game/hud.js` (AS-0150) is that layout: `SA.hud.layout({width,height}, visibleIds)` returns a rect for every HUD id from named zones
  (topLeft, topRight, transient strip, bottomCenter/Left/Right, floating); sizes live in its data table (regular and compact for
  phones). New HUD elements add an id and size there, never a fixed CSS offset. AS-0148: the `prompt` rect is a small pill at top-left
  (height <= 6% of the viewport, width <= 45%, capped at 480 px; sized in `hud.js`, not the SIZES table). Tapping the pill replays the
  audio; it holds only the clue icon + short phrase (plus a plain 📷 badge when a photo is due): no replay, hint or camera buttons
  (the hint still reveals itself after 20 s; la cámara is in the hotbar). `game/ui/prompt.js` is migrated (pill, stars
  under it, toast, snapshot card, feed tray; re-laid out on resize). AS-0151 migrated the rest of `game/ui/` through
  `game/ui/hud-place.js` (`SA.hudPlace.register(id, el, {reserve, onPlace})`, `refresh()` after a show/hide, re-run on resize):
  one 🎒 menu button tops the top-right column (AS-0195, `game/menu.js` pure state + `game/ui/menu-view.js`): tapping it opens a
  2x2 grid under it of sound (mute), 🏡 habitat, 📖 album and ⚙️ settings (still press-and-hold). Those four buttons keep their
  own views and `SA.hud` slots (`audioUi`, `sandbox`, `album`, `settings`, always reserved) and are only shown while the menu is
  open; it closes on an outside tap, Escape or after habitat/album/settings is used; M toggles mute without opening it. A new
  rarely used button goes into this menu (add an `SA.menu.ITEMS` entry), not onto the always-visible HUD.
  Touch controls only on touch (AS-0196, `game/touch.js`, pure): `SA.touch.get(win)` is true on `(pointer: coarse)` or after the
  first touch/pen pointerdown (a mouse never counts). The joystick, orbit pad and jump button show only then; the climb and use
  buttons also need to be able to act (`SA.touch.visible(touch, canAct)`: something climbable in reach / a usable target). E, C and
  Space never depend on the buttons. With mouse and keyboard only pill, stars, hotbar and the 🎒 menu are visible. Hotbar and name chip, joystick, orbit pad, use/jump/climb sit in their zones, the sandbox
  prop tray uses the `feedTray` slot and its messages the `toast` slot, and the roaming hint arrow is nudged clear of every rect
  (`SA.hud.nudge`). A test greps `game/ui/*.js` for numeric top/left/right/bottom on `position:fixed` elements: add a new HUD
  element as an id + size in `hud.js` and register it, never a CSS offset.
- **Messages always win (AS-0121).** No HUD element may cover a message, animal name or part label. The equipped-item
  name chip only flashes for ~1.5 s on equip and hides while a message shows; the highlighted hotbar slot is the lasting cue.
- **No modes: keys always move the player.** Arrow keys/WASD only ever walk the player; nothing (finding an animal,
  care, menus) switches the keyboard to controlling something else, and there is never an "Escape to unlock". The
  mouse or a tap clicks on things (body parts, items); E/Enter uses the equipped item, Space jumps.
- **Hold Shift to run (AS-0094).** Shift (either side) is a held modifier, never a mode: while it is down, moving forward
  uses `SA.player.RUN_SPEED` (10, 2.5x `SPEED`; AS-0110) via `input.run`; backing up stays at `BACK_SPEED`. `SA.player.step`
  sub-steps each move to at most `RADIUS` long so running (or a slow frame) never tunnels through thin obstacles. The touch joystick
  runs when pushed forward to its outer edge (`SA.joystick.RUN_AT`). Bounds, soft collisions, water and reach apply
  unchanged; the avatar's stride plays faster (`rig.getPlayer().running`). Shift triggers nothing else.
- **Keys for a 7-year-old (AS-0111, AS-0112). Space twice = double jump (AS-0126).** Arrows/WASD walk, Shift runs (about 2.5x, AS-0110), **Space jumps**,
  **E or Enter uses** the equipped item on the outlined target (climb, pick up, care, photo), 1-9 picks a hotbar item,
  click/tap on the outline also uses it. Wherever the notes below say "Space" for using/acting, read E/Enter.
  Implemented (AS-0111): `SA.spaceUse.isUseKey(e)` (game/space-use.js) is the one key map (E/e/Enter/KeyE; modified keys,
  Space and focused buttons/inputs never). Space does nothing there, so jump (AS-0112) can own it. E no longer orbits the
  camera: swing left/right is **Q / T** (R/F tilt). There is no keyboard hint on screen; touch keeps the big use button.
- **Space hops (AS-0113, slice 1 of AS-0112).** `SA.jump` (game/jump.js, pure) is a vertical `lift` on top of walking: about 1.2 units
  high, 0.6 s in the air, simple gravity. It never touches x/z, so a jump while walking or running keeps its momentum and trees and
  rocks still block in the air. It is **not a climb**: `lift` is kept apart from the player's standing `y` (which `SA.reach` and the
  chase camera use), so a hop never reaches canopy animals; the avatar is drawn at `y + lift` and lands exactly back on the terrain.
  One hop per press: a held Space does not chain (the rig re-arms only on a fresh, non-repeat keydown or after release); no hopping up
  a tree *during the climb up/down animation*; standing in the canopy (`climb.mode === 'canopy'`, AS-0115) you can hop on top of the tree
  too: the lift sits on the canopy standing `y`, lands back on it, never drops you off, and starting a climb down ends the hop. The rig reads Space (also Shift+Space; not on a focused button/input) and exposes `getPlayer().lift`; takeoff plays
  `SA.audio.sfx('hop')`; the avatar squashes/stretches.
  **Double jump (AS-0126):** `SA.jump` state has `jumps` (0..`MAX_JUMPS` = 2). A fresh press (released since the last takeoff, the same armed
  rule) while airborne with `jumps < 2` resets `vy` to a full takeoff speed from the current height and emits `event: 'double'` (rig plays
  `SA.audio.sfx('hop2')`, the same boing an octave higher). A third press does nothing until landing; landing and `cancel` reset `jumps`;
  `allowed=false` blocks both; holding Space never chains. Still only a `lift`, never a climb for reach.
  **Touch jump button (AS-0114):** `game/ui/jump-button.js` is a round icon-only ⬆️ button (84 px, above the use button; appears at the first
  touch like the joystick) that calls `rig.jump()`, a fresh Space press with the same rule (one tap hops, a second tap in the air double
  jumps, no buffering once both are used, none during the climb animation).
  **Low solids (AS-0176):** an obstacle tuple may carry a 4th number `[x, z, r, h]` (data `height` on decor/props x the placed scale:
  rocks only). `SA.player.step` ignores it while `input.lift + CLEAR_MARGIN (0.1) >= h`, so one hop clears a normal rock and the
  biggest (about scale > 1.6) need the double jump. `SA.player.floorAt` gives the top under the avatar and `SA.jump.step(..., floor)`
  lands/stands on it (and falls when you walk off), so a jump never ends inside a rock. No height (trees, cacti, peaks, ponds, animals) = always blocks.
- **Walk on any hard ground (AS-0109).** Only solid obstacles and the map edge block the player. Water and dips never
  do: the player wades in and may go under the surface for a moment, the camera stays above it. This overrides the
  water soft-wall / nearestDry notes below; animals still avoid water.
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
- **The sun casts soft shadows (AS-0292).** `render/sun-shadow.js` makes scene.js's one DirectionalLight a shadow caster: a single
  2048 PCFSoft map whose ±32 window follows the player (texel-snapped, no per-frame allocation). Animals (re-marked when the herd
  group changes), the avatar, trees, rocks and peaks cast; the vertex-coloured ground receives. New world solids that should
  shadow must be under `decor`/`animals`, or be passed to `sunShadow.mark(node)`; flowers and invisible pick volumes never cast.
- **2-3 tree kinds per biome (AS-0296).** bosque pine/oak/birch, selva jungle/palm/kapok, desierto acacia/yucca (+ the prickly cactus, not a tree),
  montaña snowpine/fir. A tree is a decor data row with `kind` (game/data/decor.js: `roble`→`oak`, `ceiba`→`kapok`…); `kind` is its `SA.perch.KINDS`
  key (canopy height) and its builder in `game/render/trees.js`. **A new tree = a perch KINDS entry + a builder + a decor row (with `kind`) + a
  `SA.decorPlan.RULES` row**; the builder gives the group `userData.tree`/`userData.kind` and a flat canopy pad at the perch height, so climbing, perch,
  tree-tap, treetop tells and pickups work unchanged, and the solid decor radius keeps the trunk blocking. Plan entries carry `tint` (0..1, hashed from x,z so
  placement is unchanged) → one of 5 shared leaf materials per kind; the foliage group sways about the trunk top via `decor.userData.update(dt)`
  (preallocated list, no per-frame allocation).
- **Ground cover is soft, instanced and recycled around the player (AS-0294).** `SA.groundCoverPlan` (pure, seeded jittered grid per
  biome strip; tints from the biome data; keeps off water, spawn, station and peaks) plans grass tufts and tiny plants;
  `render/ground-cover.js` draws one `InstancedMesh` per biome/kind from a fixed pool refilled every metre walked (`select()`: full
  density near, thinning to a 30 m radius). Sway is a vertex-shader bend on one `uTime` uniform, no per-frame allocation. It is
  never added to obstacle/decor lists, so the player walks through it. More vegetation (bushes, ferns, tree kinds) should reuse this pattern.
- **Forest dirt paths (AS-0300).** `SA.forestPaths` (pure, seeded; `layout/paths/distance/onPath/strength`) routes 3 winding polylines through
  the dry parts of the bosque (A* over a 2 m grid, then corner-cut). `terrain-color.js` tints the ground a light tan by `strength()` (no extra
  mesh); `decor-plan.js` and `ground-cover-plan.js` skip anything on or beside a path. Paths are walkable ground, never obstacles. New scenery
  planners should call `SA.forestPaths.onPath(x, z, pad)` in their `usable()` check.
- **Forest streams (AS-0301).** `SA.forestStreams` (pure, seeded, `game/forest-streams.js`, loads after `forest-paths.js`) lays out 1-2 narrow
  streams: each starts at a dry source in the bosque, wiggles through a forest path at a `ford` (a row of stepping stones across the water, a few
  more stones along the stream) and ends in the middle of the river. The ground is NOT carved: `render/forest-streams.js` lays one merged water
  ribbon on the terrain (same `applyWaterWave` shader as the river) plus ONE `InstancedMesh` of stones, so `SA.map.isWater` stays river/pond only
  and the player wades freely (AS-0109). Stones are low solids `[x, z, r, h]` (`stoneSolids()`, added to `scene.js` obstacles): hop on and stand on top.
  Animals keep out: `wander.js`, `animal-plan.js`, `decor-plan.js` and `ground-cover-plan.js` call `SA.forestStreams.inWater(x, z, pad)`.
  New scenery planners should check it next to `SA.forestPaths.onPath`.
- **Fallen logs (AS-0302).** `SA.fallenLogs` (pure, seeded, `game/fallen-logs.js`, loads after `forest-streams.js`) lies 2 logs across each forest
  path (long enough to span the dirt strip) plus 2 off-path, on gentle dry ground clear of the spawn, station and streams. A log is a capsule
  (`ax,az -> bx,bz`, radius `r` 0.3-0.4) with a standing height `h` = 1.8 r (the top above the ground; a normal hop clears it). `solids()` turns
  each into overlapping `[x, z, r, h]` circles, the same low-solid shape as rocks and stream stones, so `scene.js`'s obstacles block walking, a jump
  (lift + margin >= h) passes over, and `SA.player.floorAt` lets you stand on top and walk along it at `h`. Pushing sideways into a log can slide
  you around its end, like a rock. Animals keep out: `wander.js` (`near(x, z, 0.6)`), `animal-plan.js`, `decor-plan.js`, `ground-cover-plan.js`.
  `render/fallen-logs.js` draws all trunks as ONE merged vertex-coloured mesh (tapered 7-sided cylinders tilted with the slope, light end caps).
- **Water moves and has edges (AS-0298).** The river and pond (`render/world.js`, geometry baked in world coordinates) move with a
  two-sine vertex-shader wave on one `uTime` uniform (`SA.render.applyWaterWave`; `world.userData.update(dt)` advances the clock, no
  allocation; constants in `SA.waterBanks.WAVE`, kept to a few cm so wading is unchanged). `SA.waterBanks` (pure, `game/water-banks-plan.js`)
  finds the real shore lines only on the water meshes (low ground elsewhere has no water) and seeds pebbles and reeds along them;
  `render/water-banks.js` draws a foam ribbon on the same wave plus one `InstancedMesh` each for pebbles and reeds. All soft, static.
- **Water never blocks the player (AS-0109, replaces the AS-0077 soft wall).** `SA.player.step` has no shore/nearestDry
  rule any more: only obstacle circles and the map edge stop the player. `SA.player.heightAt(x, z)` is the feet-height
  helper; the avatar follows the floor (so it can sink under the surface) and `SA.map.cameraHeight` keeps the chase camera
  above `WATER_LEVEL`. A test sweeps the map and asserts open terrain never blocks forward movement. `SA.map.FORD` stays
  as a shallow crossing but is no longer required for reachability.
- **Being close matters.** Inspecting, caring and photographing need the player within reach. Too far gives a
  friendly "¡Acércate!", never a wrong answer. Rule: `SA.reach.canReach(player, animal, part?)` (game/reach.js, player
  `y` is its standing height so climbing raises reach); `render/picking.js` gates every pick and rub through it and
  fires `SA.reach.notifyFar` (bubble + hint-arrow nudge) instead of `SA.picking.emit`.
  Every click or tap gets gentle feedback (AS-0096): `SA.clickOutcome.decide` (game/click-outcome.js, pure) says pick / far /
  ripple / none. A click that picks nothing (ground, sky, the player's own avatar, which is never a pick volume) shows a
  small ripple (`render/click-fx.js`) and, if an animal is on screen but out of reach, the "¡Acércate!" cue.
- **Go vertical.** Birds, monkeys and toucans live in tree canopies, so you climb trees to reach them (and the fruit
  up there). Climbing down is always safe. Data: animal `perch: "tree"` (mono, tucán); `SA.perch` (game/perch.js, pure,
  seeded) picks canopy branch spots on the biome's trees and hops between them; they are out of reach from the ground
  (`SA.reach` compares heights) until the player climbs. Climbing: `SA.climb` (game/climb.js, pure, also
  `SA.player.climb`) steps a player state `{ x, z, heading, y, climb }`; icon-only 🧗/⬇️ button
  (`game/ui/climb-button.js`) plus Space/C when next to a tree (Space does nothing elsewhere, so it stays free for
  "use item"). On the canopy you walk freely; walking off the edge or the down button climbs down to dry ground, no fall.
  **Treetop tell (AS-0117):** so kids know to look up, a tree with a perched animal now and then rustles (small lean),
  the animal gives a soft `chirp` (`SA.audio.sfx('chirp', volume)`, quieter with distance) while the player is within
  `SA.treetopTell.NEAR` (16 m), and a round shadow sits on the ground under it. Pure seeded timing in
  `game/treetop-tell.js`; thin THREE layer in `game/render/treetop-tell.js`. No text, no per-frame allocation.
- **A rich, varied world (AS-0129 to AS-0140).** Map ~2x area. Detailed but light: varied ground colours, grass, bushes,
  several tree kinds, moving water, faceted rocks, soft shadows. Each biome has character (forest paths, streams and fallen
  logs to jump; desert dunes, arch, oasis; mountain trail, waterfall; jungle giant trees, vines, waterfall). Keep adding
  variety with discretion: fun, never cluttered, ~60 fps (instancing, auto quality).
  Things to climb and cross (AS-0158 to AS-0160): river bridges, a rope bridge between mountain peaks, ladders up the
  station and lookout towers. Walkable surfaces and climb targets are generic data, so more can be added freely.
  Walkable decks (AS-0158): `SA.surfaces` (pure, `game/surfaces.js`) holds decks `{ x, z, dx, dz, halfLen, halfWid, y, ramp, railR }`:
  `SA.player.heightAt` returns the deck top over water, ramps ease the ends into the ground, rail circles (`surfaces.solids()`, no
  height, so a hop never clears them) are added to the player's obstacles in `scene.js`. Two seeded river bridges
  (`render/bridges.js`) plus every placed `puente` prop (`setPlaced`; the prop is no longer a solid blocker). A new walkable thing
  (rope bridge, tower deck) = one more deck record; use `SA.player.inWater` (not `SA.map.isWater`) for wading sounds.
  Rope bridge (AS-0159): `SA.ropeBridge` (pure, `game/rope-bridge.js`, mesh `render/rope-bridge.js`) joins the summits of `pico-n1` and `pico-n2`
  on the montaña as a fixed deck (`SA.surfaces.addFixed`, `rope: true`, a height `profile` from one summit height to the other). You climb a peak
  (the trail's lower legs pass close by), walk off the summit toward the other peak (`SA.climb` top mode hands over via `SA.surfaces.exitTo`) and
  cross. While you stand on a rope deck only its rails block (`SA.surfaces.ropeSolidsAt` replaces every ground obstacle in `scene.js`; they are NOT in
  `solids()`, so there is no wall on the ground below). A rope deck only counts for feet within `SA.surfaces.ROPE_REACH` (1.2 m) of its planks:
  `heightAt/onDeck/ropeSolidsAt(x, z, y)`, `player.heightAt(x, z, y)` and `confine` (uses `prev.y`) take the player's height, so walking on the ground
  UNDER the bridge neither lifts you onto it nor swaps in the rails (a call without y means the ground: animals walk beneath it too). `SA.surfaces.confine` (camera-rig, after each step) clamps you inside the ropes. The mesh sways
  and bobs a hair (more with you on it) and a soft `creak` SFX plays while you walk on it: visual/audio only, the surface never moves.
  Lookout towers (AS-0160): `SA.lookouts` (pure, `game/lookouts.js`, mesh `render/lookouts.js`): one seeded wooden tower in the forest and one in
  the desert, each with a ladder on one side. `SA.lookouts.targets()` are plain climb targets of kind `'ladder'` in the same `climbables` list as
  trees, peaks and the station; climb kinds are data in `SA.climb.KINDS` (`tree|peak|building|ladder`: mode on top, climb path, arrival spot), so the
  C / E / Space and 0.6 s push-to-climb flow is unchanged. Only the ladder side starts a climb (`noClimb` zones); `top.solids` is a gapless railing, so you
  cannot fall off; `solids()` are the legs on the ground. The station's own ladder was dropped: its walls are climbable (AS-0165).
  Rocks (AS-0299): `SA.rocks` (pure, `game/rocks.js`) gives a seeded spec per rock (boulder / flat / stack / jagged, trim, yaw, tilt, a
  per-biome colour: red-orange desert, grey mountain, mossy bosque/selva); `game/render/rocks.js` builds shared flat-shaded geometry.
  Every kind is normalised to about the data `height` of `roca`/`rocaarena`, and each rock is a Group at the placed scale, so collision and shadows work as before.
- **Animals keep an arm's length apart (AS-0153).** Never bunched: at least ~1.5 units of gap between any two animals'
  bodies at all times (hard rule, not a soft preference), so tapping one never hits another. Implemented for wandering
  ground animals by `SA.spacing` (GAP, `bodyRadius` from the size trait) and checked on every step in `SA.wander`
  (`others` = `[[x, z, r], ...]`, `bodyRadius`); overlapping spawns are pushed apart in ~1 s. Placement (AS-0162): `SA.animalPlan.placements` spawns every animal
  (herds included) over its whole biome strip with the gap AND non-overlapping pick volumes (`pickRadius`); tree
  perchers (`SA.perch.create` `others`/`bodyRadius`, `claims()`) only sit on or hop to spots that are free by the same gap.
  Herds are spawned (AS-0255, slice 2 of AS-0130): `buildAnimals` builds one group per `herdPlacements` row through the same
  builder (shared geometry/materials); the group `name` is the `instanceId` ('conejo#2') and group + part + pick meshes carry
  `userData { animalId, instanceId }`. `SA.render.instances` (`of`, `byId`, `get`, `tapped`, `setNear`) finds a group: an
  instanceId is exact, a species id means the instance tapped last (8 s), else the one nearest the player, else the first. Never
  call `getObjectByName(animalId)` on the animals group. Hits carry `instanceId`, so reactions play on the tapped instance, while
  picks/`part.tap` still report `animalId`. `SA.render.createAmbient` keys its wander rigs by instanceId (each from its own home
  and radius); its controls (hold/pin/setCue...) accept either key. AS-0256 (slice 3): photos, album, clue answers and missions
  count by `animalId` (any instance is the species); hints use `instances.nearest(animals, answerIds)` (nearest instance of any
  fitting species); the easter-egg reveal shows every instance. Herd placement (AS-0254): the animal data field `herd` (1-5, default 1; regular
  species declare 3-5) and `SA.animalPlan.herdPlacements(animals, opts)` give `{ instanceId: '<id>#<n>', animalId, x, z, y, rotY,
  radius }` per instance, each with its own home in a different sub-area (`subAreas`, 2 x 3) of the biome strip, same clearances.
- **Small inventory (AS-0154, AS-0155).** Tools (cámara, cepillo, esponja, venda), la fresa as the only food, and rocks.
  No flor or hoja collectibles. Add items only when a mission needs them; fewer is better.
- **Lots of animals.** Several of each species (3-5) spread around each biome, and >= 5 species per biome. Any instance
  counts for its species.
- **Animals look like the real animal (AS-0127).** Low-poly but recognisable: real proportions and silhouette (neck, legs,
  head shape), parts attached with no floating gaps, no pale blobs. A kid should name it without the label.
- **Parts light up only while helping (AS-0128).** Outside a care/help task an animal is one whole target: no part glow,
  chip or speech. During a task on it, its parts glow, show their chip and say their names.
- **Every animal that fits counts (AS-0122).** A clue accepts ANY animal matching it (a duck and a turtle both swim; every
  grey animal is grey). Never a single hidden right answer. Built: `SA.clues.matches(clue, animal)` tests the clue's
  `match` facts (trait / length / count / biome / part); `round.answerIds` lists every animal in play that fits and
  `round.pick` is correct for any of them (the result names the picked one; `answerId` is just the one the hint shows).
  An animal may list `traits.alsoMoves` (turtle: `['nada']`) so it also fits other movement clues.
  **Census list (AS-0340, slice 1 of Mission 7 AS-0186):** `SA.census` (`game/census.js`, pure) builds the scientist's checklist
  ("tres animales grises, dos que nadan y uno que salta"): 2-3 entries `{ trait, value, n, es, icon }` over colour / movement / size
  / diet, only where at least n distinct non-story, non-egg species fit, from a seed or rng (`opts.avoid` rerolls a replay).
  `matches(animal, entry)`, `tick(state, animal)` (an animal ticks every unfinished entry it fits, once each) and `isDone(state)`.
  **Mission 7 census step (AS-0341, slice 2):** `censo` (n 7, unlocked by `aguila`) has one step `{ kind: 'census' }` (event `censused`).
  `SA.missionCensus` (`game/mission-census.js`) generates a list when the step starts (`sync()`, via the runtime's per-frame `update`;
  a replay's list differs from the last one), `photo(animalId)` (main.js wires la cámara picks) records the album photo and ticks:
  chime + the trait word spoken (`color:gris`, `movement:nada`), a gentle boing (no fit) or pop (already counted); the full list
  reports `censused`, which completes the mission, and logs `{ kind: 'census' }` for the sticker `censo-completo`. `view()` feeds the
  pill.
  **Census checklist in the pill (AS-0342, slice 3):** while the step runs, `SA.missionPill` (`game/mission-pill.js`) polls
  `SA.missionCensus.view()` and the pill shows one chip per entry in place of the step text: `🩶 0/3`, and `🩶 3/3 ✓` (green) when complete
  (`SA.missionPill.checklistRows` is the pure formatter; `view.showChecklist(rows, bounced)` in `game/ui/prompt.js` draws it, bouncing
  the chips whose count just went up). Icons and numbers only, no extra words.
- **The story starts at the research station (AS-0141 to AS-0144).** You spawn by a small station; a scientist coworker
  (always there, on the station porch) opens a new game with a quick ~15-20 s talk: animals in the sanctuary need
  help, find them, help them, photo proof (spoken, picture cards), hands you la cámara and gives missions; proof photos go on the station's
  photo board. Inside the station you can change your character any time (body style, hair, skin tone, clothes), saved.
- **One focus rule: story missions pause the small tasks (AS-0222, slice 1 of AS-0221).** `SA.focus` (`game/focus.js`, pure):
  `active()` is `'mission'` while `SA.missions.active()` is set (a story mission from the station board) and `'free'` otherwise;
  `allowsSmall()` is the check every starter of a small task makes first (clue rounds in `prompt.js` / `mission-flow.js` `begin()`,
  random `careFlow.offer` when not forced; the AS-0179 encounter starter must ask it too). A forced offer (a mission's own help
  step) still works. `main.js` calls `SA.focus.update()` each frame; on 'mission' it calls `ctl.pause()` (clears the card, drops the
  round and any care task quietly via `mission/round.cancel()` and `careFlow.cancel()`: no miss, star or round event, glow removed);
  on 'free' it calls `ctl.begin()` so small tasks resume. **On a mission, only the mission shows (AS-0223, slice 2):** small tasks pause
  AND the top-left pill shows only the current step's line + icon. Every step in `game/data/missions.js` carries a required
  `line: { es, icon, en? }` (es <= 4 words, correct gender/number; validated; e.g. 'Busca al cerdito' 🐷, 'Llévalo con mamá' 🐖,
  'Toma una foto' 📷). `SA.missionPill` (`game/mission-pill.js`, pure) is polled by `main.js` after `SA.focus.update()`: it calls
  `view.showStep` and speaks the line via `SA.audio.say` on every step change; Replay 🔊 repeats it. When the mission ends the focus
  rule calls `ctl.begin()` and the pill shows its free-roam text again. A new mission's steps must each have a `line`.
  **Step engine (AS-0229, slice 1 of AS-0178):** `SA.missionRun` (`game/mission-run.js`, pure) runs steps `{ kind, ...params, line }` against
  rows in `game/data/step-kinds.js` (`SA.data` kind `stepKinds`: event type, required/optional params, match rule, optional counted
  progress). `start(steps)` validates (clear errors for an unknown kind or missing params), `step(state, event)` -> `{ state, advanced,
  progressed, done }` is pure and reports `done` once. Events are `{ type, ...fields }`: found, helped, followed, carried, delivered,
  collected, arrived, talked, photo. A new kind is a new row, never engine code.
  **Live events (AS-0230, slice 2 of AS-0178):** `SA.missionRuntime` (`game/mission-runtime.js`, pure, injectable) is the one entry
  point: `report({ type, ... })` runs the event through `SA.missionRun` against the active mission (rebuilt from `SA.missions.active()`, so a
  reload resumes on the saved step), then `SA.missions.advance()` (tracks `mission.step {id, step}`; counted steps track
  `mission.progress`) or, on the last step, `SA.missions.complete()`: done once, the one-time reward is added to `save.stars` only on the
  first play (`reward` is null on a replay), the fanfare + toast cheer plays every time, and a repeated event never completes it twice.
  The pill (`SA.missionPill`) already follows `SA.missions.active()`, so each new step's icon + line is shown and spoken without more
  wiring; `SA.focus` keeps small tasks paused. Sources: `onPick` (a pick = found; a la cámara shot = found, else photo), `SA.npc.onTalk`
  (talked scientist), `render/pickups.js` (collected), `ui/prompt.js` care `onDone` (helped), and `update(player)` each frame
  for `goTo` / reaching a `find` target through `SA.missionRuntime.locate(id) -> { x, z, r? }` (mission content sets it; `followed` is
  reported by the follower owner, AS-0173/0175). New event sources call `SA.missionRuntime.report`; never add engine code per mission.
  **Carry and deliver (AS-0231, slice 3 of AS-0178):** `SA.carry` (`game/carry.js`, pure) is what the kid holds: `pickUp(id, {fragile?})`
  (a known item is added + equipped so the hotbar and hand model show it; an animal id fills a carry slot), `holds(id)`, `drop()`,
  `deliver(player, step, locate)`. `SA.missionRuntime.update` reports `carried` while a `carry` step's item is held (flagging it fragile
  when the step says so) and `delivered` once a `deliver` step's held item is within `locate(to).r` (default 2.5) of its target, dropping it
  there. A fragile thing wobbles after a jump (`SA.carry.update(dt, player)` in main.js reads the SA.jump `takeoff`/`double` event;
  `wobble()` -> `{ active, angle, tilt }` is drawn by `render/hand-item.js`): a gentle shake, never a drop, fail or reset. Mission content
  that needs a thing in hand calls `SA.carry.pickUp`; `locate(id)` resolves the deliver target like a goTo place.
  **Mission 2, El huevo perdido (AS-0313, slice 1 of AS-0181):** a mission row may declare `carry: { item, to, near? }` (`near` = 'pond').
  `SA.missionCarry` (`game/mission-carry.js`, pure) places the thing and its drop-off on dry ground by the pond (nest a few units off the
  bank, egg 5-7 units from it, seeded like `SA.missionSpawn`), walks the kid up to the egg to pick it up automatically on the `carry` step
  (`SA.carry.pickUp`; says "el huevo"), and says "el nido" when the `deliver` step drops it there (vocab keys `thing:huevo`, `thing:nido`).
  `SA.missionRuntime` asks it (`opts.thing`) for `update`, `locate` and `target` (the compass) after the spawned animals. The egg stays
  in the nest after the mission (in memory only: after a reload the egg and nest are gone until the mission is replayed). The hand is not
  saved, so a reload on the `deliver` step puts the egg straight back in hand (never stuck, AS-0238). `render/mission-carry.js` draws the egg and nest from primitives; the steps are the generic carry / deliver
  kinds, so new carry missions are data rows.
  **Hatch and family photo (AS-0315, slice 3):** `carry.hatch: { baby, mama, seconds? }` adds the generic step kind `hatch` (event `hatched`) and a
  `photo` step with `target: <baby>`. `SA.missionHatch` (`game/mission-hatch.js`, pure) runs the timer once the egg rests in the nest (phases none →
  waiting → cracking (last 1.6 s) → hatched → done), reports `hatched`, speaks `animal:<baby>` then the baby's `phrase:pio`, and `snap()` takes the
  family photo (tap on mamá or the baby with la cámara in hand, within 9 of the nest; a missing camera is put in hand with "la cámara"). Finishing
  logs one rescue row `{ kind: 'hatch', key: <mission id> }` (the badge/sticker `patito-nuevo`, once, never again on a replay) and the mission
  is replayable from the board. `SA.missionHatch.trail()` (pure) is the line of tracks and feathers from the nest to the egg
  (`render/mission-hatch.js` draws it, mamá pato, the cracking egg, the two shells and the duckling; `el patito` is a `story` baby of `pato`).
  Reload on the photo step brings the family back with no show. Story animals are excluded from clue/round pools (`!a.story`).
  **Fragile carry (AS-0314, slice 2):** a `carry` step with `fragile: true` (data, never an id check) makes running or jumping wobble the
  held thing (`SA.carry`) and `SA.missionFragile` (`game/mission-fragile.js`, pure) fires "¡Despacio!" (toast, voice `phrase:despacio`, a
  worried `quack` SFX), at most once per 4 s. It is only a reaction: nothing breaks, drops or resets.
  **Mission 3, El rescate en el río (AS-0319, slice 2 of AS-0182):** the row `rio` (n 3) declares `river: { animal, rock, log }`. `SA.missionLog`
  (`game/mission-log.js`, pure) places a flat-topped rock in the river (on `SA.map.riverX(z)`, away from the ford, bridges, station) with the
  puppy (`perrito`) on it, and the fallen log (`tronco`, 5.4 long, across the river) on the dry west bank. The log slides east along a straight
  path (`PUSH_SPEED` 2.2) while the kid touches its west end facing east, is a solid circle chain (`solids()`, added to the scene obstacles)
  while sliding, then at the bridged spot (overlapping the rock) it locks: `SA.surfaces.addFixed` registers walkable decks for the log and the
  rock (`removeFixed` drops them on a replay), `thing:tronco` is said and `{type:'pushed'}` advances the new generic `push` step kind. The
  `goTo` step with `place: <rock id>` only counts once the log is locked (`locate()` is null before: wading to the rock never completes it);
  reaching the rock says `animal:perrito` then `phrase:guau`. `SA.missionRuntime` asks
  both `SA.missionCarry` and `SA.missionLog` for `locate` / `target` (the compass). A reload past the push step locks the log at once. The
  bridge stays after the mission, in memory only. `render/mission-log.js` draws the rock, log and the shivering, crying puppy (tear, whimper
  by distance), which hops when the bridge locks.
  **Carry back and dry (AS-0320, slice 3 of AS-0182):** the row's `river` also names `bank` (`orilla`), `rubs` (3) and `action` (`lavar`,
  the sponge). Steps continue with the generic `carry` (reaching the rock picks the puppy up via `SA.carry`; says `adj:mojado`), `deliver`
  (`to: orilla`: set down on a towel on the dry west bank, `thing:orilla`) and the new `dry` step kind (event `dried`): tapping the puppy with
  la esponja in hand (it is equipped on the first tap, like la cámara) `SA.missionLog.rub()`s it; the last rub says `adj:seco` and moves on to
  the photo (AS-0321, below). State is `cur.pupState` `{ phase: rock|held|bank, wet, rubs, need }`. The render tints the puppy dark and drips drops while wet
  (own cloned materials), carries it in front of the chest, and fades the wet look with each rub. A reload on `deliver` re-holds it, on
  `dry` puts it on the towel. Nothing is keyed to `perrito`: the row's ids drive it.
  **Finale: wag and photo (AS-0321, slice 4 of AS-0182):** once dry the puppy plays its `animal.wag` (`SA.wag`, drawn by `render/mission-log.js`
  while it stands dry on the bank; wet = tail at rest). The row ends with `{ kind: 'photo', target: 'perrito', line 'Foto del perrito' 📷 }`.
  `SA.missionLog.snap(player?)` (a tap on the puppy with la cámara in hand, equipped on the first tap; within 9 of the bank) reports `photo`,
  so the runtime completes the mission (stars, replayable on the board, mission 4 unlocks), keeps the picture in the album (`SA.photo.record`)
  and logs one rescue row `{ kind: 'river', key: <mission id> }`: the sticker `perrito-feliz` (once, never again on a replay). `onSticker`
  (main.js) shows the sticker line. A reload on the photo step puts the dry puppy on the towel. Same pattern as mission 2's family photo.
  **Mission 4, La fiesta del mono (AS-0326, slice 1 of AS-0183):** the row `fiesta` (n 4, intro '¡Feliz cumpleaños, mono!') declares
  `bananas: { item: 'platano', n: 3, biome: 'selva' }` and steps `collect` (3 bananas, 'Recoge 3 plátanos') then `talk` the scientist
  ('Pide la corona', `gives: 'corona'`). `SA.missionBananas` (`mission-bananas.js`, pure) places the `n` pickups on dry selva ground from the
  mission seed ONLY while that mission runs (gone when it ends or is abandoned), takes one when the kid walks within 1.6, reports `collected`
  and says `number:N` (uno / dos / tres); `render/mission-bananas.js` draws bobbing bunches. The generic counted `collect` kind already
  lived in `data/step-kinds.js`. A step with `gives` (a vocab `thing:` id) is spoken and passed to `SA.missionRuntime.onGive(id)` when met
  (main.js toasts the crown); the runtime's `target()` points the compass at the scientist's post for a `talk` step.
  **Invite two friends (AS-0327, slice 2):** after the crown come `invite` steps (`{ kind: 'invite', animal }`, event `invited`) for 'conejo'
  and 'ciervo', then `goTo` 'arbol-mono' ('Al árbol del mono', 4 words: the step validator caps lines at 4). The row's
  `friends: { animals, tree, monkey?, biome?, friendBiome?, say? }` is placed by `SA.missionFriends` (`mission-friends.js`, pure; friends in the
  bosque, the monkey's tree in the selva, only while the mission runs). Walking within 2.8 of the named friend invites it (no button), speaks
  one `say` word ('thing:fiesta', then 'thing:regalo') and from then on it follows: `SA.follow.stepGroup` makes EVERY follower trail the player
  on its own breadcrumbs (they keep apart; each waits at the water and follows again when you come back). "Invited" is derived from the saved
  step index, so a reload keeps them at your side. `locate('arbol-mono')` answers only while every friend is invited and within 6.5 of the tree,
  so arriving alone does nothing. The compass shows the next friend, then the tree (`SA.missionFriends` joins the runtime's `thing()` list).
  `render/mission-friends.js` draws the tree, the monkey and the friends.
  **The party and its photo (AS-0328, slice 3):** the row now ends `goTo` → `{ kind: 'party', place: 'arbol-mono' }` ('¡A bailar!', new step
  kind, event `partied`) → `{ kind: 'photo', target: 'mono' }` ('Foto de la fiesta'), plus `party: { say: 'phrase:felizcumple', seconds? }`.
  `SA.missionParty` (`mission-party.js`, pure; `tick(dt)` is called by the renderer) starts the party when the party step begins: the tune
  `SA.partyMelody` (`party-melody.js`: an original 3/4 arrangement of the traditional Cumpleaños feliz, ~10 s, as note data) goes through the new
  `SA.audio.melody(notes)` (silent when locked or muted), `¡Feliz cumpleaños!` is spoken, and when the tune has played out it reports `partied` and
  the photo step begins (never timed against the player; the party goes on quietly until the picture). `SA.missionFriends.step` makes the invited
  friends stop following, gather in a ring round the tree facing it and report `dancing` (the renderer bobs and swings them and the monkey).
  `render/mission-party.js` draws balloons (primitives) and falling confetti only while `SA.missionParty.view()` exists, and a tap on the monkey or a
  friend with la cámara (equipped on the first tap, within 14 of the tree) calls `SA.missionParty.snap()`: the photo completes the mission (stars,
  replayable on the board), goes into the album (`SA.photo.record`) and logs one rescue row `{ kind: 'party', key: <mission id> }` → the sticker
  `fiesta-feliz` (once; `onSticker` in main.js shows it). A reload on the photo step resumes the party quietly. The tree, monkey and friends
  disappear when the mission ends (as for every mission piece).
  **Mission 5, Doctor del santuario (AS-0331, slice 1 of AS-0184):** row `doctor` (n 5, unlocks after Mission 4; intro '¡El camello está
  enfermo!'). Steps: `touch` {animal 'camello', part 'frente'} → `carry` 'cubo' → `fill` 'cubo' → `deliver` 'cubo' to 'camello'. New step
  kinds `touch` (event `touched`) and `fill` (event `filled`) are plain `step-kinds.js` rows. `doctor: { animal, part, item, say? }`
  (validated in `data/missions.js`) is placed by `SA.missionDoctor` (`mission-doctor.js`, pure; joins the runtime's world-thing list): a
  dedicated sick camel stands 11-17 from the oasis (not a herd camel) and the bucket on the pool rim, only while the mission runs. A tap on
  the camel's invisible, enlarged forehead sphere (`userData { animalId, part: 'frente' }`, `render/mission-doctor.js`, its own raycast like
  the baby's tap) calls `SA.missionDoctor.touch`, which needs the kid within 4.2 (else "¡Acércate!") and speaks `say.touch`
  ('tiene fiebre'). Walking up picks the bucket up (SA.carry slot), walking to the pool holding it fills it (`say.fill` 'el agua'), and
  `SA.carry.deliver` drops it at the camel. A reload on fill / deliver puts the bucket back in hand. The renderer shows the droopy
  nose-down pose, a bobbing thermometer and blue water in the held bucket.
  **Slice 2 (AS-0332):** after the water, strictly in order (`SA.missionRun` is sequential; `SA.missionDoctor` also only picks an item up
  on its own carry step): `carry` 'medicina' (on the station bench, spoken 'la medicina') → `deliver` to the camel → `carry` 'sombrilla'
  (also on the bench) → `deliver` it. `doctor.medicine` / `doctor.shade` name the two items, `say.med` / `say.shade` / `say.rest` their
  vocab. Delivering the umbrella stands it beside the camel (the sandbox prop row `sombrilla`, builder `umbrella`, shown by the doctor
  renderer), the camel lies down, 'la sombra' then '¡Mañana estaré mejor!' are spoken in sequence (`SA.wordSeq`), and the resting scene
  lingers ~9 s after the mission ends.
  **Slice 3 (AS-0333): the camel rests, then gets well.** The game has no day/night, so "tomorrow" = the next session (page load) or the
  next finished mission, whichever is first. After the umbrella comes a `recover` step (step-kinds row; ' Mañana estará mejor 🌙') then a
  `photo` step (target the camel). `SA.missions` stamps the active mission on reaching a `recover` step with `wait: { session, mark }`
  (`session` = a per-page-load id, `mark` = `missions.completions` at that moment; both in `santuario_save_v1` under `missions`, normalized
  by `save.js`, no version bump: absent = none) and `SA.missions.settle()` (polled by `SA.missionDoctor.update`) advances it once the session
  differs or `completions` passed `mark` (a missing stamp counts as due: never stuck). While it waits the board is not blocked: `start(other)`
  parks the waiting mission in `missions.waiting`; finishing the other mission (`complete()` → `settle()`) brings it back on the photo step,
  and starting it from the board picks it up where it waits. The camel droops with its thermometer (and lies under the umbrella) until
  then; healthy it stands, hops, loses the thermometer and the umbrella (`say.healthy` '¡Estoy sano!'). `SA.missionDoctor.snap(player?)` (a tap
  on it with la cámara, render/mission-doctor.js) records the photo, completes the mission (stars) and logs a `{ kind: 'doctor' }` rescue row
  → sticker `camello-sano`; `onSticker` is hooked in main.js. Later missions needing "wait until tomorrow" reuse the `recover` step kind.
- **Mission 6, El nido del águila (AS-0336, slice 1 of AS-0185):** row `aguila` (n 6, unlocks after Mission 5; intro '¡Busca la pluma!' + one
  '¡Vamos!'). Steps are generic kinds: `collect` { item: 'pluma', n: 1 }, `goTo` 'cima' (the flat top of peak `nest.summit`), `goTo`
  'nido-aguila' (the nest peak `nest.peak`). `nest: { item, summit, peak, summitPlace, nestPlace, chick, mama, say? }` (validated in
  `data/missions.js`) is owned by `SA.missionNest` (`mission-nest.js`, pure; joins the runtime's world-thing list; `render/mission-nest.js`
  draws it): la pluma (item row `pluma`, a hand model too) lies a step off the trail's lower leg, walking up to it puts it in the inventory
  (`SA.inventory`) and reports `collected`; the nest peak's `locate` answers only once you were out over the rope bridge (near its middle
  and well above the ground under it), so climbing straight up the far peak does not skip the bridge. The compass points at the feather,
  the summit, the bridge (until crossed) and then the nest. `say` keys speak at each moment (la pluma; arriba + la montaña; el puente; el nido).
  The nest (twig ring) with a small chick and mamá (built from the animal ids in the data through `SA.render.animalBuilder`) exists only
  while the mission runs. **Give + first flight (AS-0337, slice 2):** new generic step kind `give` { item, to } (event `gave`, in
  `data/step-kinds.js`). Tapping the chick (an invisible enlarged pick volume, own raycast like the sick camel's forehead) calls
  `SA.missionNest.give(player)`: on the give step, within ~4.5 of the chick and with la pluma in the bag it removes it, says `say.give`, reports
  `gave` (the step moves on to a plain `photo` step) and starts the flight. `SA.flight` (`flight.js`, pure) is the path / timing math:
  `sample(spec, t)` -> flap on the spot (1.4 s), one ~1.7-radius loop round mamá (3.8 s), land (0.9 s); it starts and ends exactly at the
  nest. The renderer only places the chick at `sample` and beats its alas (`SA.gait.flap`); `say.fly` ('volar') is spoken as the loop begins.
  Early / far / empty-handed taps never fail: the chick wobbles (`view().nudge`) and '¡Acércate!' or la pluma is spoken. The summit photo
  tap on the nest and the sticker are the next slice.
  **Summit photo + sticker (AS-0338, slice 3):** the photo step is `{ kind: 'photo', target: 'nido-aguila' }` (a place id, so a photo of some wild
  eagle through the generic pick path never completes it). On that step a tap on the chick or mamá (render/mission-nest.js, only those two) calls
  `SA.missionNest.snap(player)`: la cámara in hand (a first tap equips it), the kid standing on the summit peak or the nest peak (not on the ground
  below). It records the album photo (`SA.photo.record('aguila')`), completes the mission (stars, replayable on the board, Mission 7 would unlock)
  and logs one `{ kind: 'nest', key: <mission id> }` rescue row -> sticker `aguilucho-volador` (`onSticker` in main.js). A replay gets a fresh
  seed, so the feather lies on the trail again, the bridge is uncrossed and the chick is unfed; a stale feather in the bag is put away at the start.
- **Free roam (AS-0246, slice 3 of AS-0179): no clue round starts by itself.** `SA.taskGate` never calls `missionFlow.begin(animalId)` any more;
  with no story mission the world is free roam plus encounters. A story mission starts only from the station board / the scientist
  (`SA.missions.start` in `missions-board-view.js`; a test scans `game/` so nothing else calls it). `SA.mission.start({ animalId })` /
  `pickClueFor` remain for data-driven mission clue steps and the ungated fallback controller.
- **Proximity only (AS-0225, slice 2 of AS-0217): encounters never start or show unless their animal is near.**
  `SA.taskGate` (`game/task-gate.js`, pure wiring) is polled each frame by `main.js` (`ctl.updateTasks()`, after `SA.focus.update()`).
  It asks `SA.nearbyTask` about the encounter tasks only; the pill is shown only while `nearbyTask` returns one (`view.setPill(on)`):
  walking away hides it quietly (no miss, no failure) and coming back shows it and says the call again.
  Telemetry, once per transition (never per frame): `task.shown` / `task.hidden` `{ kind, animalId, dist }`. A story mission still
  shows only its step (`stepOn` in the pill view); the gate shows nothing then. New small tasks (encounters, AS-0179) must be a
  `{ kind, id, animalId }` entry in the gate's `tasksFor` (kind-generic) and never start without proximity. Gating is on only when
  `SA.prompt.start` gets `nearby` (as `main.js` does); the plain round controller is the ungated fallback.
- **Small tasks show only near their animal (AS-0217; slice 1 = AS-0224, the pure rule).** `SA.nearbyTask`
  (`game/nearby-task.js`, after `focus.js`): `create().update({ player, animals, tasks })` returns the one task to show
  `{ kind, taskId, animalId, dist }` or null. A clue (`fits(animal)`) starts when a fitting animal is within `NEAR` (8 m) and roughly
  in view (75° half-angle; < 2.5 m always counts); an encounter (`animalId`) shows while its animal is within `NEAR`. Once shown it
  stays until `NEAR + HIDE_SLACK` (2 m): hiding never fails the task and it can return. Nothing shows while `SA.focus` says a story
  mission runs. `pickClueFor(animal, state, rng)` picks a clue that animal fits; `answerIds` lists every fitting animal (AS-0122).
- **Task ring (AS-0226, slice 3 of AS-0217): the current small-task animal glows in a rising ring cylinder.**
  `SA.render.createTaskRing` (`game/render/task-ring.js`, THREE) is updated by `stage.render` with `stage.getTask()` =
  `ctl.taskShown()` -> `{ animalId, kind, done } | null` (set in `main.js`; from `SA.taskGate.shown()`). Task shown: a transparent
  cylinder sized from the animal's parts follows its group, with 3 soft rings rising and thinning near the top (1.5 s loop), colour
  by task kind (clue gold, encounter sky blue; a new small task kind just passes its `kind`). Task hidden: vanishes quietly. Task `done`:
  vanishes with a small sparkle. One shared unlit material, meshes made once, nothing allocated per frame, no lights, not in the
  animals group or `pickVolumes` (raycast is a no-op), so it never blocks picking.
- **Photobook pictures (AS-0236, slice 1 of AS-0218).** Every photo (`SA.photo.record`) also captures a ~240 px JPEG of the animal
  (`render/photo-capture.js`: renders a frame, crops round the animal) and keeps it in IndexedDB (`SA.photoStore`, db `santuario_photos`).
  The save holds ids/dates only: `save.album[animalId] = { date, pics: [{ id, date }] }` (save v5; v4 date-only albums migrate without
  loss). `SA.albumPics.keep` keeps the first picture ever plus the newest 3 per species and reports the rest for deletion. No IndexedDB or
  a failing capture never affects the photo: it still counts for the album and badges.
  **Photobook view (AS-0237, slice 2):** a photographed album card shows its saved pictures (first + newest 3, read with
  `SA.albumPics.load`, which skips missing ones) instead of the big icon; tap one for a larger overlay with a big ✕ and a 🔊, and a
  🔊 next to the name says it via `SA.audio` (`animal:<id>`). No pictures or no storage = the plain icon card, and "found / total" is unchanged.
- **Rescue missions are the core loop (AS-0123, AS-0124, AS-0125).** Find an animal that fits the clue -> it needs help
  (hurt, stuck, hungry, tangled, scared: 1 task at beginner, 2 later) -> take its photo as proof it is OK ("¡Está bien!",
  saved to the album) -> next mission. Finding alone never ends a round. This supersedes "the photo answers the round" below.
  **Wired (AS-0199, slice 1 of AS-0124):** `game/main.js` runs `SA.mission` through `SA.prompt.start({ mission })`, which builds
  `SA.missionFlow` (`ui/mission-flow.js`; same controller API as the plain round controller, so the prompt photoMode is gone).
  Find = Use/touch with any item on an animal that fits (celebration, name spoken); then `care.offer(id, true, kind)` starts the help
  task at once (no random chance), `careFlow`'s `onDone(task)` calls `mission.taskDone`, and the photo step ("Tómale una foto",
  📷 badge) accepts only a la cámara shot (`SA.photo.take` -> `mission.photo`). Biome reroll works only in the find step.
  **Step card + pin (AS-0200, slice 2):** `SA.missionCard` (`game/mission-card.js`, pure) is the one step -> card mapping
  (`find(m)` clue + animal icon, `help(task)` care text + tool/food icon, `photo(m)` "Tómale una foto" + 📷; card =
  `{ step, text, key, icon, silhouette, camera }`); mission-flow and care-flow render from it and Replay says the current step's key.
  The found animal does not wander during its mission: `ambient.pin(id)` / `unpin(id)` (render/ambient.js; `release` is ignored
  while pinned, so care tasks ending cannot free it). mission-flow takes `pin: { pin, unpin }` (main passes `stage.ambient`),
  pins at the find and unpins at the correct photo or when the mission is replaced (begin/reroll).
  **Proof card (AS-0201, slice 3):** the correct final photo is the proof: the snapshot card (`view.snapshot({ icon, text, stamp, hold })`,
  the `snapshot` HUD zone) slides in with a red "¡Está bien!" stamp (`phrase:estabien`, spoken) and is held; after `NEXT_MS` the flow
  calls `view.snapshotHide()` and then starts the next mission. The photo is saved by `SA.photo.take` (`save.photos`, dated album page).
  **Proof sent to the station (AS-0206, slice 1 of AS-0143):** the final photo of a rescue (`SA.missionFlow`, kind `'rescue'`) and the photo
  step that finishes a story mission (`SA.missionRuntime`, kind `'mission'`) are recorded by the pure `SA.proofs` (`game/proofs.js`) in
  `save.proofs` (v6; absent = empty): `[{ id, kind, animalId?, missionId?, date, celebrated }]`. Returning is never required: the next mission
  starts right after the photo as before. `ui/scientist-cheer.js` (polled in main.js's loop) gives each proof exactly ONE cheer when the kid
  comes within `SA.npc.NEAR` of the scientist (waits while a card is open): a bubble "🙌 ¡Gracias! Está bien." (`phrase:graciasbien`, spoken),
  and for a mission proof a second line pointing at the mission it opened ("👉 icon ¡Nueva misión!"); `SA.proofs.cheer()` marks the proof
  celebrated first, so it never repeats. Telemetry `station.proof_sent` / `station.proof_cheer`.
  **Envelope flight (AS-0208, slice 3 of AS-0143):** every newly recorded proof (`SA.proofs.onSent(fn)`) starts `ui/envelope-fly.js`: a ✉️
  flies ~0.9 s from the screen centre to a 🏠 chip at the station's spot on screen (`SA.hintPointer.locate` of the station, pushed to the
  edge like the hint arrow when off-screen; re-projected each frame), with the soft `SA.audio.sfx('whoosh')` (silent when muted). Click-through,
  never pauses input, never delays the next mission. There is no minimap, so the "station icon" is this 🏠 chip.
  **Photo board (AS-0207, slice 2 of AS-0143):** the station's WEST wall (inside, `SA.station.layout().photoBoard`, facing +x, solid) carries a
  "Fotos" board with one framed card per proof in `SA.proofs` (little low-poly animal in its body colour + its Spanish name, or a gold star +
  "Misión N"). `game/photo-board.js` (`SA.photoBoard`, pure: 4x2 slots, pages of 8, `card()`, `signature()`) decides what and where;
  `game/render/photo-board.js` rebuilds the cards when the signature changes (polled by the scene), so it loads from the save and updates live.
  It shows the newest page of 8; there is no paging control yet. `render/block-text.js` now spells A-Z, 0-9 and accents (Á É Í Ó Ú Ñ).
- **Tasks while roaming.** Missions ("Busca un animal con orejas largas") sit on a card while you explore freely. You
  complete a find by taking a photo with *la cámara*, and the photo album rewards exploring.
  Built (AS-0084): the round IS the photo mission. The top card keeps the clue, Replay and a 📷 badge (tap = equip la cámara);
  only a pick made with `item: 'camara'` answers it (`SA.prompt` `photoMode`, set by main.js; other tools or empty hands on an
  animal leave the mission alone so you can roam and care meanwhile). `SA.photo` (game/photo.js, pure): `isShot`, `judge`
  (match|other|none), `record` (save `photos: { animalId: count }` for EVERY photo, right or not, for the album AS-0085) and
  `take(game, pick)`. A shot plays SFX `shutter`, a white flash and a framed snapshot (icon + Spanish name) that slides in; a
  match is the normal celebration + star; a different animal gets "¡Qué foto! Pero busca…" (`phrase:quefoto`) and the clue
  is replayed, the round continues (counts a miss for adaptive difficulty, never a penalty).
- **Photo album (AS-0085).** The 📖 button (in the 🎒 menu) opens a page of cards, one per species: photographed = icon, Spanish
  name and its body parts as icon chips (tap the card or a chip to hear it); not yet photographed = a dark "?" silhouette that stays
  silent. Easter-egg creatures only appear once photographed. `SA.album` (game/album.js, pure) reads/writes save `album: { animalId:
  'YYYY-MM-DD' }` (first-photo date, no images; `SA.photo.record` calls `SA.album.add`) and builds the cards from animal/part data
  (parts carry an optional `icon`); `game/ui/album-view.js` is the DOM page and pauses picking while open.
- **Inventory and tools.** You start with *cámara, cepillo, esponja, venda* and find more (*fresas, rocas*;
  no flor/hoja items: flowers are walk-through decor only; `SA.save` drops retired `flor`/`hoja`/`platano`/`zanahoria`/`pez` from old saves).
  Food (AS-0155): `fresa` is the only active food in `foods.js` (kind kept for later); strawberries grow on trees and ground bushes
  in every biome; feed tasks ask only for fresas (counts stay) and the tray is just fresas; carnívoro/insectívoro animals get no feed task. Equip an item from the hotbar (tap or 1-9) and use it with **Space, a mouse click or a tap** on
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
  count, respawn seconds; vocab `found:<item>` = "¡Una fresa!"). `SA.pickups` (game/pickups.js, pure, seeded) lays them out
  (fruit on canopy branches via `SA.perch.spots`, so you climb for it) and handles collect + respawn; `game/render/pickups.js`
  draws them (item model, bob, sparkle). Walking into one or pressing Space next to one adds it to `SA.inventory`, with pop
  SFX and the spoken name. Keep new finds as data rules, not special cases.
- **Parts only matter while helping (AS-0128).** Body parts (patas, nariz, cola…) glow, show their chip and speak their name ONLY while a
  care/help task (clean, heal, feed, a rescue mission's help step) is active on THAT animal. Otherwise every animal is ONE target: the Space
  outline wraps the whole animal, Use/tap emits `{ animalId, item? }` with no `part`, nothing glows. Pure rule `SA.aim.partsActive(animalId,
  careTask)`; `SA.careFlow` calls `SA.picking.setActiveTask(task)` on offer and `(null)` on finish; `render/picking.js` gives whole-animal
  hits `{ part: null, mesh: body, node: group }`. Code reading a pick must treat a missing `part` as "the animal" (default `'cuerpo'`).
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
  Built (AS-0083): tangled wing. Action `desenredar` (empty hands on *las alas*, `tangled: true`, no `gives` (the leaf just falls, AS-0154), `say:
  'phrase:yapuedevolar'`) + care task "Quita la hoja de las alas" (3 tugs, only animals with alas). While it runs
  `ambient.setTangled` makes the bird hop on the ground with drooping wings (no flying) and `care-fx` puts green leaf bits on
  one wing; the last tug calls `fx.fly` (`ambient.flyLoop`: a spinning circle in the air), adds the leaf to `SA.inventory`
  and speaks "¡Ya puede volar!". Optional action fields `cue`/`gives`/`say` are the pattern for other "stuck" care needs.
  Built (AS-0241): the visible cue is data. Action field `cue` (one of `SA.actions.CUES`: `'tangled'`, `'limp'`; `tangled: true` stays an
  alias of `cue: 'tangled'`) rides on the care task and the done result (`cue`, `tangled`); `ambient.setCue` and `care-fx` pick the
  animation by the cue value, never by animal id. Action `quitarespina` (empty hands on *las patas*, cue `limp`, gives `espina`, says
  "¡Ya camina bien!") + care task kind `espina` "Quita la espina de las patas" (2 tugs, only animals with patas): the animal steps in
  place with an uneven limp (`SA.gait.limp`, the first paw hardly swings) and a thorn bit shows on one paw; done: `fx.free(id, cue)`.
  A new need is a data row plus a cue (add a cue = add it to `CUES` and give ambient/care-fx a look for it).
  Built (AS-0242): cue `sunk`. Action `sacardelbarro` (empty hands on *las patas*, says "¡Ya salió del barro!"; vocab `phrase:barro` =
  "el barro") + care task kind `barro` "Saca las patas del barro" (3 tugs, only animals with patas). `ambient` lowers the animal by
  `rig.sunkBy` (0.1 + up to 0.08 more, slowly, capped) and eases it back up when the cue clears; `care-fx` draws a flat brown puddle
  (group `userData.sunkPuddle`) that stays on the ground while the animal sinks, with 3 mud lumps (one splashes off per tug) and
  shrinks away on `free`.
  Built (AS-0243): cue `tremble`. The existing `acariciar` action/care task (empty hands on *la barriga*, 3 rubs, only animals with a
  barriga) now carries `cue: 'tremble'` and `say: 'phrase:yasecalmo'` ("¡Ya se calmó!", gender-neutral). `ambient` shakes the held
  animal with a small fast jitter (position + roll, nothing accumulates) until `fx.free` clears the cue; care-fx adds no bits.
- **Low things are jumpable.** Anything short (rocks, logs, low props) can be jumped over and briefly stood on; only
  tall things (trees, cacti, peaks, big animals) always block. Obstacles carry a height (AS-0176).
- **Progress you can see and keep.** Badges and stickers for rescues by species, predicament, biome and night (AS-0167,
  AS-0168); rescued animals get names in the "Luna la rápida" pattern, with articles and endings that agree (AS-0169); one
  rescued animal can be your named friend that follows you and helps with hints (AS-0175).
- **The world has a rhythm.** Day/night cycle (AS-0170): day animals sleep at night with floating Zzz, nocturnal animals
  (búho, murciélago) wake up (AS-0171). Night stays readable for kids.
- **Mission variety.** Lost-baby missions: the cría follows you to its mamá, and you take a family photo (AS-0172, AS-0173). Secret
  treasure chests behind waterfalls are original easter eggs (AS-0174).

- **Encounters vs missions.** Routine help happens as you roam: about 1 in 4 animals has a small need (floating icon,
  species call, spoken hint), and fixing it takes 1-2 steps and counts for badges (AS-0179). No clue rounds start by
  themselves. **Core (AS-0244, slice 1/3):** `SA.encounters.create({ rng, now })` in `game/encounters.js` is the pure scheduler:
  `sync({ animals, excludeIds })` keeps ~1 in 4 animals needy (cap `MAX` 4, never on the mission's animals, `COOLDOWN_MS` after a fix,
  new need on a different animal), `tasks()` feeds `SA.nearbyTask`, `hint(id)` gives icon + vocab keys, `shouldCall(id, ms)` is true once
  per `CALL_GAP_MS` (20 s) per animal, `resolve(id)` clears it; paused while `SA.focus.allowsSmall()` is false. Needs are data in
  `game/data/needs.js` (care task, icon, gendered hint key, `word` = the `need` the rescue log records: hungry/thorn/mud/tangled/scared).
  **Wired (AS-0245, slice 2/3):** `SA.encounterFlow` (`game/ui/encounter-flow.js`, pure glue built in `SA.prompt.start`) feeds the scheduler's
  tasks to `SA.taskGate` (option `encounters`), so an encounter shows its prompt only within `NEAR` and is highlighted by the one shared
  task ring (sky blue). Coming near calls `start(id)`: the existing care task is offered forced and quiet (`careFlow.offer(id, true, kind, true)`),
  then the species call (the animal's `voice` word, else a procedural chirp/squeak/whimper) and the spoken hint play (at most once per 20 s per
  animal), then the prompt. Finishing logs `save.rescues { kind: 'encounter', animalId, need, biome, night }` (badges count it) and resolves the
  need. Walking away mid-help puts the task away quietly (the need waits); a story mission cancels it and pauses everything. A clue round in its
  help/photo step is never interrupted; one in `find` is put away when you walk up to a needy animal. The floating emoji is
  `SA.render.createNeedIcons` (`game/render/need-icons.js`, canvas-text sprites; `stage.getNeeds`). Missions are deliberate stories that are only started from the scientist's Misiones board in the station
  (AS-0180). They unlock strictly in order, one after the previous is done, and finished missions can be replayed (AS-0177).
  Missions are data rows on a step runner (AS-0178). Order: 1 ¿Dónde está mamá? (piglet), 2 El huevo perdido, 3 Rescate en
  el río, 4 Cumpleaños del mono, 5 Doctor del santuario, 6 El nido del águila, 7 Censo de animales, 8 Los ladrones de fresas,
  9 Construir un hogar, 10 La carrera, 11 Mensaje perdido, 12 Noche de estrellas (AS-0173, AS-0181 to AS-0191).
  Built (AS-0177): rows are data in `game/data/missions.js` (kind `missions`: `{ id, n, es, en, icon, intro, steps, reward }`; n contiguous
  from 1; a new mission = a new row). `SA.missions` (`game/missions.js`, pure) keeps progress in the save as optional
  `missions: { done: [id], active: { id, step, seed, replay } | null }` (no version bump). `list()` gives each row a status
  `done | active | available | locked`; `start(id)` (called only by the station board, gated by `create({ canStart })`) refuses
  `locked`, `unknown` and `busy` (one active at a time); replays get a fresh `seed` (runner picks other spots) and `complete()`
  returns the one-time `reward` only on the first completion. `advance()` steps, `abandon()` drops the active one (back to available/done).
  The board UI (AS-0180) and step runner (AS-0178) build on this; the world never starts a mission.

- **Story animals and baby variants (AS-0232, slice 1 of Mission 1):** `cerda` (la cerda) and `cerdito` (el cerdito) are rows in
  `game/data/animals.js` with `story: true`: not built into the world, not in clue rounds, random mission picks or the album;
  the mission places them (render code builds a story animal on demand from `SA.animalPlan.plan(animal)`). The piglet is a data row
  made with `SA.animals.babyParts(adultParts, { scale: 0.55, headScale, eyeScale })` and marked `baby: { of: 'cerda', ... }`, so a
  bigger head and eyes on a ~55% body need no engine code. `animal.voice` is a vocab key (`phrase:oinc`, baby `phrase:oincbebe`); a
  vocab entry's optional `pitch` (1 = normal) is applied by `SA.audio.say` when it falls back to speechSynthesis. `rosa` is a colour.

- **Mission spawns and step targets (AS-0233, slice 2 of Mission 1):** a mission row may declare `spawn: { baby, mama, minApart? }` (animal ids,
  so a replay can use another species) and each step may carry `at: 'baby' | 'mama'`. `SA.missionSpawn` (`game/mission-spawn.js`, pure)
  places both animals deterministically from the run's seed in the mamá's biome: inside the map, dry flat ground off the river/pond banks,
  outside the station, the spawn circle and every solid (the player's obstacle list), at least `minApart` (14) apart. `sync()` follows
  `SA.missions.active()` (places on a new run, clears when none; a reload re-places identically). `SA.missionRuntime.target()` returns the
  current step's `{ x, z, role, id }` (piglet for find, mamá for follow and the photo): **the compass (AS-0228) reads that**. A `find`
  step is met by walking up to the piglet (`SA.missionSpawn.locate`). `render/mission-spawn.js` draws them through
  `SA.render.animalBuilder(THREE)` (the same builder as the world animals) in their own `missionAnimals` group; while the baby waits
  it shows a blue tear, shivers and whimpers (`SA.audio.sfx('whimper')`, quieter with distance); mamá turns her head, worried.
- **The baby follows (AS-0234, slice 3 of Mission 1):** `SA.missionBaby` (`game/mission-baby.js`, pure) makes *using* the waiting baby
  (tap/click on it, or E / Enter: it is an `npc` use target `{ id: 'baby' }` in scene.js's `npcs()` list) report `found`; walking up to it
  still works through the runtime. While the `follow` step is current it walks behind the player through `SA.follow.stepAll` (its `solids`
  arg may be the walk-list **function**, resolved there). It hops and squeaks once when found, and within `EXCITE_DIST` (12) of mamá it
  bounces and squeaks, more and faster the closer it gets (`excitement(d)`), a warmer/colder hint. Telemetry: `mission.babyFound`,
  `mission.babyExcited`.
- **The reunion (AS-0235, slice 4 of Mission 1):** `SA.missionReunion` (`game/mission-reunion.js`, pure) is who reports `followed`: when the
  following baby is within `REUNION_DIST` (2.6) of mamá, `SA.missionBaby.update` calls `check`, the follow step ends (the baby is released
  and stays beside mamá) and the next step asks for the family photo; the photo completes the mission with its reward once (AS-0230).
  The view says `reunion: true` for one frame, and `SA.render.createMissionSpawn` bursts hearts and nuzzles. The line `💕 ¡La familia está junta!`
  is the toast (`onReunion` hook in main.js); `SA.audio.say` speaks `phrase:mama, cria, bebe, familia, familiajunta` (la mamá, la cría, el bebé,
  la familia, ¡La familia está junta!) about 1.7 s later so the new step line is heard first.
- **Rescue log and badges (AS-0235, AS-0167):** the save has an optional `rescues: [{ kind, mission, animal?, key?, animalId?, need?, biome?,
  night?, date? }]` (capped 200, `SA.rescueLog.record` in `game/rescue-log.js`): one row per finished rescue. A care/encounter rescue
  records `{ animalId, need ('thorn'|'mud'|'hungry'|'tangled'), biome, night }`; a story rescue records a `kind` (the reunion logs `reunion`,
  idempotent per mission + seed). `save.badges` holds earned badge ids. Badges are data rows in `game/data/badges.js`
  (`rule: { count, kind?, animalId?, need?, biome?, night? }` counts rows matching every field; `{ album: 'all' }` reads
  `SA.album.progress()`); species get bronce/plata/oro at 1/5/15. `SA.badges` (`game/badges.js`) gives `check(rescues?)` (ids earned for the
  first time, saved, returned once) and `progress()` (`[{ id, have, need, earned }]` for the station's board). **Wired:** encounters call `SA.rescueLog.record` (AS-0245); plain care
  rescues do not yet, and the photo flow `SA.badges.check()` after `SA.album.add` (sticker/board tickets).
- **Mission compass (AS-0228):** while a story step has a world target (`SA.missionRuntime.target()`, i.e. the step's `at`), one big
  yellow arrow (no text, no numbers) sits near the top centre and points toward it relative to the camera yaw, so it turns every frame.
  `SA.compass` (`game/compass.js`, pure): `angle(player, target, yawDeg)` (0 = right, PI/2 = straight ahead), `evaluate(...)` (hidden when
  there is no target, when reached (< 2.5), or when near (< 8, +2 hysteresis) AND on screen; inside 22 it pulses and shrinks to 70%),
  `place(vp)` (top-centre, slid by `SA.hintPointer.avoid` clear of the prompt pill, star badge, menu column, hotbar, joystick, touch
  buttons and `controlRects`) and `create({ track })` (telemetry `compass.shown { role }` / `compass.hidden { reason }`, at most one per 3 s).
  `game/ui/compass-view.js` is the DOM arrow (`pointer-events: none`). **Any new step kind or mission gets the compass by giving the
  step an `at` (or by extending `SA.missionSpawn.target`); never special-case a mission here.** It is separate from the Scout & Spot hint
  arrow (`SA.hintFlow`), which is idle while a mission runs.

## Unchanged from the spec

Visual-first and low-reading, correct Spanish grammar agreement, never punish, original Easter-egg creatures (no
franchise copies), file:// with vendored three.js, data-driven content, privacy-safe local telemetry.

## Log

- 2026-11-22: mission compass (AS-0228): a HUD arrow points at the current mission step's target (the piglet, then mamá).

- 2026-11-22: pivot to third-person free roam, reach, climbing, inventory, tools, photo missions and album
  (tickets AS-0069 to AS-0085). Mouse/tap on a part works as well as Space.
- 2026-11-22: chase camera only. The care close-up ("on top of the player" view) is removed (AS ticket from Jason's playtest).
- 2026-11-22: no keyboard lock-in. Part-cycling with arrows/Escape is removed (AS-0093); keys always move the player, mouse/tap picks parts.
- 2026-11-22: one visible Space target. Whatever Space would act on gets a distinct outline (AS-0101; folds in AS-0100).
- 2026-11-22: clear spawn, never stuck (AS-0105); walk through flowers and small animals (AS-0106).
- 2026-11-22: Space jumps, E/Enter uses (AS-0111, AS-0112); run about 2.5x (AS-0110); walk on any ground, water never blocks (AS-0109).
- 2026-11-22: camera frames treetop animals automatically (AS-0116), jump in canopies (AS-0115), treetop tells (AS-0117).
- 2026-11-22: movement sounds: footsteps, landing, water and climbing (AS-0118, AS-0119, AS-0120).
- 2026-11-22: messages always win; the item-name chip only flashes on equip (AS-0121).
- 2026-11-22: any matching animal counts (AS-0122); rescue missions: find, help 1-2 times, photo proof (AS-0123 to AS-0125).
- 2026-11-22: double jump: Space again in mid-air (AS-0126).
- 2026-11-22: realistic animals, starting with the camel (AS-0127); parts light up only while helping (AS-0128).
- 2026-11-22: higher-fidelity world, 2x map, biome landmarks, detailed avatar/animals, more animals and species (AS-0129 to AS-0140).
- 2026-11-22: research station start, scientist briefing, photo board, character customizer (AS-0141 to AS-0144).
- 2026-11-22: declutter: one HUD layout with no overlaps, small mission pill, one menu (AS-0147 to AS-0149).
- 2026-11-22: animals keep an arm's length apart (AS-0153).
- 2026-11-22: small inventory: no flor/hoja, strawberries are the only food (AS-0154, AS-0155).
- 2026-11-22: cactus prick bounce-back (AS-0156); auto-climb by pushing into a tree (AS-0157).
- 2026-11-22: bridges, rope bridge between peaks, ladders and lookout towers (AS-0158 to AS-0160).
- 2026-11-22: climb anything too steep: generic climb targets, climbable peaks with summits, climbable station (AS-0163 to AS-0165).
- 2026-11-22: treetop to treetop jumping with landing assist (AS-0166).
- 2026-11-22: intro talk gives the story (animals need help); the scientist always stays at the station (AS-0142).
- 2026-11-22: badges/stickers, naming, day/night with sleeping animals, mamá missions, waterfall treasure, animal friend (AS-0167 to AS-0175); jump over rocks (AS-0176).
- 2026-11-22: encounters vs missions: roaming encounters, ordered missions started only at the station board, replayable (AS-0177 to AS-0191).
- 2026-11-22: the scientist NPC stands on the station porch beside the door (AS-0203): `game/npc.js` (pure post, idle/wave by distance with hysteresis, `SA.npc.create()` tracker) and `game/render/scientist.js` (the kid avatar plus lab coat, glasses, clipboard; reads the clipboard, waves when near). She never wanders and is a solid circle in the player's obstacles. Since AS-0212 the player spawns straight in front of her, facing her (her post lives in `SA.station.layout().scientist`).
- 2026-11-22: map is about 2x (AS-0247, slice 1/3 of AS-0129): `SA.map.BOUNDS` x -112..112, z -36..36; four 56-wide strips in `SA.map.STRIPS`; river (x -28), pond (31, 14), ford (z 27) and the mountain/dune ramps (`MOUNTAIN_EDGE`/`DUNE_EDGE`, derived from STRIPS) sit inside their biomes; peaks live in the montana strip. Never hardcode a map size or border: read `SA.map.BOUNDS` / `STRIPS`.
- 2026-11-22: decor and pickups cover the 2x map (AS-0248, slice 2/3 of AS-0129): placement is the pure `SA.decorPlan.plan()` (game/decor-plan.js; render/decor.js only builds meshes from it), dealing each rule round-robin into the four quadrants of every strip. `SA.pickups.layout` does the same and also refuses the spawn clearing and station footprint. Counts are data (`SA.decorPlan.RULES`, game/data/pickups.js); add new scenery as a RULES row so it is spread, bounded and dry by construction.
- 2026-11-23: animals and mission anchors cover the 2x map (AS-0249, slice 3/3 of AS-0129): `SA.animalPlan.placements` deals each biome's animals into its four quadrants (`SA.animalPlan.quadrants(biome)`: sw, ne, se, nw order, split at the strip centre and z = 0), on flat dry ground off the spawn and station. A biome with fewer animals than quadrants gives each empty quadrant to a ground animal as wander area (`radius`, passed to `SA.wander` via `group.userData.wanderRadius`); there is still one instance per species (everything is keyed by animal id). Mission 1's pigs are at least 24 apart (`spawn.minApart`) inside the mamá's whole strip.
- 2026-11-23: mountain species (AS-0269, slice 2/3 of AS-0131): `oso`, `llama`, `condor` are appended last in `game/data/animals.js` (montana now has 5; appending keeps earlier species' herd homes in place). New part `cuello` (el cuello: the llama's long neck, its own part so "cuello largo" and "Toca el cuello" work; the head-fit test treats cabeza + cuello as one chain). Two new clue templates, `part-size-alas` ("alas grandes", the condor) and `part-length-pelo` ("pelo largo", the oso), make each newcomer the unique answer of a level-1 clue. The condor's white collar is the existing `plumas` part. Voice clips come from `scripts/voices.js` (never hand-edited), so the new names speak via speechSynthesis until it is re-run.
- 2026-11-23: forest and jungle species (AS-0270, slice 3/3 of AS-0131): `ciervo`, `ardilla` (bosque) and `jaguar`, `perezoso` (selva, perch 'tree') are appended last in `game/data/animals.js`; every biome now has 5 regular species (a test in `test/animals.test.js` keeps it so). New parts `manchas` (the jaguar's spots) and `garras` (the sloth's claws) plus two templates, `part-size-manchas` ("manchas grandes") and `part-length-garras` ("garras largas"), give each a unique level-1 clue; the ciervo is the one "cuernos largos" and the ardilla the one `rojo` animal. With 5 species for 4 quadrants no biome has a spare quadrant, so no roaming wander area is handed out any more. Voice clips are still generated by `scripts/voices.js`; new names use speechSynthesis until it is re-run.
- 2026-11-23: biome ground plants (AS-0295, slice 2/3 of AS-0133): plants are data in `game/data/plants.js` (kind `plant`: biome, family, shape, count, scale range, three tints, sway; always soft, validated at load). bosque bushes + ferns, selva big-leaf plants + vines, desierto dry shrubs + three small cactus shapes (the big blocking saguaro stays decor), montana alpine flowers + low pines. `SA.groundCoverPlan.plan()` places them after the grass; `game/render/plant-shapes.js` builds each `shape` as one merged geometry and `render/ground-cover.js` draws every plant as one InstancedMesh pool with the grass's shared sway. A new plant = a data row plus (if new) a shape builder; engine code never names a biome. Anything that must block the player belongs in `game/data/decor.js` instead.
- 2026-11-22: followers (AS-0172): `SA.follow` (game/follow.js, pure) walks the player's breadcrumb trail at 1.5-2 units, hops the player's jumped gaps, steers around solids and water, and pops (`f.pop = {fromX, fromZ, x, z}` for sparkles) just behind the player when more than 15 away or stuck over 3 s. `SA.follow.stepAll(followers, player, solids, dt)` lines up several (baby, then friend). The mamá mission, animal friend and renderer tickets should use it, not re-implement it. AS-0238: a follower never pops across water (it waits at the edge facing the leader, `f.hold`), "stuck" means no net progress toward its target, and the trail is cleared whenever the leader comes back within `GAP_START`, so it follows fresh footprints.
- 2026-11-23: terrain detail (AS-0291, slice 1/2 of AS-0132): ground colour is the pure, seeded `SA.terrain.groundColor(x, z, height, seed[, out])` (game/terrain-color.js, after map.js). `render/world.js` paints every vertex (1 m segments) with it; each `SA.map.STRIPS` id has a style (bosque greens with dry and flower patches, selva dark soil and moss, desierto ripple stripes, montana scree and snow by height) and borders blend over `2 * SA.terrain.BLEND_HALF` = 6 m. Add a new biome look as a style there; pass `out` to avoid allocation.
- 2026-11-23: desierto dunes (AS-0307, slice 1/4 of AS-0136): `SA.map.duneHeight` is big seeded rolling dunes (crests ~1.5 to 4.4) with fine wind ripples, fading in over 14 m from `DUNE_EDGE`. `SA.map.MAX_WALK_SLOPE` (0.7 rise/run) is the walkable limit; `test/dunes.test.js` samples the desierto and its border and keeps every slope under 75% of it, so any new terrain feature there must too. Terrain stays in `groundHeight` only; the ripples are real geometry (the 1 m mesh), the existing `SA.terrain` desierto stripes shade them.
- 2026-11-23: desierto landmarks (AS-0308, slice 2/4 of AS-0136): `SA.desertPlan` (game/desert-plan.js) seeds one rock arch and one oasis (pool + 5 palms) on the flattest dunes, inside the desierto and clear of borders, spawn and station. `solids()` (pillars, pool, palm trunks; the gap under the arch stays open) goes into the scene.js obstacles; `near(x, z, pad)` is how decor, ground cover, pickups, animal-plan and wander keep out. Rendered by game/render/desert-landmarks.js (arch merged, palms InstancedMesh). Any new desierto landmark follows the same plan/solids/near contract.
- 2026-11-23: montaña trail, boulder field and snow (AS-0309, slice 3/4 of AS-0136): `SA.mountainTrail` (game/mountain-trail.js, loads BEFORE map.js, pure) is a ~95 m switchback polyline (three legs 10 m apart joined by rounded hairpins) from the bosque border up a summit ridge (`DOME`, a bell across x that SA.map reads). `SA.map.mountainHeight` carves it: along the line the ground follows a monotone, smoothed profile of the surrounding terrain (steady grade, tested far below `MAX_WALK_SLOPE`), blending back over a 2.2 m shoulder that never reaches the next leg; mountain lumps are flattened near the trail. The ground colour (`game/terrain-color.js`) draws it as lighter gravel, like the forest paths; snow is white above ~3.8 m, so the summit is white. `SA.mountainPlan` (game/mountain-plan.js) seeds 4 boulder clusters (SA.rocks 'montana' specs) off the trail, borders, spawn, station and peaks; same `solids()` / `near()` (trail + field, for decor and plants) / `inField()` (field only, for pickups and animals, which may use the trail) contract. Rendered by game/render/mountain-boulders.js (InstancedMesh per kind+variant, per-instance colour). New mountain features must keep clear of the trail (`SA.mountainTrail.distance`).
- 2026-11-24: montaña waterfall (AS-0310, slice 4/4 of AS-0136): `SA.mountainPlan.get().waterfall` (same seeded plan, drawn after the boulders so their layout is unchanged) is a 3-block stone cliff backed into an uphill (-x) slope with a round pool at its foot; the sheet falls down the +x face into it. It is the flattest of a long seeded search, 4.8 m footprint, off trail, borders (3.5 m), spawn, station, peaks and boulders. The pool is water, not terrain (like the desierto oasis): `solids()` includes the pool and cliff (tall, never jumpable), `inField()` (animals, pickups) and `near()` (decor, plants) include the footprint, `inPool()` is the pool alone. Rendered by game/render/waterfall.js: the sheet's stripes scroll in a shader (`uScroll`), 14 spray blobs are one InstancedMesh rewritten from typed arrays in `update(dt)` (scene.js calls it each frame); nothing is allocated per frame.
