import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/save.js', 'game/album.js', 'game/data/badges.js', 'game/badges.js', 'game/rescue-log.js'];
const plain = (o) => JSON.parse(JSON.stringify(o));

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const tracked = [];
  const track = (t, f) => tracked.push([t, f]);
  const log = SA.rescueLog.create({ track, now: () => new Date('2026-11-22T10:00:00Z') });
  return { SA, log, tracked, badges: SA.badges.create({ track }) };
}
const rescue = (log, o) => log.record({ animalId: 'tortuga', need: 'mud', biome: 'bosque', night: false, ...o });
const ids = (r) => plain(r.earned.map((b) => b.id));

test('a finished rescue is one save row with animal, need, biome, night and date', () => {
  const { SA, log } = setup();
  assert.equal(rescue(log, { need: 'thorn' }).added, true);
  const row = plain(SA.save.get().rescues[0]);
  assert.deepEqual(row, { kind: '', mission: '', animalId: 'tortuga', need: 'thorn', biome: 'bosque', night: false, date: '2026-11-22' });
  assert.equal(log.record({}).added, false);
  assert.equal(log.record({ need: 'mud' }).added, false, 'needs an animal or a story kind');
});

test('first rescue earns Primer rescate and the bronze tortuga badge, once each', () => {
  const { log } = setup();
  const first = rescue(log, {});
  assert.deepEqual(ids(first).sort(), ['amigo-tortuga-bronce', 'primer-rescate']);
  assert.deepEqual(ids(rescue(log, {})), [], 'nothing is earned twice');
});

test('species tiers fire at 1, 5 and 15 of that species only', () => {
  const { log } = setup();
  const got = [];
  for (let i = 0; i < 15; i++) got.push(...ids(rescue(log, { animalId: i < 4 ? 'conejo' : 'tortuga', need: 'mud' })).filter((id) => id.startsWith('amigo-')));
  assert.ok(got.includes('amigo-conejo-bronce') && got.includes('amigo-tortuga-bronce'));
  assert.ok(!got.includes('amigo-conejo-plata'), 'only 4 conejos');
  assert.ok(got.includes('amigo-tortuga-plata'), '11 tortugas');
  assert.ok(!got.includes('amigo-tortuga-oro'));
  for (let i = 0; i < 4; i++) got.push(...ids(rescue(log, {})).filter((id) => id.startsWith('amigo-')));
  assert.ok(got.includes('amigo-tortuga-oro'), '15 tortugas');
});

test('need, biome and night rules count only matching rows', () => {
  const { log } = setup();
  let all = [];
  for (let i = 0; i < 5; i++) all.push(...ids(rescue(log, { animalId: 'camello', need: 'thorn', biome: 'desierto' })));
  assert.ok(all.includes('doctora-de-patitas') && all.includes('explorador-del-desierto'));
  assert.ok(!all.includes('heroe-del-barro') && !all.includes('explorador-del-bosque'));
  all = [];
  for (let i = 0; i < 5; i++) all.push(...ids(rescue(log, { animalId: 'rana', need: 'mud', biome: 'selva', night: i < 3 })));
  assert.ok(all.includes('heroe-del-barro') && all.includes('explorador-de-la-selva'));
  assert.equal(all.filter((id) => id === 'buho-nocturno').length, 1, '3 night rescues earn it once');
  assert.ok(!all.includes('doctora-de-patitas'), 'already earned before; not repeated');
});

test('Súper ayudante at 25 rescues of any kind', () => {
  const { log } = setup();
  let hit = -1;
  for (let i = 0; i < 25; i++) if (ids(rescue(log, { animalId: i % 2 ? 'pato' : 'mono' })).includes('super-ayudante')) hit = i;
  assert.equal(hit, 24);
});

test('check(rescues) returns each badge exactly once and saves the earned ids', () => {
  const { SA, badges, tracked } = setup();
  const rows = [{ kind: '', mission: '', animalId: 'cabra', need: 'hungry', biome: 'montana', night: false }];
  assert.deepEqual(plain(badges.check(rows)).sort(), ['amigo-cabra-bronce', 'primer-rescate']);
  assert.deepEqual(plain(badges.check(rows)), []);
  assert.deepEqual(plain(SA.save.get().badges).sort(), ['amigo-cabra-bronce', 'primer-rescate']);
  assert.deepEqual(tracked.filter(([t]) => t === 'rescue.badge').length, 2);
  assert.deepEqual(plain(badges.earnedIds()).sort(), ['amigo-cabra-bronce', 'primer-rescate']);
});

