// ─────────────────────────────────────────────────────────────
//  Générateur de partitions
// ─────────────────────────────────────────────────────────────
//
// Unité de temps interne : la double-croche (1). Noire = 4, blanche = 8…
// Le modèle produit est indépendant du rendu (VexFlow) et de la lecture.

import { createRng, newSeed } from './rng.js';
export { newSeed };
import {
  KEYS, MINOR_TYPES, getKey, buildScale, degreeOf, toMidi, dOf, lowestDWithLetter, octaveOf,
} from './theory.js';

export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '2/2', '3/8', '6/8', '12/8'];
export const LEVELS = ['initiation', 'debutant', 'intermediaire', 'avance', 'expert'];
export const LEVEL_LABELS = {
  initiation: '1. Initiation (5 doigts)',
  debutant: '2. Débutant',
  intermediaire: '3. Intermédiaire',
  avance: '4. Avancé',
  expert: '5. Virtuose',
};
export const HANDS = ['both', 'right', 'left'];
export const HAND_LABELS = { both: 'Deux mains', right: 'Main droite', left: 'Main gauche' };
export const ENRICHED_OPTIONS = ['auto', 'both', 'right', 'left', 'seventh', 'extended', 'none'];
export const ENRICHED_LABELS = {
  auto: 'Automatique (selon niveau)',
  both: 'Deux mains (MD harmonisée + MG enrichie)',
  right: 'Main droite seule (mélodie harmonisée)',
  left: 'Main gauche seule (accords & voicings)',
  seventh: 'Accords de 7e uniquement',
  extended: 'Accords très enrichis (9e, 11e, 13e)',
  none: 'Désactivé (triades simples)',
};
export const MEASURES_MIN = 1;
export const MEASURES_MAX = 32;

const RANDOM_MEASURES = [4, 8, 8, 12, 16];
const RANDOM_BPMS_BY_LEVEL = {
  initiation: [56, 60, 68, 76],
  debutant: [68, 76, 84, 92],
  intermediaire: [80, 88, 96, 108],
  avance: [96, 108, 116, 126],
  expert: [116, 126, 138, 152, 168],
};

export function tempoItalianName(bpm) {
  if (bpm < 60) return 'Largo';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 156) return 'Allegro';
  if (bpm < 176) return 'Vivace';
  return 'Presto';
}
const TS_BY_LEVEL = {
  initiation: ['4/4', '3/4'],
  debutant: ['2/4', '3/4', '4/4'],
  intermediaire: ['2/4', '3/4', '4/4', '6/8', '2/2'],
  avance: ['2/4', '3/4', '4/4', '6/8', '2/2', '3/8', '5/4'],
  expert: TIME_SIGNATURES,
};
const MAX_FIFTHS_BY_LEVEL = {
  initiation: 1,
  debutant: 2,
  intermediaire: 3,
  avance: 5,
  expert: 7,
};

/** Durées représentables par une seule figure (avec point éventuel). */
const VALID_DURATIONS = [24, 16, 12, 8, 6, 4, 3, 2, 1];

// ── Paramètres ──────────────────────────────────────────────

const clampMeasures = (n) => Math.min(MEASURES_MAX, Math.max(MEASURES_MIN, Math.round(Number(n) || 8)));
const clampBpm = (n) => Math.min(240, Math.max(40, Math.round(Number(n) || 90)));

