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
- **The game starts at a research station (AS-0141, slice 1 = AS-0145).** A small low-poly building (door, window, roof, dish, antenna,
  "Estación" sign with an atom icon, bench, crates) stands on the flattest dry ground by the bosque/selva border; the kid spawns just outside
  the door looking out. `SA.station` (game/station.js, pure) is the one source: `layout()`, `collisionBoxes()` (doorway left open),
  `obstacles()` (those boxes as circle chains, appended to the player's obstacle list in scene.js), `spawn()` (what `SA.player.spawn()`
  returns when the module is loaded) and `inFootprint()` (decor and animal placement keep out). `game/render/station.js` builds the model
  from flat primitives (the sign letters are boxes, no textures). Later slices put the scientist and briefing in/at the station.
  **The doorway is a Use target (AS-0146).** `game/station-door.js` adds `SA.station.doorTarget()/doorTargets()` (the doorway centre,
  reach `DOOR_REACH` 2.6) and the menu hook: `SA.station.open(source)` / `close()` / `toggle()` / `isOpen()` / `onOpen(fn)` / `onClose(fn)`
  (`SAT.track('station.open', { source })` once per opening). `SA.spaceTarget` takes `doors` (kind `'door'`, scored like trees and
  pickups, so it hands off to the roof climb or a find by proximity); `SA.spaceUse` calls `openDoor(door)` on E / Enter (Space jumps, it
  never opens it); the door frame group (`station.userData.doorNode`) is what the one outline glows; `render/station-door-tap.js`
  raycasts an invisible pick volume (`userData.stationDoor`) so a tap/click on the door opens it too. `ui/station-menu-view.js` is only a
  placeholder card (⚛️ + "La estación" + ✕); the customizer (AS-0144) attaches via `SA.station.onOpen` and renders into the view's `body`.
  **Misiones board (AS-0197):** `ui/missions-board-view.js` renders into that `body` (re-rendered on every open) from the pure
  `SA.missionsBoard` (`missions-board.js`: `cards()` maps `SA.missions.list()` to done ✅ / next ⭐ / active ▶️ / locked 🔒 cards,
  `layout()` sizes a wrapping, scrolling grid so cards never overlap each other or the ✕). Tap done = replay, next = start (the
  scientist's intro comes in the next ticket), active = En curso + Continuar / Abandonar; locked cards are grey numbered silhouettes
  that only say "Misión N". Every card speaks via `SA.audio.say`.
  **Scientist on the board (AS-0198):** tapping the glowing next card no longer starts it: the scientist speaks the mission's 2-3
  `intro` lines (data: `intro: [{ es, icon }]`, each ≤ 6 words, validated at load), one picture card each with a "Otra vez" replay,
  then "Empezar" calls `SA.missions.start` (a done card still replays at once). The talk replaces the grid inside the same station
  card (never a second overlay). `SA.missionsDialogue` (`missions-dialogue.js`, pure): `begin/view/advance` sequence the lines;
  `celebration()` / `markSeen()` give the one-time cheer (fanfare + "¡Lo lograste! ¡Nueva misión!") the first station visit after a
  mission is finished, pointing 👇 at the unlocked card; "seen" is `missions.celebrated: [id]` in the save, so replays never re-cheer.
  **Hook for the intro conversation (AS-0142):** `SA.missionsBoard.pointAndStartFirst()` opens the station, points at the next card
  (mission 1 on a fresh save) and runs its intro; returns `{ ok, id }` or `{ ok:false, reason:'busy'|'none'|'no-board' }`. AS-0142
  does not exist yet: when it lands it should call this at the end of its talk.
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
  **Touch jump button (AS-0114):** `game/ui/jump-button.js` is a round icon-only ⬆️ button (84 px, above the use button; appears at the first
  touch like the joystick) that calls `rig.jump()`, a fresh Space press with the same rule (grounded only, one hop per landing, no buffering
  in the air, none during the climb animation).
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
- **Animals keep an arm's length apart (AS-0153).** Never bunched: at least ~1.5 units of gap between any two animals'
  bodies at all times (hard rule, not a soft preference), so tapping one never hits another. Implemented for wandering
  ground animals by `SA.spacing` (GAP, `bodyRadius` from the size trait) and checked on every step in `SA.wander`
  (`others` = `[[x, z, r], ...]`, `bodyRadius`); overlapping spawns are pushed apart in ~1 s. Placement (AS-0162): `SA.animalPlan.placements` spawns every animal
  (herds included) over its whole biome strip with the gap AND non-overlapping pick volumes (`pickRadius`); tree
  perchers (`SA.perch.create` `others`/`bodyRadius`, `claims()`) only sit on or hop to spots that are free by the same gap.
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
- **The story starts at the research station (AS-0141 to AS-0144).** You spawn by a small station; a scientist coworker
  (always there, on the station porch) opens a new game with a quick ~15-20 s talk: animals in the sanctuary need
  help, find them, help them, photo proof (spoken, picture cards), hands you la cámara and gives missions; proof photos go on the station's
  photo board. Inside the station you can change your character any time (body style, hair, skin tone, clothes), saved.
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
  and speaks "¡Ya puede volar!". Optional action fields `tangled`/`gives`/`say` are the pattern for other "stuck" care needs.
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
  themselves. Missions are deliberate stories that are only started from the scientist's Misiones board in the station
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
