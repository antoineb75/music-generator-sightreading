// Conversion de la partition en événements de jeu (communs au
// synthétiseur, à la sortie Web MIDI et à l'export .mid).

const BASE_VELOCITY = { right: 82, left: 64 };

function slotAt(slots, mIdx, pos) {
  if (!slots?.length) return null;
  return slots.find((s) => s.m === mIdx && pos >= s.start && pos < s.start + s.len) ?? slots[slots.length - 1];
}

/**
 * @returns {Array<{u:number, durU:number, midi:number, vel:number, hand:string, id:string, channel:number, gateRatio:number, humanizeSec:number, rollSec:number}>}
 *   u / durU en unités (double-croches) depuis le début.
 */
export function buildNoteEvents(score) {
  const { meter, measures, params, slots } = score;
  const nMeasures = measures.length;
  const style = params?.style || 'classique';
  const isPopSwing = style === 'pop' && !meter.compound && meter.beatLen === 4;

  // Hauteur moyenne de la mélodie pour indexer la dynamique sur la courbe mélodique
  const melodyDs = [];
  measures.forEach((m) => {
    const melStaff = params?.hands === 'left' ? m.bass : m.treble;
    if (!melStaff) return;
    melStaff.forEach((ev) => {
      if (!ev.rest && ev.notes?.length) melodyDs.push(ev.notes[ev.notes.length - 1].D);
    });
  });
  const melodyMidD = melodyDs.length
    ? melodyDs.reduce((s, d) => s + d, 0) / melodyDs.length
    : 32;

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

        // Backbeat subtil en Pop / Jazz (temps 2 et 4)
        if (isPopSwing && (ev.start === 4 || ev.start === 12)) vel += 4;

        // Tension harmonique (dominante / 7e)
        const curSlot = slotAt(slots, m.index, ev.start);
        if (curSlot && (curSlot.degree === 4 || curSlot.seventh)) vel += 3;

        // Dynamique corrélée au contour mélodique (plus la mélodie monte, plus elle chante)
        const maxDNote = ev.notes.length ? Math.max(...ev.notes.map((n) => n.D)) : 0;
        if (isMelody && ev.notes.length) {
          const contourBoost = Math.max(-4, Math.min(6, Math.round((maxDNote - melodyMidD) * 0.6)));
          vel += contourBoost;
          if (ev.dur >= 4) vel += 4;
        }
        if (isFinalCadence) vel -= 4; // résolution finale posée

        // Articulation pianistique : legato sur la mélodie et les arpèges, légèrement détaché sur accords MG répétés
        const isDetachedAccomp = !isMelody && ev.notes.length > 1 && ev.start > 0 && ev.dur <= 4;
        const gateRatio = isDetachedAccomp ? 0.74 : (isMelody ? 0.96 : 0.92);

        // Micro-humanisation déterministe très subtile (±6 ms) pour un jeu vivant
        const rawHash = Math.sin((offset + ev.start + 1) * 12.9898 + (ev.hand === 'left' ? 78.233 : 0)) * 43758.5453;
        const humanizeSec = (m.index === 0 && ev.start === 0) ? 0 : ((rawHash - Math.floor(rawHash)) - 0.5) * 0.012;

          // Swing subtil sur les croches en style Pop / Jazz (ratio ~56/44)
          let u = offset + ev.start;
          let durU = ev.dur;
          if (isPopSwing && !ev.tuplet) {
            const posInBeat = ev.start % 4;
            if (Math.abs(posInBeat - 2) < 1e-6) {
              u += 0.22;
              durU = Math.max(0.5, ev.dur - 0.22);
            } else if (posInBeat === 0 && ev.dur === 2) {
              durU = 2.22;
            }
          }

          // Léger roulé / arpégiation naturelle sur les accords larges et l'accord final (hors Baroque)
          const span = ev.notes.length > 1 ? ev.notes[ev.notes.length - 1].D - ev.notes[0].D : 0;
          const shouldRoll = style !== 'baroque' && ev.notes.length >= 2 && (isFinalCadence || (span >= 4 && (style === 'romantique' || style === 'pop')));
          const rollStep = isFinalCadence ? 0.018 : 0.012;

          ev.notes.forEach((n, noteIdx) => {
            // En accords, faire ressortir légèrement la voix supérieure (soprano)
            const voiceBalance = ev.notes.length > 1 && n.D === maxDNote ? 4 : ev.notes.length > 1 ? -4 : 0;
            const rollSec = shouldRoll ? noteIdx * rollStep : 0;
            out.push({
              u,
              durU,
              midi: n.midi,
              vel: Math.max(30, Math.min(127, vel + voiceBalance)),
              hand: ev.hand,
              id: ev.id,
              channel: ev.hand === 'left' ? 1 : 0,
              gateRatio,
              humanizeSec,
              rollSec,
            });
        });
}
    }
  });