/** Résout les paramètres « aléatoires » en valeurs concrètes. */
export function resolveParams(settings, rng) {
  const r = settings.random || {};
  const level = r.level ? rng.pick(LEVELS) : settings.level;
  const hands = r.hands ? rng.pick(HANDS) : settings.hands;
  const timeSignature = r.timeSignature ? rng.pick(TS_BY_LEVEL[level]) : settings.timeSignature;
  const measures = r.measures ? rng.pick(RANDOM_MEASURES) : clampMeasures(settings.measures);
  const maxFifths = MAX_FIFTHS_BY_LEVEL[level];
  const key = r.key ? rng.pick(KEYS.filter((k) => Math.abs(k.fifths) <= maxFifths)).id : settings.key;
  const minorType = r.minorType ? rng.pick(MINOR_TYPES) : settings.minorType;
  const bpm = r.bpm ? rng.pick(RANDOM_BPMS_BY_LEVEL[level] || RANDOM_BPMS_BY_LEVEL.intermediaire) : clampBpm(settings.bpm);

  const enrichedChords = r.enrichedChords
    ? rng.pick(ENRICHED_OPTIONS)
    : (settings.enrichedChords || 'auto');

  let enrichRight = false;
  let enrichLeft = false;
  let extensionType = 'auto'; // 'none' | 'seventh' | 'extended'

  if (enrichedChords === 'none') {
    enrichRight = false;
    enrichLeft = false;
    extensionType = 'none';
  } else if (enrichedChords === 'seventh') {
    enrichRight = true;
    enrichLeft = true;
    extensionType = 'seventh';
  } else if (enrichedChords === 'extended') {
    enrichRight = true;
    enrichLeft = true;
    extensionType = 'extended';
  } else if (enrichedChords === 'right') {
    enrichRight = true;
    enrichLeft = false;
    extensionType = (level === 'expert' || level === 'avance') ? 'extended' : 'seventh';
  } else if (enrichedChords === 'left') {
    enrichRight = false;
    enrichLeft = true;
    extensionType = (level === 'expert' || level === 'avance') ? 'extended' : 'seventh';
  } else if (enrichedChords === 'both') {
    enrichRight = true;
    enrichLeft = true;
    extensionType = (level === 'expert' || level === 'avance') ? 'extended' : 'seventh';
  } else {
    // 'auto' : progression graduelle sur les 5 niveaux
    if (level === 'initiation') {
      enrichRight = false;
      enrichLeft = false;
      extensionType = 'none';
    } else if (level === 'debutant') {
      enrichRight = false;
      enrichLeft = true; // V7 discrète
      extensionType = 'seventh';
    } else if (level === 'intermediaire') {
      enrichRight = true;
      enrichLeft = true;
      extensionType = 'seventh';
    } else if (level === 'avance') {
      enrichRight = true;
      enrichLeft = true;
      extensionType = 'extended';
    } else {
      // expert / virtuose
      enrichRight = true;
      enrichLeft = true;
      extensionType = 'extended';
    }
  }

  return {
    level,
    hands,
    timeSignature,
    measures,
    key,
    minorType,
    bpm,
    enrichedChords,
    enrichRight,
    enrichLeft,
    extensionType,
  };
}

export function meterInfo(ts) {
  const [num, den] = ts.split('/').map(Number);
  const measureLen = (num * 16) / den;
  let beatLen;
  let compound = false;
  if (den === 8 && num % 3 === 0 && num > 3) { beatLen = 6; compound = true; } // 6/8, 12/8
  else if (den === 8) beatLen = 2; // 3/8 : temps à la croche
  else beatLen = 4; // x/4 et 2/2 (rythmes construits à la noire)
  return { ts, num, den, measureLen, beatLen, compound, beats: measureLen / beatLen };
}

// ── Rythme ──────────────────────────────────────────────────

// [motif, poids] – un motif remplit exactement un temps.
const BEAT_PATTERNS = {
  4: {
    initiation: [[[4], 1]],
    debutant: [[[4], 7], [[2, 2], 2]],
    intermediaire: [[[4], 4], [[2, 2], 4], [[3, 1], 1.2], [[1, 1, 2], 0.8]],
    avance: [[[4], 2.8], [[2, 2], 3], [[1, 1, 1, 1], 1.8], [[3, 1], 2], [[1, 1, 2], 1.8], [[2, 1, 1], 1.8], [[1, 2, 1], 1]],
    expert: [[[4], 2], [[2, 2], 2.5], [[1, 1, 1, 1], 3], [[3, 1], 2], [[1, 1, 2], 2.5], [[2, 1, 1], 2.5], [[1, 2, 1], 1.5]],
  },
  6: {
    initiation: [[[6], 4]],
    debutant: [[[6], 3], [[4, 2], 3]],
    intermediaire: [[[6], 2], [[4, 2], 3], [[2, 2, 2], 3], [[3, 1, 2], 1]],
    avance: [[[6], 1.5], [[4, 2], 2], [[2, 2, 2], 3], [[3, 1, 2], 2], [[1, 1, 2, 2], 1.5], [[2, 1, 1, 2], 1]],
    expert: [[[6], 1], [[4, 2], 2], [[2, 2, 2], 3], [[3, 1, 2], 2.5], [[1, 1, 2, 2], 2.5], [[2, 1, 1, 2], 2], [[2, 2, 1, 1], 2]],
  },
  2: {
    initiation: [[[2], 5]],
    debutant: [[[2], 5]],
    intermediaire: [[[2], 3], [[1, 1], 1.5]],
    avance: [[[2], 2], [[1, 1], 3]],
    expert: [[[2], 1.5], [[1, 1], 4]],
  },
};