test('Álbum completo needs every real species photographed (easter eggs and story animals do not count)', () => {
  const { SA, badges } = setup();
  const real = SA.data.all('animals').filter((a) => !a.story && !a.easterEgg);
  real.slice(0, -1).forEach((a) => SA.album.add(a.id));
  assert.deepEqual(plain(badges.check([])), []);
  const p = badges.progress().find((b) => b.id === 'album-completo');
  assert.deepEqual(plain(p), { id: 'album-completo', have: real.length - 1, need: real.length, earned: false });
  SA.album.add(real[real.length - 1].id);
  assert.deepEqual(plain(badges.check([])), ['album-completo']);
  assert.deepEqual(plain(badges.check([])), []);
});

test('progress lists every badge with have capped at need, and earned stays true once saved', () => {
  const { log, badges } = setup();
  for (let i = 0; i < 7; i++) rescue(log, {});
  const byId = Object.fromEntries(badges.progress().map((p) => [p.id, plain(p)]));
  assert.deepEqual(byId['amigo-tortuga-plata'], { id: 'amigo-tortuga-plata', have: 5, need: 5, earned: true });
  assert.deepEqual(byId['amigo-tortuga-oro'], { id: 'amigo-tortuga-oro', have: 7, need: 15, earned: false });
  assert.deepEqual(byId['super-ayudante'], { id: 'super-ayudante', have: 7, need: 25, earned: false });
  assert.equal(badges.progress().length, 14 + 10 * 3 - 0, 'every badge row appears');
});

test('badges and rescue rows survive a save round trip; old rows and junk are handled', () => {
  const { SA } = setup();
  SA.save.update({ rescues: [{ kind: 'reunion', mission: 'mama', animal: 'cerdito' }, { animalId: 'rana', need: 'MUD', night: 'x', date: 'nope' }, { need: 'mud' }, 7],
    badges: ['primer-rescate', 'primer-rescate', 'Bad Id', 4] });
  const s = plain(SA.save.get());
  assert.deepEqual(s.rescues, [{ kind: 'reunion', mission: 'mama', animal: 'cerdito' }, { kind: '', mission: '', animalId: 'rana' }]);
  assert.deepEqual(s.badges, ['primer-rescate']);
});

test('badge rows validate: unknown fields, animals, biomes and bad counts are rejected', () => {
  const { SA } = setup();
  const row = (rule) => [{ id: 'x', es: 'X', icon: '⭐', rule }];
  assert.throws(() => SA.data.register('badges', row({ count: 0 })), /rule\.count/);
  assert.throws(() => SA.data.register('badges', row({ count: 1, animalId: 'dragon' })), /rule\.animalId/);
  assert.throws(() => SA.data.register('badges', row({ count: 1, biome: 'luna' })), /rule\.biome/);
  assert.throws(() => SA.data.register('badges', row({ count: 1, color: 'rojo' })), /rule\.color/);
  assert.throws(() => SA.data.register('badges', row({ count: 1, night: 'si' })), /rule\.night/);
  assert.throws(() => SA.data.register('badges', row({ album: 'some' })), /rule\.album/);
  assert.throws(() => SA.data.register('badges', row({ album: 'all', count: 2 })), /rule/);
  assert.throws(() => SA.data.register('badges', [{ id: 'x', es: 'X', icon: '⭐', tier: 'diamante', rule: { count: 1 } }]), /tier/);
});

test('shipped badges: unique, Spanish, the tier counts are 1/5/15, and the book badge reads the album', () => {
  const { SA } = setup();
  const rows = SA.data.all('badges');
  const book = rows.find((b) => b.id === 'album-completo');
  assert.equal(book.icon, '📖');
  assert.deepEqual(plain(book.rule), { album: 'all' });
  const tort = rows.filter((b) => b.rule.animalId === 'tortuga');
  assert.deepEqual(plain(tort.map((b) => [b.tier, b.rule.count])),[['bronce', 1], ['plata', 5], ['oro', 15]]);
  assert.equal(tort[0].es, 'Amigo de las tortugas');
  assert.ok(!rows.some((b) => b.rule.animalId === 'raton' || b.rule.animalId === 'cerdito'), 'no badge for easter eggs or story animals');
});
