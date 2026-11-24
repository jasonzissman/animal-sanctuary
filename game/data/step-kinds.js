/* Mission step kinds: registers kind "stepKinds" (SA.data). Pure data; no THREE, no DOM. The engine is game/mission-run.js.
 * A mission step is data { kind, ...params, line } (see game/data/missions.js). Each kind is ONE row here; a new kind is a new row.
 *
 * Row (JSON-serialisable):
 *   id        the step's `kind` ('find')
 *   event     the event type the kind listens for ('found'); the game reports events as { type, ...fields }
 *   required  { param: 'string' | 'number' } the step must carry these params
 *   optional  { param: 'string' | 'number' | 'boolean' } params that may be present
 *   match     { stepParam: eventField } the step advances when every listed stepParam that is PRESENT on the step equals the
 *             event's field (an optional param left out of the step matches anything, e.g. photo without a target)
 *   progress  optional { total: 'n' } counted kind: each matching event adds 1 and the step advances when the count reaches the
 *             step's `n` param (a required whole number >= 1)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var TYPES = { string: 1, number: 1, boolean: 1 };

  function validateTypes(field, o, allowBool) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail(field, 'must be an object of { param: type }');
    Object.keys(o).forEach(function (k) {
      if (!TYPES[o[k]] || (o[k] === 'boolean' && !allowBool)) fail(field + '.' + k, 'must be "string" or "number"' + (allowBool ? ' or "boolean"' : ''));
    });
  }

  function validateKind(r) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(r.id)) fail('id', 'must be a camelCase word');
    if (typeof r.event !== 'string' || !r.event) fail('event', 'must be a non-empty event type string');
    validateTypes('required', r.required, false);
    validateTypes('optional', r.optional === undefined ? {} : r.optional, true);
    if (!r.match || typeof r.match !== 'object' || Array.isArray(r.match)) fail('match', 'must be an object { stepParam: eventField }');
    Object.keys(r.match).forEach(function (k) {
      if (!(k in r.required) && !(r.optional && k in r.optional)) fail('match.' + k, 'must name a required or optional param');
      if (typeof r.match[k] !== 'string' || !r.match[k]) fail('match.' + k, 'must be the event field name (string)');
    });
    if (r.progress !== undefined) {
      var p = r.progress;
      if (!p || typeof p !== 'object' || typeof p.total !== 'string' || r.required[p.total] !== 'number') fail('progress.total', 'must name a required number param');
    }
  }

  SA.data.defineKind('stepKinds', validateKind);
  SA.data.register('stepKinds', [
    { id: 'find', event: 'found', required: { target: 'string' }, match: { target: 'target' } },
    { id: 'help', event: 'helped', required: { animal: 'string', careTask: 'string' }, match: { animal: 'animal', careTask: 'careTask' } },
    { id: 'follow', event: 'followed', required: { animal: 'string' }, match: { animal: 'animal' } },
    { id: 'carry', event: 'carried', required: { item: 'string' }, optional: { fragile: 'boolean' }, match: { item: 'item' } },
    { id: 'deliver', event: 'delivered', required: { item: 'string', to: 'string' }, match: { item: 'item', to: 'to' } },
    { id: 'hatch', event: 'hatched', required: { item: 'string' }, match: { item: 'item' } },   // AS-0315: the placed egg hatches after a short wait
    { id: 'push', event: 'pushed', required: { item: 'string' }, match: { item: 'item' } },   // AS-0319: the log slides to its bridged spot and locks
    { id: 'dry', event: 'dried', required: { item: 'string' }, match: { item: 'item' } },   // AS-0320: rub the wet animal dry with the sponge
    { id: 'invite', event: 'invited', required: { animal: 'string' }, match: { animal: 'animal' } },   // AS-0327: walk up to a friend, it then follows you
    { id: 'party', event: 'partied', required: { place: 'string' }, match: { place: 'place' } },   // AS-0328: the short party at the monkey's tree
    { id: 'touch', event: 'touched', required: { animal: 'string', part: 'string' }, match: { animal: 'animal', part: 'part' } },   // AS-0331: tap a body part (the sick camel's la frente)
    { id: 'recover', event: 'recovered', required: { animal: 'string' }, match: { animal: 'animal' } },   // AS-0333: the sick animal rests until the next session / mission
    { id: 'fill', event: 'filled', required: { item: 'string' }, match: { item: 'item' } },   // AS-0331: fill the held bucket at the water
    { id: 'collect', event: 'collected', required: { item: 'string', n: 'number' }, match: { item: 'item' }, progress: { total: 'n' } },
    { id: 'goTo', event: 'arrived', required: { place: 'string' }, match: { place: 'place' } },
    { id: 'talk', event: 'talked', required: { who: 'string' }, match: { who: 'who' } },
    { id: 'photo', event: 'photo', required: {}, optional: { target: 'string' }, match: { target: 'target' } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