const LONG_NOTE_PROB = { initiation: 0.65, debutant: 0.45, intermediaire: 0.30, avance: 0.20, expert: 0.12 };
const REST_PROB = { initiation: 0, debutant: 0, intermediaire: 0.05, avance: 0.08, expert: 0.12 };

/** Motifs couvrant plusieurs temps, selon la position dans la mesure. */
function longOptions(meter, level, b, remaining) {
  const { beatLen, beats } = meter;
  const opts = [];
  if (beatLen === 4) {
    const halfOk = beats % 2 === 0 ? b % 2 === 0 : beats === 3 ? true : b === 0 || b === 3;
    if (remaining >= 2 && halfOk) {
      opts.push([[8], 3]);
      if (level !== 'initiation' && level !== 'debutant') opts.push([[6, 2], 2]);
    }
    if (remaining >= 3 && b === 0) opts.push([[12], beats === 3 ? 3 : 1.5]);
    if (remaining >= 4 && b === 0) opts.push([[16], 1.5]);
  } else if (beatLen === 6) {
    if (remaining >= 2 && b % 2 === 0) opts.push([[12], 3]);
    if (remaining >= 4 && b === 0) opts.push([[24], 1]);
  } else {
    if (remaining >= 2 && b <= 1) opts.push([[4], 3]);
    if (remaining >= 3 && b === 0) opts.push([[6], 2]);
  }
  return opts;
}

function genRhythmSegment(rng, meter, level, beatsCount) {
  const out = [];
  let b = 0;
  while (b < beatsCount) {
    const longs = longOptions(meter, level, b, beatsCount - b);
    const pattern = longs.length && rng.chance(LONG_NOTE_PROB[level])
      ? rng.weighted(longs)
      : rng.weighted(BEAT_PATTERNS[meter.beatLen][level]);
    let pos = b * meter.beatLen;
    for (const dur of pattern) {
      out.push({ start: pos, dur });
      pos += dur;
    }
    b += pattern.reduce((s, d) => s + d, 0) / meter.beatLen;
  }
  return out;
}

function genMeasureRhythm(rng, meter, level, isLast) {
  if (!isLast) return genRhythmSegment(rng, meter, level, meter.beats);
  // Dernière mesure : note finale longue.
  const L = meter.measureLen;
  const candidates = VALID_DURATIONS.filter((d) => d <= L && d % meter.beatLen === 0);
  let finalDur = candidates[0];
  if (level !== 'initiation' && level !== 'debutant' && meter.beats >= 3 && rng.chance(0.5)) {
    const shorter = candidates.filter((d) => d < L && d >= L / 2);
    if (shorter.length) finalDur = shorter[0];
  }
  const prefixBeats = (L - finalDur) / meter.beatLen;
  const prefix = prefixBeats > 0 ? genRhythmSegment(rng, meter, level, prefixBeats) : [];
  return [...prefix, { start: L - finalDur, dur: finalDur }];
}

function applyRests(rng, rhythms, level) {
  const p = REST_PROB[level];
  if (!p) return;
  rhythms.forEach((rhythm, m) => {
    if (m === rhythms.length - 1) return;
    rhythm.forEach((ev, i) => {
      if (m === 0 && i === 0) return;
      const prevRest = i > 0 && rhythm[i - 1].rest;
      if (!prevRest && [2, 4, 6].includes(ev.dur) && rng.chance(p)) ev.rest = true;
    });
  });
}

/** Décompose une durée en figures simples (pour les notes tenues). */
function decompose(len) {
  const out = [];
  let rest = len;
  while (rest > 0) {
    const d = VALID_DURATIONS.find((v) => v <= rest);
    out.push(d);
    rest -= d;
  }
  return out;
}

// ── Harmonie ────────────────────────────────────────────────