return out.sort((a, b) => a.u - b.u || a.rollSec - b.rollSec);
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

/**
 * Événements de pédales MIDI synchronisés sur l'harmonie :
 * - CC 64 (Sustain) en pédale syncopée (after-pedaling) à chaque changement d'accord,
 *   avec relâchement anticipé si le grave bouge conjointement.
 * - CC 67 (Una Corda / pédale douce) sur la section B en style Romantique.
 */
export function buildPedalEvents(score) {
  const { slots, meter, params, totalUnits, measures } = score;
  if (!slots?.length || params?.level === 'initiation' || params?.style === 'baroque') {
    return [];
  }
  const out = [];
  const style = params?.style || 'classique';

  slots.forEach((s, idx) => {
    const startU = s.m * meter.measureLen + s.start;
    if (idx > 0) {
      // Pédale syncopée : relâchement juste après l'attaque de la nouvelle basse, puis ré-enfoncement
      out.push({ u: startU + 0.08, cc: 64, value: 0 });
      out.push({ u: startU + 0.22, cc: 64, value: 127 });
    } else {
      out.push({ u: startU, cc: 64, value: 127 });
    }

    // Protection du registre grave : si plusieurs basses très graves (<= G2) se succèdent dans le slot, relever plus tôt
    const mBass = measures?.[s.m]?.bass;
    if (mBass && idx < slots.length - 1) {
      const lowNotes = mBass.filter((e) => !e.rest && e.start >= s.start && e.start < s.start + s.len && e.notes?.[0]?.D <= 18);
      if (lowNotes.length >= 3) {
        const nextStartU = slots[idx + 1].m * meter.measureLen + slots[idx + 1].start;
        out.push({ u: Math.max(startU + 0.5, nextStartU - 0.35), cc: 64, value: 0 });
      }
    }
  });
  out.push({ u: Math.max(0, totalUnits - 0.1), cc: 64, value: 0 });

  // Pédale douce Una Corda (CC 67) sur la section B (mesures 5-6) en style Romantique
  if (style === 'romantique' && measures?.length >= 8) {
    out.push({ u: 4 * meter.measureLen, cc: 67, value: 127 });
    out.push({ u: 6 * meter.measureLen, cc: 67, value: 0 });
  }

  return out.sort((a, b) => a.u - b.u || a.cc - b.cc);
}

    /**
     * Tempo Map expressive (pour l'export .mid) :
     * - micro-rubato de phrase en Romantique / Classique,
     * - légère respiration sur la demi-cadence,
     * - ritardando progressif sur la dernière mesure.
     */
    export function buildTempoEvents(score, baseBpm) {
      const { meter, measures, params, totalUnits } = score;
      const n = measures?.length ?? 0;
      const style = params?.style || 'classique';
      const out = [{ u: 0, bpm: baseBpm }];
      if (n < 2) return out;

      const mLen = meter.measureLen;
      const halfM = Math.floor(n / 2) - 1;

      if (style === 'romantique' && n >= 4) {
        // Léger élan au cœur de la 1ère phrase
        out.push({ u: Math.round(mLen * 1.5), bpm: Math.round(baseBpm * 1.03) });
        // Micro-respiration à la demi-cadence
        out.push({ u: halfM * mLen + Math.max(0, mLen - meter.beatLen), bpm: Math.round(baseBpm * 0.95) });
        // Retour a tempo sur la 2e moitié
        out.push({ u: (halfM + 1) * mLen, bpm: baseBpm });
      } else if (style === 'classique' && n >= 4) {
        out.push({ u: halfM * mLen + Math.max(0, mLen - meter.beatLen), bpm: Math.round(baseBpm * 0.97) });
        out.push({ u: (halfM + 1) * mLen, bpm: baseBpm });
      }

      // Ritardando progressif sur la dernière mesure (et dernier temps de l'avant-dernière)
      const lastStart = Math.max(0, totalUnits - mLen);
      if (lastStart >= meter.beatLen) {
        out.push({ u: lastStart - meter.beatLen, bpm: Math.round(baseBpm * 0.94) });
      }
      out.push({ u: lastStart, bpm: Math.round(baseBpm * 0.86) });
      if (mLen >= 8) {
        out.push({ u: lastStart + mLen / 2, bpm: Math.round(baseBpm * 0.78) });
      }

      return out.sort((a, b) => a.u - b.u);
    }
