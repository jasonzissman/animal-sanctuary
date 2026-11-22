/* Badges data: registers kind "badges" (SA.data). Pure data; no THREE, no DOM. The earning logic is game/rescue-log.js.
 *
 * Badge row (JSON-serialisable):
 *   id     unique lowercase key ('reune-familias')
 *   es, en short name ('Reúne familias'); en is scaffolding only
 *   icon   short emoji
 *   rule   { kind, count }: earned once the rescue log (SA.rescueLog) holds at least `count` entries of that rescue kind
 *          ('reunion' = a lost baby brought back to its mamá, mission 1). More rescue kinds and badges are added as rows.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;

  function validateBadge(b) {
    if (!/^[a-z][a-z0-9-]*$/.test(b.id)) fail('id', 'must be lowercase ASCII letters, digits or "-"');
    if (typeof b.es !== 'string' || !b.es.trim()) fail('es', 'must be a non-empty string');
    if (b.en !== undefined && (typeof b.en !== 'string' || !b.en.trim())) fail('en', 'must be a non-empty string when present');
    if (typeof b.icon !== 'string' || !b.icon.trim() || b.icon.length > 8) fail('icon', 'must be a short non-empty emoji string');
    var r = b.rule;
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail('rule', 'must be { kind, count }');
    if (typeof r.kind !== 'string' || !/^[a-z][a-z0-9-]*$/.test(r.kind)) fail('rule.kind', 'must be a lowercase rescue kind');
    if (typeof r.count !== 'number' || r.count < 1 || r.count !== Math.floor(r.count)) fail('rule.count', 'must be a whole number >= 1');
  }

  SA.data.defineKind('badges', validateBadge);
  SA.data.register('badges', [
    { id: 'reune-familias', es: 'Reúne familias', en: 'Reunite families', icon: '👨‍👩‍👧', rule: { kind: 'reunion', count: 1 } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