// Enchaînements d'accords (degrés 0 = I … 5 = vi) et poids.
const TRANSITIONS = {
  0: [[3, 3], [4, 3], [5, 2], [1, 2], [2, 0.5]],
  1: [[4, 4], [3, 1]],
  2: [[5, 2], [3, 2]],
  3: [[4, 4], [0, 2], [1, 2]],
  4: [[0, 5], [5, 2], [3, 0.5]],
  5: [[1, 3], [3, 3], [4, 2]],
};
const ALLOWED_DEGREES = {
  initiation: [0, 3, 4],
  debutant: [0, 3, 4, 5],
  intermediaire: [0, 1, 3, 4, 5],
  avance: [0, 1, 2, 3, 4, 5],
  expert: [0, 1, 2, 3, 4, 5],
};

function genHarmony(rng, meter, level, n, mode, enrichActive = false, extensionType = 'auto') {
  const L = meter.measureLen;
  const slots = [];
  for (let m = 0; m < n; m++) {
    const splittable = m < n - 1 && level !== 'initiation' && level !== 'debutant' && meter.beats === 4;
    if (splittable && rng.chance(level === 'expert' ? 0.6 : level === 'avance' ? 0.45 : 0.25)) {
      slots.push({ m, start: 0, len: L / 2 }, { m, start: L / 2, len: L / 2 });
    } else {
      slots.push({ m, start: 0, len: L });
    }
  }
  // iii (accord augmenté en mineur harmonique) exclu en mineur.
  const allowed = ALLOWED_DEGREES[level].filter((d) => !(mode === 'minor' && d === 2));
  let prev = 0;
  slots.forEach((s, i) => {
    if (i === 0) s.degree = 0;
    else {
      const opts = TRANSITIONS[prev].filter(([d]) => allowed.includes(d));
      s.degree = opts.length ? rng.weighted(opts) : 0;
    }
    s.seventh = false;
    s.ninth = false;
    s.sus4 = false;
    s.add9 = false;

    if (enrichActive && extensionType === 'seventh') {
      if (s.degree === 4) s.seventh = rng.chance(0.8); // V7
      else if ([0, 1, 3, 5].includes(s.degree)) {
        if (rng.chance(0.45)) s.seventh = true;
        else if (rng.chance(0.2)) s.add9 = true;
      }
    } else if (enrichActive && extensionType === 'extended') {
      const p7 = level === 'expert' ? 0.9 : 0.8;
      const p9 = level === 'expert' ? 0.7 : 0.55;
      if (s.degree === 4) {
        s.seventh = true;
        if (rng.chance(p9)) s.ninth = true; // V9
        else if (rng.chance(0.3)) s.sus4 = true; // V7sus4
      } else if ([0, 1, 3, 5].includes(s.degree)) {
        s.seventh = rng.chance(p7);
        if (s.seventh && rng.chance(p9)) s.ninth = true; // Imaj9, ii9, IVmaj9, vi9
        else if (!s.seventh && rng.chance(0.4)) s.add9 = true;
      }
    }
    prev = s.degree;
  });
  const last = slots.length - 1;
  slots[last].degree = 0;
  if (last - 1 >= 1) {
    slots[last - 1].degree = 4; // cadence parfaite V → I
    slots[last - 1].seventh = enrichActive && extensionType !== 'none';
    if (enrichActive && extensionType === 'extended' && rng.chance(0.65)) slots[last - 1].ninth = true;
  }
  // Demi-cadence au milieu des pièces de 8 mesures et plus.
  if (n >= 8 && n % 2 === 0) {
    const idx = slots.findLastIndex((s) => s.m === n / 2 - 1);
    if (idx > 0 && idx < last - 1) {
      slots[idx].degree = 4;
      if (enrichActive && extensionType !== 'none') slots[idx].seventh = true;
    }
  }
  return slots;
}

const chordDegrees = (slot) => {
  const d = slot.degree;
  if (slot.sus4) {
    const degs = [d, (d + 3) % 7, (d + 4) % 7];
    if (slot.seventh) degs.push((d + 6) % 7);
    if (slot.ninth) degs.push((d + 1) % 7);
    return degs;
  }
  const degs = [d, (d + 2) % 7, (d + 4) % 7];
  if (slot.seventh) degs.push((d + 6) % 7);
  if (slot.ninth) degs.push((d + 1) % 7);
  if (slot.add9 && !slot.ninth) degs.push((d + 1) % 7);
  return degs;
};

