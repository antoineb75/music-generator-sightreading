// Conversion de la partition en événements de jeu (communs au
// synthétiseur, à la sortie Web MIDI et à l'export .mid).

const BASE_VELOCITY = { right: 82, left: 64 };

/**
 * @returns {Array<{u:number, durU:number, midi:number, vel:number, hand:string, id:string, channel:number}>}
 *   u / durU en unités (double-croches) depuis le début.
 */
export function buildNoteEvents(score) {
  const { meter, measures, params } = score;
  const nMeasures = measures.length;
  const out = [];
  measures.forEach((m) => {
    const offset = m.index * meter.measureLen;
    // Arche dynamique de phrase : léger crescendo vers ~60% puis détente cadentielle
    const progress = nMeasures > 1 ? m.index / (nMeasures - 1) : 0;
    const phraseBoost = Math.round(Math.sin(progress * Math.PI) * 8);
    const isFinalCadence = m.index >= nMeasures - 1;

    for (const staff of [m.treble, m.bass]) {
      if (!staff) continue;
      for (const ev of staff) {
        if (ev.rest) continue;
        const isMelody = params.hands !== 'both' || ev.hand === 'right';
        let vel = isMelody ? BASE_VELOCITY.right : BASE_VELOCITY.left;
        vel += phraseBoost;

        if (ev.start === 0) vel += 10;
        else if (ev.start % meter.beatLen === 0) vel += 4;
        else if (ev.dur <= 2) vel -= 5; // notes de passage / doubles-croches plus légères

        if (isMelody && ev.dur >= 4) vel += 4; // notes tenues plus chantantes
        if (isFinalCadence) vel -= 4; // résolution finale posée

        const app = ev.appoggiatura;
        const appDur = app ? Math.min(0.6, ev.dur * 0.25) : 0;
        if (app) {
          out.push({
            u: offset + ev.start,
            durU: appDur,
            midi: app.midi,
            vel: Math.max(30, Math.min(127, vel + 2)),
            hand: ev.hand,
            id: ev.id,
            channel: ev.hand === 'left' ? 1 : 0,
          });
        }

        const maxDNote = ev.notes.length ? Math.max(...ev.notes.map((n) => n.D)) : 0;
        for (const n of ev.notes) {
          // En accords, faire ressortir légèrement la voix supérieure (soprano)
          const voiceBalance = ev.notes.length > 1 && n.D === maxDNote ? 4 : ev.notes.length > 1 ? -4 : 0;
          out.push({
            u: offset + ev.start + appDur,
            durU: ev.dur - appDur,
            midi: n.midi,
            vel: Math.max(30, Math.min(127, vel + voiceBalance)),
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
