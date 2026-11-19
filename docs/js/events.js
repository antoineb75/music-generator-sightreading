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

        const maxDNote = ev.notes.length ? Math.max(...ev.notes.map((n) => n.D)) : 0;
        // Articulation pianistique : legato sur la mélodie et les arpèges, légèrement détaché sur accords MG répétés
        const isDetachedAccomp = !isMelody && ev.notes.length > 1 && ev.start > 0 && ev.dur <= 4;
        const gateRatio = isDetachedAccomp ? 0.74 : (isMelody ? 0.96 : 0.92);
        // Micro-humanisation déterministe très subtile (±6 ms) pour un jeu vivant
        const rawHash = Math.sin((offset + ev.start + 1) * 12.9898 + (ev.hand === 'left' ? 78.233 : 0)) * 43758.5453;
        const humanizeSec = (m.index === 0 && ev.start === 0) ? 0 : ((rawHash - Math.floor(rawHash)) - 0.5) * 0.012;

        for (const n of ev.notes) {
          // En accords, faire ressortir légèrement la voix supérieure (soprano)
          const voiceBalance = ev.notes.length > 1 && n.D === maxDNote ? 4 : ev.notes.length > 1 ? -4 : 0;
          out.push({
            u: offset + ev.start,
            durU: ev.dur,
            midi: n.midi,
            vel: Math.max(30, Math.min(127, vel + voiceBalance)),
            hand: ev.hand,
            id: ev.id,
            channel: ev.hand === 'left' ? 1 : 0,
            gateRatio,
            humanizeSec,
          });
        }
      }
    }
  });
  return out.sort((a, b) => a.u - b.u);
}

/**
 * Événements de pédale de sustain (MIDI CC 64) synchronisés sur les changements d'accords.
 * Désactivé en style baroque et en niveau initiation pour préserver la clarté polyphonique.
 */
export function buildPedalEvents(score) {
  const { slots, meter, params, totalUnits } = score;
  if (!slots?.length || params?.level === 'initiation' || params?.style === 'baroque') {
    return [];
  }
  const out = [];
  slots.forEach((s, idx) => {
    const startU = s.m * meter.measureLen + s.start;
    if (idx > 0) {
      out.push({ u: startU, value: 0 }); // relâchement propre au changement d'harmonie
    }
    out.push({ u: startU + (idx > 0 ? 0.12 : 0), value: 127 }); // enfoncement juste après l'attaque
  });
  out.push({ u: Math.max(0, totalUnits - 0.1), value: 0 });
  return out;
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