const chordAt = (slots, m, pos) =>
  slots.find((s) => s.m === m && pos >= s.start && pos < s.start + s.len) ?? slots[slots.length - 1];

// ── Mélodie ─────────────────────────────────────────────────

// Poids des intervalles (en degrés) : unisson, seconde, tierce…
const INTERVAL_WEIGHTS = {
  initiation: [0.6, 8, 1.2, 0.1, 0, 0, 0, 0],
  debutant: [0.4, 6, 2.2, 0.5, 0.25, 0, 0, 0],
  intermediaire: [0.5, 5, 2.5, 1, 0.8, 0.25, 0, 0.15],
  avance: [0.4, 4, 2.5, 1.3, 1, 0.5, 0.2, 0.35],
  expert: [0.3, 3.5, 2.8, 1.5, 1.2, 0.7, 0.4, 0.5],
};
const RANGE_OFFSETS = {
  initiation: [0, 4], // position fixe 5 doigts (Do-Sol)
  debutant: [0, 7],   // 1 octave
  intermediaire: [-2, 8],
  avance: [-4, 11],
  expert: [-6, 14],
};

function melodyRange(key, level, clef) {
  const [lo, hi] = RANGE_OFFSETS[level];
  if (clef === 'treble') {
    const tonicD = dOf(key.tonicLetter, 4);
    return { tonicD, lo: Math.max(26, tonicD + lo), hi: Math.min(43, tonicD + hi) }; // La3 … Ré6
  }
  const tonicD = dOf(key.tonicLetter, key.tonicLetter >= 5 ? 2 : 3);
  return { tonicD, lo: Math.max(16, tonicD + lo), hi: Math.min(30, tonicD + hi) }; // Mi2 … Mi4
}

