/* Body-part vocabulary: registers kind "parts" (SA.data) and exposes SA.parts (allowed names).
 * Pure data + validator; no THREE. Render code maps `builder` / `anchor` / `reaction` names to
 * primitives, attachment points and animations, so animals never special-case a part.
 *
 * Part shape (JSON-serialisable):
 *   id, key   same Spanish canonical key, lowercase ASCII (orejas, caparazon...)
 *   label     { es: 'las orejas' (article + accents), en: 'ears' }
 *   gender    'm' | 'f'        number  'sg' | 'pl'   (label.es must start with the agreeing article)
 *   builder   primitive name (SA.parts.BUILDERS); an animal's part entry may override it with its own `builder`
 *   anchor    default attachment point (SA.parts.ANCHORS)
 *   reaction  reaction animation when tapped (SA.parts.REACTIONS)
 *   icon      optional emoji shown beside the part in the photo album (SA.album); a missing icon falls back to a dot
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var BUILDERS = ['box', 'sphere', 'cone', 'cylinder', 'zigzag'];
  var ANCHORS = ['top', 'bottom', 'front', 'back', 'side', 'center'];
  var REACTIONS = ['wiggle', 'flap', 'boing', 'sniff', 'blink', 'swish', 'stomp', 'wobble', 'nod'];
  var ARTICLES = { m: { sg: 'el', pl: 'los' }, f: { sg: 'la', pl: 'las' } };
  var fail = SA.data.fail;

  function text(value, field) {
    if (typeof value !== 'string' || !value.trim()) fail(field, 'must be a non-empty string');
  }

  function oneOf(value, list, field) {
    if (list.indexOf(value) < 0) fail(field, 'must be one of ' + list.join(', ') + ' (got ' + JSON.stringify(value) + ')');
  }

  function validatePart(p) {
    text(p.key, 'key');
    if (!/^[a-z]+$/.test(p.key)) fail('key', 'must be lowercase ASCII letters with no accents');
    if (p.key !== p.id) fail('key', 'must equal id');
    if (!p.label || typeof p.label !== 'object') fail('label', 'must be an object { es, en }');
    text(p.label.es, 'label.es');
    text(p.label.en, 'label.en');
    oneOf(p.gender, ['m', 'f'], 'gender');
    oneOf(p.number, ['sg', 'pl'], 'number');
    var article = ARTICLES[p.gender][p.number];
    if (p.label.es.indexOf(article + ' ') !== 0) {
      fail('label.es', 'must start with the article "' + article + '" for gender ' + p.gender + '/' + p.number);
    }
    oneOf(p.builder, BUILDERS, 'builder');
    oneOf(p.anchor, ANCHORS, 'anchor');
    oneOf(p.reaction, REACTIONS, 'reaction');
    if (p.icon !== undefined) text(p.icon, 'icon');
  }

  SA.parts = { BUILDERS: BUILDERS, ANCHORS: ANCHORS, REACTIONS: REACTIONS, ARTICLES: ARTICLES };
  SA.data.defineKind('parts', validatePart);

  var ICONS = { cabeza: '🙂', cuerpo: '🧸', orejas: '👂', ojos: '👀', hocico: '🐽', pico: '🐤', cola: '〰️', patas: '🐾',
    alas: '🪽', caparazon: '🐢', cuernos: '🐂', aletas: '🐟', plumas: '🪶', nariz: '👃', joroba: '🐫', mejillas: '😊',
    pelo: '🧶', barriga: '🫃', cresta: '👑', cuello: '🦒' };

  function part(key, es, en, gender, number, builder, anchor, reaction) {
    return { id: key, key: key, label: { es: es, en: en }, gender: gender, number: number,
      builder: builder, anchor: anchor, reaction: reaction, icon: ICONS[key] };
  }

  SA.data.register('parts', [
    part('cabeza', 'la cabeza', 'head', 'f', 'sg', 'sphere', 'front', 'boing'),
    part('cuerpo', 'el cuerpo', 'body', 'm', 'sg', 'sphere', 'center', 'wobble'),
    part('orejas', 'las orejas', 'ears', 'f', 'pl', 'cone', 'top', 'wiggle'),
    part('ojos', 'los ojos', 'eyes', 'm', 'pl', 'sphere', 'front', 'blink'),
    part('hocico', 'el hocico', 'snout', 'm', 'sg', 'sphere', 'front', 'sniff'),
    part('pico', 'el pico', 'beak', 'm', 'sg', 'cone', 'front', 'nod'),
    part('cola', 'la cola', 'tail', 'f', 'sg', 'cylinder', 'back', 'swish'),
    part('patas', 'las patas', 'legs', 'f', 'pl', 'cylinder', 'bottom', 'stomp'),
    part('alas', 'las alas', 'wings', 'f', 'pl', 'box', 'side', 'flap'),
    part('caparazon', 'el caparazón', 'shell', 'm', 'sg', 'sphere', 'top', 'wobble'),
    part('cuernos', 'los cuernos', 'horns', 'm', 'pl', 'cone', 'top', 'nod'),
    part('aletas', 'las aletas', 'fins', 'f', 'pl', 'box', 'side', 'swish'),
    part('plumas', 'las plumas', 'feathers', 'f', 'pl', 'box', 'back', 'wiggle'),
    part('nariz', 'la nariz', 'nose', 'f', 'sg', 'sphere', 'front', 'sniff'),
    part('joroba', 'la joroba', 'hump', 'f', 'sg', 'sphere', 'top', 'wobble'),
    part('mejillas', 'las mejillas', 'cheeks', 'f', 'pl', 'sphere', 'front', 'wobble'),
    part('pelo', 'el pelo', 'fur', 'm', 'sg', 'box', 'top', 'wiggle'),
    part('barriga', 'la barriga', 'belly', 'f', 'sg', 'sphere', 'bottom', 'wobble'),
    part('cresta', 'la cresta', 'crest', 'f', 'sg', 'cone', 'top', 'wiggle'),
    part('cuello', 'el cuello', 'neck', 'm', 'sg', 'cylinder', 'front', 'boing')
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
