// Conversion de la partition en événements de jeu (communs au
// synthétiseur, à la sortie Web MIDI et à l'export .mid).

const BASE_VELOCITY = { right: 82, left: 64 };

/**
 * @returns {Array<{u:number, durU:number, midi:number, vel:number, hand:string, id:string, channel:number}>}
 *   u / durU en unités (double-croches) depuis le début.
 */
export function buildNoteEvents(score) {
  const { meter, measures, params } = score;
  const out = [];
  measures.forEach((m) => {
    const offset = m.index * meter.measureLen;
    for (const staff of [m.treble, m.bass]) {
      if (!staff) continue;
      for (const ev of staff) {
        if (ev.rest) continue;
        const isMelody = params.hands !== 'both' || ev.hand === 'right';
        let vel = isMelody ? BASE_VELOCITY.right : BASE_VELOCITY.left;
        if (ev.start === 0) vel += 12;
        else if (ev.start % meter.beatLen === 0) vel += 4;
        for (const n of ev.notes) {
          out.push({
            u: offset + ev.start,
            durU: ev.dur,
            midi: n.midi,
            vel: Math.min(127, vel),
            hand: ev.hand,
            id: ev.id,
            channel: ev.hand === 'left' ? 1 : 0,
          });
        }
      }
    }
  });
  return out.sort((a, b) => a.u - b.u);
}

/** Instants (en unités) des temps, pour le métronome. */
export function buildBeatEvents(score) {
  const { meter, totalUnits } = score;
  const beats = [];
  for (let u = 0; u < totalUnits; u += meter.beatLen) {
    beats.push({ u, accent: u % meter.measureLen === 0 });
  }
  return beats;
}