function genMelody(rng, ctx, rhythms, clef, hand) {
  const { key, scale, meter, slots, level, n } = ctx;
  const { tonicD, lo, hi } = melodyRange(key, level, clef);
  const IW = INTERVAL_WEIGHTS[level];
  const range = [];
  for (let D = lo; D <= hi; D++) range.push(D);

  const pitched = [];
  rhythms.forEach((rhythm, m) => rhythm.forEach((ev) => { if (!ev.rest) pitched.push({ m, ev }); }));
  const N = pitched.length;

  const nearest = (cands, target) =>
    cands.reduce((best, D) => (Math.abs(D - target) < Math.abs(best - target) ? D : best), cands[0]);

  let prev = null;
  let prev2 = null;
  let lastInt = 0;
  let dir = rng.chance(0.5) ? 1 : -1;

  pitched.forEach(({ m, ev }, i) => {
    const chord = chordAt(slots, m, ev.start);
    const cdegs = chordDegrees(chord);
    const isCT = (D) => cdegs.includes(degreeOf(D, key));
    let D;

    if (i === N - 1) {
      const tonics = range.filter((x) => degreeOf(x, key) === 0);
      D = nearest(tonics, prev ?? tonicD);
    } else if (i === 0) {
      const cands = range.filter(isCT);
      D = rng.weighted(cands.map((x) => [x, (degreeOf(x, key) === 0 ? 2 : 1) / (1 + Math.abs(x - (tonicD + 2)))]));
    } else if (i === N - 2) {
      // Sensible ou 2e degré pour résoudre par mouvement conjoint.
      const cands = range.filter((x) => {
        const deg = degreeOf(x, key);
        const tonicNear = (deg === 1 && x - 1 >= lo) || (deg === 6 && x + 1 <= hi);
        return tonicNear;
      });
      const weighted = cands.map((x) => [x, IW[Math.abs(x - prev)] ?? 0]);
      D = weighted.some(([, w]) => w > 0) ? rng.weighted(weighted) : nearest(cands.length ? cands : range, prev);
    } else {
      const strong = ev.start % meter.beatLen === 0;
      const weights = [];
      for (const x of range) {
        const iv = Math.abs(x - prev);
        let w = IW[iv] ?? 0;
        if (!w) continue;
        if (iv === 0 && prev === prev2) continue; // pas trois fois la même note
        const ct = isCT(x);
        w *= strong ? (ct ? 1 : 0.08) : ct ? 1 : 0.9;
        if ((x - prev) * dir > 0) w *= 1.8;
        if (Math.abs(lastInt) >= 3) {
          // après un saut : mouvement conjoint en sens contraire
          if (iv >= 1 && iv <= 2 && Math.sign(x - prev) === -Math.sign(lastInt)) w *= 3;
          if (iv >= 3) w *= 0.3;
        }
        weights.push([x, w]);
      }
      D = weights.length ? rng.weighted(weights) : nearest(range.filter(isCT), prev);
    }

    lastInt = prev == null ? 0 : D - prev;
    prev2 = prev;
    prev = D;
    if (D >= hi - 1) dir = -1;
    else if (D <= lo + 1) dir = 1;
    else if (rng.chance(0.2)) dir = -dir;
    ev.D = D;
  });

  // Altérations : harmonie pour les notes de l'accord, règles mélodiques sinon.
  const alterOf = new Array(N);
  const isMelodic = scale.minorType === 'melodic';
  pitched.forEach(({ m, ev }, i) => {
    const deg = degreeOf(ev.D, key);
    const ct = chordDegrees(chordAt(slots, m, ev.start)).includes(deg);
    const next = pitched[i + 1]?.ev.D;
    if (isMelodic && deg === 6) {
      alterOf[i] = ct || (next != null && next > ev.D) ? scale.melodyUp[6] : scale.melodyDown[6];
    } else if (!(isMelodic && deg === 5)) {
      alterOf[i] = ct ? scale.harmony[deg] : scale.melodyUp[deg];
    }
  });
  if (isMelodic) {
    // 6e degré : haussée si elle monte, ou si elle est voisine d'une sensible haussée
    // (évite la seconde augmentée).
    pitched.forEach(({ m, ev }, i) => {
      if (degreeOf(ev.D, key) !== 5) return;
      const ct = chordDegrees(chordAt(slots, m, ev.start)).includes(5);
      const raised7 = (j) => j >= 0 && j < N && degreeOf(pitched[j].ev.D, key) === 6
        && Math.abs(pitched[j].ev.D - ev.D) === 1 && alterOf[j] === scale.melodyUp[6];
      const next = pitched[i + 1]?.ev.D;
      const up = (next != null && next > ev.D) || raised7(i + 1) || raised7(i - 1);
      alterOf[i] = ct && !up ? scale.harmony[5] : up ? scale.melodyUp[5] : scale.melodyDown[5];
    });
  }

  const events = rhythms.map(() => []);
  const isEnrichedRight = ctx.enrichRight && hand === 'right';
  rhythms.forEach((rhythm, m) => {
    rhythm.forEach((ev, i) => {
      const out = { id: `${hand}-${m}-${i}`, hand, start: ev.start, dur: ev.dur, rest: !!ev.rest, notes: [] };
      if (!ev.rest) {
        const idx = pitched.findIndex((p) => p.ev === ev);
        const alter = alterOf[idx];
        out.notes.push({ D: ev.D, alter, midi: toMidi(ev.D, alter) });

        // Harmonisation de la main droite (accords enrichis)
        if (isEnrichedRight) {
          const isLastNote = (m === n - 1 && i === rhythm.length - 1);
          const isStrongBeat = (ev.dur >= 4 || ev.start === 0 || ev.start % meter.beatLen === 0);
          const isHighLevel = (level === 'avance' || level === 'expert');
          const prob = level === 'expert' ? 0.75 : level === 'avance' ? 0.60 : 0.40;
          const shouldAddChord = isLastNote || (isStrongBeat && rng.chance(prob));

          if (shouldAddChord) {
            const chord = chordAt(slots, m, ev.start);
            const degs = chordDegrees(chord);
            // Recherche de notes de l'accord strictement sous la mélodie
            const candidates = [];
            for (const deg of degs) {
              const letter = (key.tonicLetter + deg) % 7;
              // On teste les octaves possibles sous ev.D
              for (let oct = octaveOf(ev.D); oct >= 3; oct--) {
                const candD = oct * 7 + letter;
                const interval = ev.D - candD;
                if (candD >= 21 && interval >= 2 && interval <= 8 && !candidates.includes(candD)) {
                  candidates.push(candD);
                }
              }
            }
            candidates.sort((a, b) => b - a); // du plus proche au plus bas

            const maxNotesToAdd = isLastNote
              ? (level === 'expert' ? 3 : level === 'avance' ? 2 : 1)
              : (level === 'expert' ? 2 : 1);
            const notesToAdd = candidates.slice(0, maxNotesToAdd);

            for (const cD of notesToAdd) {
              const cAlter = scale.harmony[degreeOf(cD, key)];
              out.notes.push({ D: cD, alter: cAlter, midi: toMidi(cD, cAlter) });
            }
            out.notes.sort((a, b) => a.D - b.D);
          }
        }
      }
      events[m].push(out);
    });
  });
  return events;
}

