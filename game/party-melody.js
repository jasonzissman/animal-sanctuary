/* SA.partyMelody: an original little arrangement of the traditional "Cumpleaños feliz" tune (AS-0328, slice 3 of AS-0183). Pure data + math
 * (no THREE, no DOM; unit-tested in node:vm). The tune is in the public domain; the bass and the soft waltz chords here are ours.
 *
 *   SA.partyMelody.LINES      the four sung lines: [[midi, beats], ...] (3/4 time, C major; the last note of a line is held)
 *   SA.partyMelody.BARS       the harmony of the 8 bars: root names 'C' | 'G' | 'F' (CHORDS has the notes)
 *   SA.partyMelody.notes(o?)  -> [{ w, f, t, d, g }]  the voices SA.audio.melody() plays (seconds from now); o.beat = seconds per beat
 *   SA.partyMelody.duration(o?) -> seconds from the first note to the end of the last one
 *   SA.partyMelody.hz(midi)   -> frequency in Hz
 * Sound goes through SA.audio.melody(notes), which is silent when muted.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var BEAT = 0.42;
  // "Cum-ple-a-ños fe-liz" / "cum-ple-a-ños fe-liz" / "te de-se-a-mos to-dos" / "cum-ple-a-ños fe-liz"
  var LINES = [
    [[67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2]],
    [[67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2]],
    [[67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 1]],
    [[77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 2]]
  ];
  var BARS = ['C', 'G', 'C', 'G', 'C', 'G', 'F', 'C'];
  var CHORDS = { C: { bass: 48, third: 64, fifth: 67 }, G: { bass: 43, third: 62, fifth: 67 }, F: { bass: 41, third: 60, fifth: 69 } };

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function total() { return LINES.reduce(function (s, l) { return s + l.reduce(function (a, n) { return a + n[1]; }, 0); }, 0); }

  function notes(o) {
    var beat = o && o.beat > 0 ? o.beat : BEAT, out = [], t = 0;
    LINES.forEach(function (line) {
      line.forEach(function (n) {
        out.push({ w: 'triangle', f: hz(n[0]), t: t * beat, d: Math.max(0.2, n[1] * beat * 0.95), g: 0.22 });
        t += n[1];
      });
    });
    BARS.forEach(function (name, b) {                       // oom-pah-pah: the bass on beat 1, the soft chord on beats 2 and 3
      var c = CHORDS[name];
      out.push({ w: 'sine', f: hz(c.bass), t: b * 3 * beat, d: beat * 1.8, g: 0.16 });
      [1, 2].forEach(function (k) {
        out.push({ w: 'sine', f: hz(c.third), t: (b * 3 + k) * beat, d: beat * 0.8, g: 0.05 });
        out.push({ w: 'sine', f: hz(c.fifth), t: (b * 3 + k) * beat, d: beat * 0.8, g: 0.05 });
      });
    });
    return out;
  }

  function duration(o) { return total() * (o && o.beat > 0 ? o.beat : BEAT) + 0.3; }

  SA.partyMelody = { LINES: LINES, BARS: BARS, CHORDS: CHORDS, BEAT: BEAT, hz: hz, notes: notes, duration: duration, beats: total };
})(typeof window !== 'undefined' ? window : globalThis);
