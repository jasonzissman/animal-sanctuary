/* SA.sandbox: habitat sandbox controller (pure wiring over SA.habitat; no THREE, no DOM; unit-tested with stubs).
 *
 *   var box = SA.sandbox.create({ view, scene, audio?, onMode? })
 *     view   { setActive(on), select(id|null), setStars(n), toast(msg) }       the tray / big button
 *     scene  { add(record), remove(placedId) }                                  the 3D props (game/render/props.js)
 *     onMode(active)                                                           e.g. pause Scout & Spot while building
 *   box.restore()        adds every saved prop to the scene (call once at boot)
 *   box.toggle()         enters/leaves sandbox mode -> active boolean
 *   box.select(propId)   tray tap: picks a prop to place (tap it again to put it back) -> selected id or null
 *   box.onGround({x,z})  tap on the ground: places the selected prop when affordable and allowed (speaks its Spanish
 *                        name); otherwise a gentle "boing" and a short phrase. Never punishes.
 *   box.onPropTap(id)    tap on a placed prop (only with nothing selected): removes it and refunds its stars
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var MESSAGES = {
    stars: '⭐ Necesitas más',
    biome: '🙈 Aquí no',
    terrain: '🙈 Aquí no',
    bounds: '🙈 Aquí no',
    occupied: '🙈 Ya hay algo',
    full: '🙈 Ya hay muchos',
    unknown: '🙈 Aquí no'
  };

  function create(o) {
    var view = o.view, scene = o.scene, audio = o.audio || SA.audio;
    var active = false, selected = null;

    function say(key) { try { if (audio && audio.say) audio.say(key); } catch (e) { /* silent */ } }
    function sfx(name) { try { if (audio && audio.sfx) audio.sfx(name); } catch (e) { /* silent */ } }
    function stars() { return SA.save.get().stars; }
    function setSelected(id) { selected = id; view.select(id); }

    function restore() { SA.habitat.list().forEach(function (r) { scene.add(r); }); }

    function toggle() {
      active = !active;
      setSelected(null);
      view.setActive(active);
      view.setStars(stars());
      if (o.onMode) o.onMode(active);
      if (root.SAT && root.SAT.track) root.SAT.track('sandbox.mode', { active: active });
      return active;
    }

    function select(propId) {
      if (!active || !SA.data.get('props', propId)) return selected;
      setSelected(selected === propId ? null : propId);
      if (selected) sfx('pop');
      return selected;
    }

    function onGround(pt) {
      if (!active || !pt) return null;
      if (!selected) { view.toast('👆 Elige algo'); return { status: 'idle' }; }
      var def = SA.data.get('props', selected);
      var res = SA.habitat.place(selected, pt.x, pt.z);
      if (res.status === 'placed') {
        scene.add(res.prop);
        sfx('pop');
        say('prop:' + def.id);
        view.toast(def.icon + ' ' + def.name.es);
        view.setStars(res.stars);
        setSelected(null);
        if (root.SAT && root.SAT.track) root.SAT.track('sandbox.place', { prop: def.id });
      } else {
        sfx('boing');
        view.toast(MESSAGES[res.reason] || MESSAGES.unknown);
      }
      return res;
    }

    function onPropTap(placedId) {
      if (!active || selected) return null;
      var res = SA.habitat.remove(placedId);
      if (res.status !== 'removed') return res;
      scene.remove(placedId);
      sfx('pop');
      view.toast('+' + res.refund + ' ⭐');
      view.setStars(res.stars);
      if (root.SAT && root.SAT.track) root.SAT.track('sandbox.remove', { prop: res.prop.prop });
      return res;
    }

    return {
      restore: restore, toggle: toggle, select: select, onGround: onGround, onPropTap: onPropTap,
      active: function () { return active; }, selected: function () { return selected; }
    };
  }

  SA.sandbox = { MESSAGES: MESSAGES, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