// ── Accompagnement main gauche ──────────────────────────────

const ACC_STYLES = {
  4: {
    initiation: ['held_root'],
    debutant: ['held_root', 'held_fifth', 'beat_root'],
    intermediaire: ['block', 'waltz', 'broken', 'held_triad', 'held_seventh'],
    avance: ['alberti', 'arpeggio', 'waltz', 'broken', 'held_seventh', 'jazz_shell'],
    expert: ['alberti', 'arpeggio', 'waltz', 'broken', 'open_ninth', 'jazz_shell', 'arpeggio_9th'],
  },
  6: {
    initiation: ['held_root'],
    debutant: ['held_root', 'held_fifth', 'beat_root'],
    intermediaire: ['comp_qe', 'block', 'held_triad', 'held_seventh'],
    avance: ['arp3', 'arp3b', 'comp_qe', 'held_seventh'],
    expert: ['arp3', 'arp3b', 'comp_qe', 'open_ninth', 'arpeggio_9th'],
  },
  2: {
    initiation: ['held_root'],
    debutant: ['held_root', 'held_fifth'],
    intermediaire: ['beat_root', 'held_triad', 'waltz', 'held_seventh'],
    avance: ['arp3', 'waltz', 'held_seventh'],
    expert: ['arp3', 'waltz', 'open_ninth', 'jazz_shell'],
  },
};

function genAccompaniment(rng, ctx) {
  const { key, scale, meter, slots, level, n, enrichLeft, extensionType } = ctx;
  let availableStyles = ACC_STYLES[meter.beatLen][level];
  if (!enrichLeft || extensionType === 'none') {
    availableStyles = availableStyles.filter((s) => !['held_seventh', 'open_ninth', 'jazz_shell', 'arpeggio_9th'].includes(s));
    if (!availableStyles.length) availableStyles = ['held_root'];
  } else if (extensionType === 'seventh') {
    availableStyles = availableStyles.filter((s) => !['open_ninth', 'arpeggio_9th'].includes(s));
    if (!availableStyles.length) availableStyles = ['held_root'];
  }
  const style = rng.pick(availableStyles);
  const B = meter.beatLen;
  const letterOfDeg = (deg) => (key.tonicLetter + deg) % 7;

  const perMeasure = Array.from({ length: n }, () => []);

  for (const slot of slots) {
    const r = lowestDWithLetter(letterOfDeg(slot.degree), 16); // basse Mi2 … Ré3
    const degs = chordDegrees(slot);
    const upperDegs = slot.seventh || slot.ninth ? degs.slice(1) : degs;
    const upper = upperDegs.map((d) => lowestDWithLetter(letterOfDeg(d), 21)).sort((a, b) => a - b); // Do3 … Si3
    const ninthD = lowestDWithLetter(letterOfDeg((slot.degree + 1) % 7), 21);
    const seventhD = lowestDWithLetter(letterOfDeg((slot.degree + 6) % 7), 21);

    const nBeats = slot.len / B;
    const evs = [];
    const add = (pos, dur, Ds) => evs.push({ start: slot.start + pos, dur, Ds });
    const fill = (Ds) => { let pos = 0; for (const d of decompose(slot.len)) { add(pos, d, Ds); pos += d; } };
    const cycle = (step, seq) => { for (let pos = 0, k = 0; pos < slot.len; pos += step, k++) add(pos, step, [seq[k % seq.length]]); };

    if (slot.m === n - 1) {
      // Accord final tenu
      if (level === 'initiation' || level === 'debutant') {
        fill([r]);
      } else if (level === 'intermediaire') {
        fill(enrichLeft ? [r, r + 4, r + 7] : [r, r + 4]);
      } else {
        fill(enrichLeft ? [r, r + 4, seventhD, ninthD] : [r, r + 4, r + 7]);
      }
    } else {
      switch (style) {
        case 'held_root': fill([r]); break;
        case 'held_fifth': fill([r, r + 4]); break;
        case 'held_triad': fill(upper); break;
        case 'held_seventh': fill([r, ...upper.slice(0, 3)]); break;
        case 'open_ninth': fill([r, r + 4, ninthD]); break;
        case 'beat_root': for (let b = 0; b < nBeats; b++) add(b * B, B, [r]); break;
        case 'block': for (let b = 0; b < nBeats; b++) add(b * B, B, upper); break;
        case 'jazz_shell':
          for (let b = 0; b < nBeats; b++) {
            if (b === 0) add(0, B, [r, seventhD]);
            else add(b * B, B, upper.slice(0, 2));
          }
          break;
        case 'waltz':
          for (let b = 0; b < nBeats; b++) {
            if (b === 0) add(0, B, [r]);
            else if (nBeats >= 4 && b === Math.floor(nBeats / 2) + (nBeats % 2)) add(b * B, B, [r - 3 >= 15 ? r - 3 : r + 4]);
            else add(b * B, B, upper);
          }
          break;
        case 'broken': cycle(B, [r, r + 4, r + 7, r + 4]); break;
        case 'alberti': cycle(2, [upper[0], upper[upper.length - 1], upper[1], upper[upper.length - 1]]); break;
        case 'arpeggio': cycle(2, [r, r + 4, r + 7, r + 4]); break;
        case 'arpeggio_9th': cycle(2, [r, upper[0], seventhD, ninthD]); break;
        case 'comp_qe': for (let b = 0; b < nBeats; b++) { add(b * B, 4, [r]); add(b * B + 4, 2, upper); } break;
        case 'arp3': cycle(2, [r, r + 4, r + 7]); break;
        case 'arp3b': cycle(2, [r, r + 4, r + 9]); break;
        default: fill([r]);
      }
    }
    perMeasure[slot.m].push(...evs);
  }

  return perMeasure.map((evs, m) => evs
    .sort((a, b) => a.start - b.start)
    .map((ev, i) => {
      const Ds = [...new Set(ev.Ds)].sort((a, b) => a - b);
      return {
        id: `left-${m}-${i}`,
        hand: 'left',
        start: ev.start,
        dur: ev.dur,
        rest: false,
        notes: Ds.map((D) => {
          const alter = scale.harmony[degreeOf(D, key)];
          return { D, alter, midi: toMidi(D, alter) };
        }),
      };
    }));
}

// ── Point d'entrée ──────────────────────────────────────────

export function generateScore(settings, seed) {
  const rng = createRng(seed);
  const params = resolveParams(settings, rng);
  const key = getKey(params.key);
  const scale = buildScale(key, params.minorType);
  const meter = meterInfo(params.timeSignature);
  const n = params.measures;
  const slots = genHarmony(rng, meter, params.level, n, key.mode, params.enrichRight || params.enrichLeft, params.extensionType);
  const ctx = {
    key,
    scale,
    meter,
    slots,
    level: params.level,
    n,
    enrichRight: params.enrichRight,
    enrichLeft: params.enrichLeft,
    extensionType: params.extensionType,
  };

  const rhythms = Array.from({ length: n }, (_, m) => genMeasureRhythm(rng, meter, params.level, m === n - 1));
  applyRests(rng, rhythms, params.level);

  let treble = null;
  let bass = null;
  if (params.hands === 'left') {
    bass = genMelody(rng, ctx, rhythms, 'bass', 'left');
  } else {
    treble = genMelody(rng, ctx, rhythms, 'treble', 'right');
    if (params.hands === 'both') bass = genAccompaniment(rng, ctx);
  }

  const measures = Array.from({ length: n }, (_, m) => ({
    index: m,
    treble: treble ? treble[m] : null,
    bass: bass ? bass[m] : null,
  }));

  // Contrôle : chaque mesure doit être exactement remplie.
  measures.forEach((ms) => {
    for (const staff of [ms.treble, ms.bass]) {
      if (!staff) continue;
      const total = staff.reduce((s, e) => s + e.dur, 0);
      if (total !== meter.measureLen) console.warn(`Mesure ${ms.index + 1} incomplète : ${total}/${meter.measureLen}`);
    }
  });

  return { seed, params, key, scale, meter, slots, measures, totalUnits: n * meter.measureLen };
}
