// ─────────────────────────────────────────────────────────────
//  Partitio : Générateur musical pianistique algorithmique
//  Composition harmonique, polyphonique et rythmique adaptée au piano
// ─────────────────────────────────────────────────────────────

import { createRng, newSeed } from './rng.js';
export { newSeed };
import {
  KEYS, MINOR_TYPES, getKey, buildScale, degreeOf, toMidi, dOf, lowestDWithLetter, octaveOf, letterOf,
  PIANO_NOTES, noteToD, dToNote, frNoteLabel,
} from './theory.js';

// ── Constantes & Interfaces publiques ────────────────────────

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
  extended: 'Accords très enrichis (9e/11e/13e)',
  none: 'Désactivé (triades simples)',
};

export function tempoItalianName(bpm) {
  if (bpm < 60) return 'Largo';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 168) return 'Allegro';
  return 'Presto';
}

/** Durées représentables par une seule figure (avec point éventuel). */
const VALID_DURATIONS = [24, 16, 12, 8, 6, 4, 3, 2, 1];

const RANDOM_MEASURES = [4, 8, 8, 8, 12, 16];
const RANDOM_MIN_NOTES_BY_LEVEL = {
  initiation: ['C3', 'E3', 'G3', 'C4'],
  debutant: ['C2', 'G2', 'C3'],
  intermediaire: ['C2', 'G2', 'A2', 'E2'],
  avance: ['A1', 'C2', 'E2'],
  expert: ['A1', 'C1', 'E1', 'C2'],
};
const RANDOM_MAX_NOTES_BY_LEVEL = {
  initiation: ['G4', 'A4', 'C5'],
  debutant: ['C5', 'D5', 'E5'],
  intermediaire: ['E5', 'G5', 'A5'],
  avance: ['A5', 'C6', 'D6'],
  expert: ['C6', 'E6', 'G6'],
};
const TS_BY_LEVEL = {
  initiation: ['4/4', '3/4'],
  debutant: ['4/4', '3/4', '2/4'],
  intermediaire: ['4/4', '3/4', '2/4', '6/8', '2/2'],
  avance: TIME_SIGNATURES,
  expert: TIME_SIGNATURES,
};
const MAX_FIFTHS_BY_LEVEL = {
  initiation: 1, // Do, Sol, Fa majeurs et La, Mi, Ré mineurs
  debutant: 2,
  intermediaire: 4,
  avance: 7,
  expert: 7,
};
const RANDOM_BPMS_BY_LEVEL = {
  initiation: [60, 72, 80],
  debutant: [72, 84, 96],
  intermediaire: [88, 100, 112, 120],
  avance: [100, 116, 132, 144],
  expert: [112, 128, 144, 160],
};

const clampMeasures = (n) => Math.min(32, Math.max(1, Math.round(Number(n) || 8)));
const clampBpm = (n) => Math.min(240, Math.max(40, Math.round(Number(n) || 90)));

// ── Résolution des paramètres ────────────────────────────────

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

  let minNote = r.minNote
    ? rng.pick(RANDOM_MIN_NOTES_BY_LEVEL[level] || ['C2', 'G2', 'C3'])
    : (settings.minNote || 'C2');
  let maxNote = r.maxNote
    ? rng.pick(RANDOM_MAX_NOTES_BY_LEVEL[level] || ['C5', 'G5', 'C6'])
    : (settings.maxNote || 'C6');

  let minD = noteToD(minNote);
  let maxD = noteToD(maxNote);
  if (minD > maxD) {
    const tmpD = minD; minD = maxD; maxD = tmpD;
    const tmpNote = minNote; minNote = maxNote; maxNote = tmpNote;
  }
  if (maxD - minD < 4) {
    maxD = minD + 4;
    maxNote = dToNote(maxD);
  }

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
    // 'auto' : progression graduelle selon les 5 niveaux
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
    minNote,
    maxNote,
    minD,
    maxD,
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
  if (den === 8 && num % 3 === 0 && num > 3) {
    beatLen = 6;
    compound = true;
  } else if (den === 8) {
    beatLen = 2;
  } else if (den === 2) {
    beatLen = 8;
  } else {
    beatLen = 4;
  }
  return { ts, num, den, measureLen, beatLen, compound, beats: measureLen / beatLen };
}

/** Décompose une durée en figures simples standard pour VexFlow. */
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

// ── Rythme pianistique ──────────────────────────────────────

// Motifs de temps (beat patterns) – Chaque motif fait exactement beatLen.
// Les valeurs négatives représentent des silences (ex: -2 = demi-soupir, -4 = soupir).
// Les objets { tuplet: { num, occupied }, items } représentent des N-olets (triolets, duolets).
const BEAT_PATTERNS = {
  4: {
    initiation: [[[4], 1]],
    debutant: [
      [[4], 3],
      [[2, 2], 2],
    ],
    intermediaire: [
      [[4], 2.2],
      [[2, 2], 2.8],
      [[3, 1], 1.2],
      [[-2, 2], 1.3],                                        // contretemps (demi-soupir + croche)
      [[-4], 0.45],                                          // soupir
      [{ tuplet: { num: 3, occupied: 2 }, items: [2, 2, 2] }, 1.1], // triolet de croches
    ],
    avance: [
      [[4], 1.6],
      [[2, 2], 2.0],
      [[1, 1, 1, 1], 1.3],
      [[2, 1, 1], 1.0],
      [[1, 1, 2], 1.0],
      [[3, 1], 1.0],
      [[1, 2, 1], 1.0],                                      // syncope interne au temps
      [[-2, 2], 1.2],                                        // contretemps
      [[-2, 1, 1], 0.8],                                     // contretemps + 2 doubles
      [[-4], 0.45],                                          // soupir
      [{ tuplet: { num: 3, occupied: 2 }, items: [2, 2, 2] }, 1.4],   // triolet de croches
      [{ tuplet: { num: 3, occupied: 2 }, items: [-2, 2, 2] }, 0.6],  // triolet avec silence
    ],
    expert: [
      [[4], 1.1],
      [[2, 2], 1.6],
      [[1, 1, 1, 1], 1.8],
      [[1, 1, 2], 1.1],
      [[2, 1, 1], 1.1],
      [[3, 1], 1.0],
      [[1, 2, 1], 1.3],                                      // syncope interne
      [[-2, 2], 1.2],                                        // contretemps
      [[-2, 1, 1], 0.9],
      [[-1, 1, 2], 0.7],                                     // quart de soupir + double + croche
      [[-4], 0.4],
      [{ tuplet: { num: 3, occupied: 2 }, items: [2, 2, 2] }, 1.6],   // triolet de croches
      [{ tuplet: { num: 3, occupied: 2 }, items: [-2, 2, 2] }, 0.7],  // triolet acéphale
      [{ tuplet: { num: 3, occupied: 2 }, items: [2, -2, 2] }, 0.5],  // triolet syncopé
    ],
  },
  6: {
    initiation: [[[6], 1]],
    debutant: [
      [[6], 2.5],
      [[4, 2], 2],
      [[2, 2, 2], 1.5],
    ],
    intermediaire: [
      [[6], 1.8],
      [[4, 2], 2.2],
      [[2, 2, 2], 2.2],
      [[2, 4], 1.0],
      [[-2, 2, 2], 1.0],                                     // contretemps ternaire
      [[2, -2, 2], 0.8],
      [[-6], 0.4],                                           // soupir pointé
      [{ tuplet: { num: 2, occupied: 3 }, items: [2, 2] }, 1.2], // duolet de croches
    ],
    avance: [
      [[4, 2], 1.8],
      [[2, 2, 2], 2.0],
      [[3, 1, 2], 1.4],
      [[6], 0.9],
      [[1, 1, 2, 2], 1.0],
      [[-2, 2, 2], 1.0],
      [[-2, 4], 0.8],
      [[2, -2, 2], 0.8],
      [[-6], 0.4],
      [{ tuplet: { num: 2, occupied: 3 }, items: [2, 2] }, 1.5], // duolet de croches
    ],
    expert: [
      [[2, 2, 2], 1.7],
      [[3, 1, 2], 1.7],
      [[1, 1, 1, 1, 2], 1.3],
      [[4, 2], 1.2],
      [[6], 0.8],
      [[-2, 2, 2], 1.0],
      [[-2, 4], 0.9],
      [[2, -2, 2], 0.9],
      [[-2, 1, 1, 2], 0.7],
      [[-6], 0.4],
      [{ tuplet: { num: 2, occupied: 3 }, items: [2, 2] }, 1.7], // duolet de croches
    ],
  },
  2: {
    initiation: [[[2], 1]],
    debutant: [[[2], 3], [[1, 1], 1]],
    intermediaire: [[[2], 1.8], [[1, 1], 1.8], [[-1, 1], 0.8]],
    avance: [[[2], 1.4], [[1, 1], 1.8], [[-1, 1], 1.0], [[-2], 0.35]],
    expert: [[[1, 1], 2.0], [[2], 1.0], [[-1, 1], 1.1], [[-2], 0.35]],
  },
  8: {
    initiation: [[[8], 1]],
    debutant: [
      [[8], 2],
      [[4, 4], 3],
    ],
    intermediaire: [
      [[8], 1.4],
      [[4, 4], 2.5],
      [[4, 2, 2], 1.5],
      [[2, 4, 2], 1.2],                                      // syncope
      [[-4, 4], 1.0],                                        // contretemps
      [[-2, 2, 4], 0.8],
      [{ tuplet: { num: 3, occupied: 2 }, items: [4, 4, 4] }, 1.0], // triolet de noires
    ],
    avance: [
      [[4, 4], 1.8],
      [[4, 2, 2], 1.8],
      [[2, 2, 4], 1.4],
      [[8], 0.8],
      [[2, 4, 2], 1.4],
      [[-4, 4], 1.0],
      [[-2, 2, 4], 1.0],
      [{ tuplet: { num: 3, occupied: 2 }, items: [4, 4, 4] }, 1.4], // triolet de noires
    ],
    expert: [
      [[4, 2, 2], 1.7],
      [[2, 2, 2, 2], 1.7],
      [[4, 4], 1.2],
      [[8], 0.8],
      [[2, 4, 2], 1.5],
      [[-4, 4], 1.0],
      [[-2, 2, 4], 1.0],
      [[2, 2, -2, 2], 0.8],
      [{ tuplet: { num: 3, occupied: 2 }, items: [4, 4, 4] }, 1.6], // triolet de noires
    ],
  },
};

// Motifs à cheval sur 2 temps (8 unités quand beatLen === 4) : syncopes, contretemps longs, triolets de noires
const MULTI_BEAT_PATTERNS_4 = {
  intermediaire: [
    [[2, 4, 2], 1.5],                                        // syncope croche - noire - croche
    [[-4, 4], 1.0],                                          // contretemps soupir - noire
    [[-2, 2, -2, 2], 0.8],                                   // suite de contretemps
  ],
  avance: [
    [[2, 4, 2], 1.6],
    [[-4, 4], 1.0],
    [[-2, 2, -2, 2], 1.0],
    [{ tuplet: { num: 3, occupied: 2 }, items: [4, 4, 4] }, 1.2], // triolet de noires sur 2 temps
  ],
  expert: [
    [[2, 4, 2], 1.6],
    [[-4, 4], 1.0],
    [[-2, 2, -2, 2], 1.2],
    [[2, 2, -2, 4 - 2], 0.7],
    [{ tuplet: { num: 3, occupied: 2 }, items: [4, 4, 4] }, 1.5], // triolet de noires sur 2 temps
  ],
};

function expandPattern(pattern, startPos, span, tupletId) {
  if (Array.isArray(pattern)) {
    const out = [];
    let p = startPos;
    for (const raw of pattern) {
      const dur = Math.abs(raw);
      out.push({ start: p, dur, rest: raw < 0 });
      p += dur;
    }
    return out;
  }
  const { tuplet, items } = pattern;
  const noteDur = span / items.length;
  return items.map((raw, idx) => ({
    start: startPos + idx * noteDur,
    dur: noteDur,
    notationDur: Math.abs(raw),
    tuplet: { id: tupletId, num: tuplet.num, occupied: tuplet.occupied },
    rest: raw < 0,
  }));
}

function genMeasureRhythm(rng, meter, level, isLast, m = 0) {
  const L = meter.measureLen;
  const B = meter.beatLen;
  const nBeats = L / B;

  // En dernière mesure : conclusion pianistique claire et stable (valeur longue tenue)
  if (isLast) {
    let p = 0;
    return decompose(L).map((d) => {
      const ev = { start: p, dur: d, rest: false };
      p += d;
      return ev;
    });
  }

  // En initiation : alternance de grandes valeurs tenues simples
  if (level === 'initiation') {
    if (L === 16 && rng.chance(0.4)) return [{ start: 0, dur: 16, rest: false }];
    if (L === 8 && rng.chance(0.5)) {
      return [{ start: 0, dur: 4, rest: false }, { start: 4, dur: 4, rest: false }];
    }
    if (L === 12 && meter.compound && rng.chance(0.5)) {
      return [{ start: 0, dur: 6, rest: false }, { start: 6, dur: 6, rest: false }];
    }
  }

  // En débutant : possibilité de blanche sur 4/4 ou blanche pointée sur 3/4
  if (level === 'debutant' && rng.chance(0.35)) {
    if (L === 16) {
      return rng.chance(0.5)
        ? [{ start: 0, dur: 8, rest: false }, { start: 8, dur: 4, rest: false }, { start: 12, dur: 4, rest: false }]
        : [{ start: 0, dur: 4, rest: false }, { start: 4, dur: 4, rest: false }, { start: 8, dur: 8, rest: false }];
    }
    if (L === 12 && !meter.compound) {
      return [{ start: 0, dur: 8, rest: false }, { start: 8, dur: 4, rest: false }];
    }
  }

  // Construction beat par beat (avec motifs multi-temps possibles dès le niveau intermédiaire)
  const patterns = BEAT_PATTERNS[B][level] || BEAT_PATTERNS[4][level];
  const multiPatterns = B === 4 ? MULTI_BEAT_PATTERNS_4[level] : null;
  const multiChance = level === 'expert' ? 0.35 : level === 'avance' ? 0.28 : 0.2;

  const evs = [];
  let pos = 0;
  let b = 0;
  while (b < nBeats) {
    const canMulti = multiPatterns && nBeats - b >= 2 && !(m === 0 && b === 0);
    if (canMulti && rng.chance(multiChance)) {
      const chosen = rng.weighted(multiPatterns);
      evs.push(...expandPattern(chosen, pos, 2 * B, `tp-${m}-${b}`));
      pos += 2 * B;
      b += 2;
      continue;
    }

    let pool = patterns;
    // Éviter de commencer la toute première mesure par un silence complet sur le 1er temps
    if (m === 0 && b === 0) {
      const filtered = patterns.filter(([p]) => !(Array.isArray(p) && p.length === 1 && p[0] < 0));
      if (filtered.length) pool = filtered;
    }

    const chosen = rng.weighted(pool);
    evs.push(...expandPattern(chosen, pos, B, `tp-${m}-${b}`));
    pos += B;
    b += 1;
  }

  // Garantir qu'aucune mesure ne soit intégralement silencieuse
  if (evs.every((e) => e.rest)) {
    evs[0].rest = false;
  }

  return evs;
}

// ── Progression harmonique pianistique ───────────────────────

const ALLOWED_DEGREES = {
  initiation: [0, 3, 4],       // I, IV, V
  debutant: [0, 1, 3, 4, 5],   // I, ii, IV, V, vi
  intermediaire: [0, 1, 3, 4, 5],
  avance: [0, 1, 2, 3, 4, 5],
  expert: [0, 1, 2, 3, 4, 5],
};

function planHarmony(rng, meter, level, n, mode, enrichActive, extensionType, minD, key) {
  const L = meter.measureLen;
  const slots = [];
  for (let m = 0; m < n; m++) {
    const splittable = m < n - 1 && level !== 'initiation' && level !== 'debutant' && meter.beats === 4;
    if (splittable && rng.chance(level === 'expert' ? 0.5 : level === 'avance' ? 0.35 : 0.2)) {
      slots.push({ m, start: 0, len: L / 2 }, { m, start: L / 2, len: L / 2 });
    } else {
      slots.push({ m, start: 0, len: L });
    }
  }

  const allowed = ALLOWED_DEGREES[level].filter((d) => !(mode === 'minor' && d === 2));
  const minDegree = degreeOf(minD, key);

  // Construction d'une phrase harmonique fluide et cadentielle
  slots.forEach((s, i) => {
    if (i === 0) {
      s.degree = 0; // Affirmation de la tonique au début
    } else if (i === slots.length - 1) {
      s.degree = 0; // Résolution conclusive sur la tonique à la fin
    } else if (i === slots.length - 2) {
      s.degree = 4; // Cadence V → I
    } else if (i === slots.length - 3 && slots.length >= 4) {
      // Pré-dominante naturelle avant la cadence finale (ii ou IV)
      const preDom = [1, 3].filter((d) => allowed.includes(d) && d !== slots[i - 1]?.degree);
      s.degree = preDom.length ? rng.pick(preDom) : (allowed.includes(3) ? 3 : 4);
    } else {
      // Choix harmonique fluide évitant les répétitions statiques
      const prev = slots[i - 1].degree;
      let weightedCands;
      if (prev === 0) weightedCands = [[3, 3], [5, 3], [1, 2], [4, 2], [2, 1]];
      else if (prev === 1) weightedCands = [[4, 4], [2, 1], [5, 1]];
      else if (prev === 2) weightedCands = [[5, 3], [3, 3], [1, 1]];
      else if (prev === 3) weightedCands = [[4, 3], [1, 2.5], [0, 2], [5, 1]];
      else if (prev === 4) weightedCands = [[0, 3.5], [5, 2.5], [3, 1.5]];
      else if (prev === 5) weightedCands = [[1, 3], [3, 3], [4, 2], [2, 1]];
      else weightedCands = allowed.map((d) => [d, 1]);

      const filtered = weightedCands.filter(([d]) => allowed.includes(d) && d !== prev);
      s.degree = filtered.length ? rng.weighted(filtered) : 0;
    }

    s.seventh = false;
    s.ninth = false;
    s.sus4 = false;
    s.add9 = false;

    if (enrichActive && extensionType === 'seventh') {
      if (s.degree === 4) s.seventh = rng.chance(0.85); // V7
      else if ([0, 1, 3, 5].includes(s.degree) && rng.chance(0.4)) s.seventh = true;
    } else if (enrichActive && extensionType === 'extended') {
      if (s.degree === 4) {
        s.seventh = true;
        if (rng.chance(0.7)) s.ninth = true; // V9
        else if (rng.chance(0.3)) s.sus4 = true;
      } else if ([0, 1, 3, 5].includes(s.degree)) {
        s.seventh = rng.chance(0.8);
        if (s.seventh && rng.chance(0.6)) s.ninth = true; // Imaj9, ii9
        else if (rng.chance(0.35)) s.add9 = true;
      }
    }
  });

  // Demi-cadence au milieu des pièces structurées (>= 4 mesures)
  if (n >= 4 && slots.length >= 4) {
    const midIdx = slots.findLastIndex((s) => s.m === Math.floor(n / 2) - 1);
    if (midIdx > 0 && midIdx < slots.length - 2) {
      slots[midIdx].degree = 4; // Suspension sur la dominante
      if (enrichActive && extensionType !== 'none') slots[midIdx].seventh = true;
    }
  }

  // Intégration naturelle du degré de minD pour que la basse s'y ancre organiquement
  if (n >= 3 && minDegree !== 0 && allowed.includes(minDegree)) {
    const hasMinDegree = slots.some((s) => s.degree === minDegree);
    if (!hasMinDegree) {
      const candidateSlotIdx = Math.max(1, Math.min(slots.length - 3, Math.floor(slots.length * 0.35)));
      slots[candidateSlotIdx].degree = minDegree;
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

// ── Mélodie pianistique chantante (Main Droite) ───────────────

const INTERVAL_WEIGHTS = {
  initiation: [0.6, 8, 1.2, 0.1, 0, 0, 0, 0],
  debutant: [0.4, 6, 2.5, 0.8, 0.3, 0, 0, 0],
  intermediaire: [0.5, 5.5, 2.8, 1.2, 0.8, 0.3, 0, 0.2],
  avance: [0.4, 4.5, 3, 1.5, 1, 0.6, 0.3, 0.4],
  expert: [0.3, 4, 3, 1.8, 1.2, 0.8, 0.4, 0.5],
};

function melodyRange(key, level, clef, minD, maxD, hands) {
  if (hands === 'right' || hands === 'left') {
    return { lo: minD, hi: maxD };
  }
  const span = maxD - minD;
  if (span <= 7) {
    const split = Math.round(minD + span * 0.45);
    return clef === 'treble'
      ? { lo: Math.max(minD, split), hi: maxD }
      : { lo: minD, hi: Math.min(maxD, split + 1) };
  }
  // Séparation équilibrée des mains laissant le grave à la main gauche et le chant à la main droite
  const pivot = Math.max(minD + 4, Math.min(maxD - 5, Math.round(minD + span * 0.45)));
  if (clef === 'treble') {
    return { lo: Math.max(minD, pivot - 1), hi: maxD };
  } else {
    return { lo: minD, hi: Math.min(maxD, pivot + 1) };
  }
}

function genMelody(rng, ctx, rhythms, clef, hand) {
  const { key, scale, meter, slots, level, n, minD, maxD, hands } = ctx;
  const { lo, hi } = melodyRange(key, level, clef, minD, maxD, hands);
  const IW = INTERVAL_WEIGHTS[level];

  const range = [];
  for (let D = lo; D <= hi; D++) range.push(D);
  if (!range.length) {
    for (let D = minD; D <= maxD; D++) range.push(D);
  }

  const midD = (lo + hi) / 2;
  const inRangeTonics = range.filter((x) => degreeOf(x, key) === 0);
  const referenceTonicD = inRangeTonics.length
    ? inRangeTonics.reduce((best, t) => (Math.abs(t - midD) < Math.abs(best - midD) ? t : best), inRangeTonics[0])
    : Math.round(midD);

  const pitched = [];
  rhythms.forEach((rhythm, m) => rhythm.forEach((ev) => { if (!ev.rest) pitched.push({ m, ev }); }));
  const N = pitched.length;

  const nearest = (cands, target) =>
    cands.reduce((best, D) => (Math.abs(D - target) < Math.abs(best - target) ? D : best), cands[0]);

  // Point culminant expressif (climax) atteignant maxD
  const targetClimaxIdx = (hand === 'right' || hands === 'left')
    ? (N >= 4 ? Math.max(1, Math.min(N - 2, Math.floor(N * 0.65))) : (N > 1 ? 0 : 0))
    : -1;
  // Creux mélodique atteignant minD si la main droite joue seule
  const targetMinIdx = (hands === 'right' && N >= 4) ? Math.max(1, Math.floor(N * 0.25)) : -1;

  let prev = null;
  let prev2 = null;
  let lastInt = 0;
  let dir = rng.chance(0.5) ? 1 : -1;
  const themeIntervals = [];
  const halfMeasure = n >= 4 ? Math.floor(n / 2) - 1 : -1;

  pitched.forEach(({ m, ev }, i) => {
    const chord = chordAt(slots, m, ev.start);
    const cdegs = chordDegrees(chord);
    const isCT = (D) => cdegs.includes(degreeOf(D, key));
    let D;

    if (i === N - 1) {
      // Fin sur la tonique dans l'ambitus
      const tonics = range.filter((x) => degreeOf(x, key) === 0);
      D = tonics.length ? nearest(tonics, prev ?? referenceTonicD) : (range[0] ?? minD);
    } else if (i === targetClimaxIdx && (hand === 'right' || hands === 'left')) {
      // Sommet mélodique : atteint maxD
      D = maxD;
    } else if (i === targetMinIdx && hands === 'right') {
      // Creux mélodique : atteint minD
      D = minD;
    } else if (i === 0) {
      // Début sur un degré stable (tonique ou quinte)
      const cands = range.filter(isCT);
      D = cands.length
        ? rng.weighted(cands.map((x) => [x, (degreeOf(x, key) === 0 ? 3 : 1) / (1 + Math.abs(x - referenceTonicD))]))
        : referenceTonicD;
    } else if (i === N - 2) {
      // Sensible ou 2e degré pour résoudre par mouvement conjoint
      const finalTonics = range.filter((x) => degreeOf(x, key) === 0);
      const targetTonic = finalTonics.length ? nearest(finalTonics, prev ?? referenceTonicD) : referenceTonicD;
      const cands = range.filter((x) => {
        const deg = degreeOf(x, key);
        return (deg === 1 || deg === 6) && Math.abs(x - targetTonic) === 1;
      });
      const weighted = cands.map((x) => [x, IW[Math.abs(x - prev)] ?? 1]);
      D = weighted.some(([, w]) => w > 0) ? rng.weighted(weighted) : nearest(cands.length ? cands : range, prev);
    } else {
      const strong = ev.start % meter.beatLen === 0;
      const progress = i / N;
      const prevDeg = degreeOf(prev, key);
      const isHalfCadenceEnd = m === halfMeasure && pitched[i + 1]?.m > halfMeasure;
      const motifIdx = (n >= 6 && m === Math.floor(n / 2)) ? i - pitched.findIndex((p) => p.m === Math.floor(n / 2)) : -1;
      const expectedMotifInt = motifIdx > 0 && motifIdx <= themeIntervals.length ? themeIntervals[motifIdx - 1] : null;

      const weights = [];
      for (const x of range) {
        const iv = Math.abs(x - prev);
        let w = IW[iv] ?? 0;
        if (!w) continue;
        if (iv === 0 && prev === prev2) continue; // Pas 3 fois la même note
        const ct = isCT(x);
        const xDeg = degreeOf(x, key);
        w *= strong ? (ct ? 1.3 : 0.1) : ct ? 1 : 0.85;
        if ((x - prev) * dir > 0) w *= 1.8;

        // Éviter les sauts de triton (degré 3 <-> degré 6) et les sauts de 7e durs
        if (iv >= 3 && ((prevDeg === 3 && xDeg === 6) || (prevDeg === 6 && xDeg === 3))) w *= 0.15;
        if (iv === 6) w *= 0.25;

        // Rappel motivique en début de 2e phrase (A')
        if (expectedMotifInt != null && x - prev === expectedMotifInt) w *= 2.0;

        // Respiration sur la demi-cadence (note stable de V)
        if (isHalfCadenceEnd && ct) w *= 2.5;

        // Résolution de saut en sens contraire
        if (Math.abs(lastInt) >= 3) {
          if (iv >= 1 && iv <= 2 && Math.sign(x - prev) === -Math.sign(lastInt)) w *= 3.5;
          if (iv >= 3) w *= 0.2;
        }
        // Préparation et montée progressive vers le climax
        if (targetClimaxIdx > 0 && i < targetClimaxIdx && targetClimaxIdx - i <= 4) {
          if (Math.abs(maxD - x) < Math.abs(maxD - prev)) w *= 2.6;
        }
        if (progress >= 0.45 && progress <= 0.75) {
          if (x > midD) w *= 1.4;
        } else if (progress > 0.75) {
          if (Math.abs(x - referenceTonicD) < Math.abs(prev - referenceTonicD)) w *= 1.3;
        }
        weights.push([x, w]);
      }
      D = weights.length ? rng.weighted(weights) : nearest(range.filter(isCT), prev);
    }

    lastInt = prev == null ? 0 : D - prev;
    if (i >= 1 && i <= 4) themeIntervals.push(lastInt);
    prev2 = prev;
    prev = D;
    if (i === targetClimaxIdx) dir = -1;
    else if (i === targetMinIdx) dir = 1;
    else if (D >= hi - 1) dir = -1;
    else if (D <= lo + 1) dir = 1;
    else if (rng.chance(0.25)) dir = -dir;
    ev.D = D;
  });

  // Altérations mélodiques
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

  // Événements et harmonisation main droite (accords sous le chant)
  const events = rhythms.map(() => []);
  const isEnrichedRight = ctx.enrichRight && hand === 'right';

  rhythms.forEach((rhythm, m) => {
    rhythm.forEach((ev, i) => {
      const out = {
        id: `${hand}-${m}-${i}`,
        hand,
        start: ev.start,
        dur: ev.dur,
        ...(ev.notationDur != null ? { notationDur: ev.notationDur } : {}),
        ...(ev.tuplet ? { tuplet: ev.tuplet } : {}),
        rest: !!ev.rest,
        notes: [],
      };
      if (!ev.rest) {
        const idx = pitched.findIndex((p) => p.ev === ev);
        const alter = alterOf[idx];
        out.notes.push({ D: ev.D, alter, midi: toMidi(ev.D, alter) });

        // Appoggiature expressive (dès le niveau intermédiaire, sur notes longues / temps forts)
        const appProb = level === 'expert' ? 0.28 : level === 'avance' ? 0.22 : level === 'intermediaire' ? 0.14 : 0;
        const canApp = appProb > 0 && idx > 0 && m < n - 1 && ev.dur >= 4 && !ev.tuplet
          && (ev.start % meter.beatLen === 0 || ev.dur >= 6);
        if (canApp && rng.chance(appProb)) {
          const preferUpper = rng.chance(0.65);
          let appD = preferUpper ? ev.D + 1 : ev.D - 1;
          if (appD > maxD) appD = ev.D - 1;
          if (appD < minD) appD = ev.D + 1;
          if (appD >= minD && appD <= maxD && appD !== ev.D) {
            const appDeg = degreeOf(appD, key);
            const appAlter = appD < ev.D ? scale.melodyUp[appDeg] : scale.harmony[appDeg];
            out.appoggiatura = { D: appD, alter: appAlter, midi: toMidi(appD, appAlter) };
          }
        }

        if (isEnrichedRight) {
          const isLastNote = (m === n - 1 && i === rhythm.length - 1);
          const isStrongBeat = (ev.dur >= 4 || ev.start === 0 || ev.start % meter.beatLen === 0);
          const prob = level === 'expert' ? 0.75 : level === 'avance' ? 0.6 : 0.4;
          const shouldAdd = isLastNote || (isStrongBeat && rng.chance(prob));

          if (shouldAdd) {
            const chord = chordAt(slots, m, ev.start);
            const degs = chordDegrees(chord);
            const candidates = [];

            // Recherche de notes d'harmonie sous la mélodie
            // Écartement strict de la main droite : maximum 7 à 8 degrés (une octave) pour être 100% jouable d'une seule main
            for (const deg of degs) {
              const letter = (key.tonicLetter + deg) % 7;
              for (let oct = octaveOf(ev.D); oct >= 1; oct--) {
                const candD = oct * 7 + letter;
                const interval = ev.D - candD;
                // Entre une tierce (2) et une octave (7) sous le soprano
                if (candD >= minD && candD <= maxD && interval >= 2 && interval <= 7 && !candidates.includes(candD)) {
                  candidates.push(candD);
                }
              }
            }
            candidates.sort((a, b) => b - a); // Du plus proche au plus bas

            const maxNotesToAdd = isLastNote
              ? (level === 'expert' ? 2 : level === 'avance' ? 2 : 1)
              : (level === 'expert' ? 2 : 1);
            const toAdd = candidates.slice(0, maxNotesToAdd);

            for (const cD of toAdd) {
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

// ── Accompagnement pianistique (Main Gauche) ──────────────────

function genAccompaniment(rng, ctx) {
  const { key, scale, meter, slots, level, n, enrichLeft, extensionType, minD, maxD } = ctx;
  const B = meter.beatLen;
  const letterOfDeg = (deg) => (key.tonicLetter + deg) % 7;
  const minLetter = letterOf(minD);

  const fitD = (D) => {
    let res = D;
    while (res < minD && res + 7 <= maxD) res += 7;
    while (res > maxD && res - 7 >= minD) res -= 7;
    return Math.max(minD, Math.min(maxD, res));
  };

  // Identification du slot harmonique idéal pour poser minD
  let minSlotIdx = slots.findIndex((s) => letterOfDeg(s.degree) === minLetter);
  if (minSlotIdx === -1) minSlotIdx = 0;

  const perMeasure = Array.from({ length: n }, () => []);
  let prevBaseD = null;
  let prevUpperCenter = null;

  const closestOctave = (letter, target, loBound, hiBound) => {
    const cands = [];
    for (let oct = 0; oct <= 8; oct++) {
      const cand = oct * 7 + letter;
      if (cand >= loBound && cand <= hiBound) cands.push(cand);
    }
    if (!cands.length) return fitD(lowestDWithLetter(letter, target));
    return cands.reduce((best, c) => (Math.abs(c - target) < Math.abs(best - target) ? c : best), cands[0]);
  };

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
    const slot = slots[slotIdx];
    const span = maxD - minD;
    const pivot = Math.max(minD + 4, Math.min(maxD - 5, Math.round(minD + span * 0.45)));
    const baseTarget = Math.max(minD, Math.min(pivot - 5, 16));

    // Si c'est le slot dédié ou que le degré a la même lettre que minD : basse ancrée sur minD
    const isMinSlot = (slotIdx === minSlotIdx || letterOfDeg(slot.degree) === minLetter);
    const r = isMinSlot
      ? minD
      : closestOctave(letterOfDeg(slot.degree), prevBaseD ?? baseTarget, minD, Math.max(minD, Math.min(pivot - 2, baseTarget + 5)));
    prevBaseD = r;

    const degs = chordDegrees(slot);
    const upperDegs = slot.seventh || slot.ninth ? degs.slice(1) : degs;
    const upperTarget = Math.max(minD + 2, Math.min(pivot, 21));
    const voiceTarget = prevUpperCenter ?? upperTarget;

    // Voicings médium avec conduite des voix (voice leading) et écart <= 7 degrés
    let upper = upperDegs
      .map((d) => closestOctave(letterOfDeg(d), voiceTarget, Math.max(minD, r + 1), Math.min(maxD, pivot + 2)))
      .sort((a, b) => a - b);
    if (upper.length > 1 && upper.at(-1) - upper[0] > 7) {
      upper = upperDegs.map((d) => fitD(lowestDWithLetter(letterOfDeg(d), upperTarget))).sort((a, b) => a - b);
    }
    if (upper.length) {
      prevUpperCenter = upper.reduce((s, d) => s + d, 0) / upper.length;
    }
    const ninthD = fitD(lowestDWithLetter(letterOfDeg((slot.degree + 1) % 7), voiceTarget));
    const seventhD = fitD(lowestDWithLetter(letterOfDeg((slot.degree + 6) % 7), voiceTarget));

    const evs = [];
    const add = (pos, dur, Ds, rest = false, extra = {}) => {
      if (rest) {
        evs.push({ start: slot.start + pos, dur, Ds: [], rest: true, ...extra });
        return;
      }
      let filtered = [...new Set(Ds.map(fitD))].sort((a, b) => a - b);
      // Règle anatomique : une main ne peut pas plaquer plus d'une octave (<= 8 degrés)
      if (filtered.length > 1 && filtered.at(-1) - filtered[0] > 8) {
        filtered = [filtered[0]];
      }
      evs.push({ start: slot.start + pos, dur, Ds: filtered, rest: false, ...extra });
    };
    const addTuplet = (pos, span, num, occupied, notationDur, items, tag) => {
      const noteDur = span / items.length;
      const tuplet = { id: `lh-${slot.m}-${slotIdx}-${tag}`, num, occupied };
      items.forEach((item, idx) => {
        add(pos + idx * noteDur, noteDur, item.Ds || [], !!item.rest, { notationDur, tuplet });
      });
    };
    const fill = (Ds) => {
      let p = 0;
      for (const d of decompose(slot.len)) {
        add(p, d, Ds);
        p += d;
      }
    };

    // Dernier accord de la pièce : résolution finale pleine et stable
    if (slot.m === n - 1) {
      if (level === 'initiation' || level === 'debutant') {
        fill([r]);
      } else {
        // Quinte ouverte noble et résonante (écart = 4 degrés, ultra-jouable)
        fill([r, r + 4]);
      }
    } else if (meter.num === 3 && meter.den === 4) {
      // ── Style Valse classique (3/4) ──────────────────────────
      if (level === 'initiation' || level === 'debutant') {
        if (level === 'initiation') fill([r]);
        else {
          add(0, 4, [r]);
          add(4, 4, upper);
          add(8, 4, upper);
        }
      } else if (level === 'intermediaire') {
        if (rng.chance(0.3)) {
          // Valse avec contretemps (demi-soupir + accord) sur le 2e temps
          add(0, 4, [r]);
          add(4, 2, [], true);
          add(6, 2, upper);
          add(8, 4, upper);
        } else {
          add(0, 4, [r]);
          add(4, 4, upper);
          add(8, 4, upper);
        }
      } else {
        // Avancé / Virtuose : valse syncopée, contretemps ou triolet d'arpège
        const roll = rng.next();
        if (roll < 0.35) {
          add(0, 4, [r]);
          add(4, 2, [], true);
          add(6, 2, upper);
          add(8, 2, [], true);
          add(10, 2, upper);
        } else if (roll < 0.65) {
          add(0, 4, [r]);
          addTuplet(4, 4, 3, 2, 2, [
            { Ds: [r + 4] },
            { Ds: [upper[0] ?? (r + 2)] },
            { Ds: [upper[upper.length - 1] ?? (r + 4)] },
          ], 'w3');
          add(8, 4, upper);
        } else {
          add(0, 4, [r]);
          add(4, 4, upper);
          add(8, 4, upper);
        }
      }
    } else if (meter.num === 3 && meter.den === 8) {
      // ── Style Trois Croches (3/8) ───────────────────────────
      if (level === 'initiation' || level === 'debutant') {
        fill([r]);
      } else if (level !== 'intermediaire' && rng.chance(0.35)) {
        add(0, 2, [r]);
        add(2, 2, [], true);
        add(4, 2, upper);
      } else if (level === 'intermediaire' && rng.chance(0.25)) {
        add(0, 2, [r]);
        add(2, 2, [], true);
        add(4, 2, upper);
      } else {
        add(0, 2, [r]);
        add(2, 2, upper);
        add(4, 2, upper);
      }
    } else if (meter.compound && meter.beatLen === 6) {
      // ── Style Barcarolle / Berceuse (6/8, 12/8) ─────────────
      if (level === 'initiation' || level === 'debutant') {
        const nBeats = Math.floor(slot.len / 6);
        for (let b = 0; b < nBeats; b++) {
          add(b * 6, 6, [b === 0 ? r : (b % 2 === 0 ? r : r + 4)]);
        }
      } else {
        const nBeats = Math.floor(slot.len / 6);
        const dupletChance = level === 'intermediaire' ? 0.22 : 0.28;
        const offbeatChance = level === 'intermediaire' ? 0.18 : 0.28;
        for (let b = 0; b < nBeats; b++) {
          const roll = rng.next();
          if (roll < dupletChance) {
            // Duolet de croches en main gauche (2 croches pour 3)
            addTuplet(b * 6, 6, 2, 3, 2, [
              { Ds: [b === 0 ? r : (r + 4)] },
              { Ds: upper },
            ], `d-${b}`);
          } else if (roll < dupletChance + offbeatChance) {
            // Contretemps ternaire avec silence
            add(b * 6, 2, [b === 0 ? r : (r + 4)]);
            add(b * 6 + 2, 2, [], true);
            add(b * 6 + 4, 2, upper);
          } else {
            // Arpège fluide balancé par temps de 6
            add(b * 6, 2, [r]);
            add(b * 6 + 2, 2, [upper[0] ?? (r + 4)]);
            add(b * 6 + 4, 2, [upper[1] ?? (r + 7)]);
          }
        }
      }
    } else {
      // ── Style Classique / Pop (4/4, 2/4, 2/2, 5/4) ───────────
      if (level === 'initiation') {
        fill([r]);
      } else if (level === 'debutant') {
        if (rng.chance(0.5) || slot.len <= 8) {
          fill([r, r + 4]);
        } else {
          const nBeats = Math.floor(slot.len / 4);
          for (let b = 0; b < nBeats; b++) add(b * 4, 4, [r]);
        }
      } else if (level === 'intermediaire') {
        const roll = rng.next();
        if (slot.len === 16 && roll < 0.45) {
          // Basse d'Alberti classique
          const albSeq = [r, upper[upper.length - 1] ?? (r + 4), upper[0] ?? (r + 2), upper[upper.length - 1] ?? (r + 4)];
          for (let p = 0, k = 0; p < slot.len; p += 2, k++) {
            add(p, 2, [albSeq[k % albSeq.length]]);
          }
        } else if (slot.len >= 8 && slot.len % 4 === 0 && roll < 0.65) {
          // Contretemps avec demi-soupirs (basse sur le 1er temps, accords sur les contretemps)
          add(0, 4, [r]);
          const nBeats = Math.floor(slot.len / 4);
          for (let b = 1; b < nBeats; b++) {
            add(b * 4, 2, [], true);
            add(b * 4 + 2, 2, upper);
          }
        } else if (slot.len >= 8 && slot.len % 4 === 0 && roll < 0.8) {
          // Basse puis triolet d'arpège
          add(0, 4, [r]);
          const nBeats = Math.floor(slot.len / 4);
          for (let b = 1; b < nBeats; b++) {
            if (b % 2 === 1) {
              addTuplet(b * 4, 4, 3, 2, 2, [
                { Ds: [r + 4] },
                { Ds: [upper[0] ?? (r + 2)] },
                { Ds: [upper[upper.length - 1] ?? (r + 4)] },
              ], `t-${b}`);
            } else {
              add(b * 4, 4, [r]);
            }
          }
        } else {
          // Stride : Temps 1 basse, temps 2 accord
          const nBeats = Math.floor(slot.len / 4);
          for (let b = 0; b < nBeats; b++) {
            if (b % 2 === 0) add(b * 4, 4, [r]);
            else add(b * 4, 4, upper);
          }
        }
      } else {
        // Niveaux Avancé et Virtuose
        const roll = rng.next();
        if (slot.len >= 8 && roll < 0.3) {
          const arp = [r, r + 4, upper[0] ?? seventhD, upper[1] ?? ninthD];
          for (let p = 0, k = 0; p < slot.len; p += 2, k++) {
            add(p, 2, [arp[k % arp.length]]);
          }
        } else if (slot.len >= 8 && slot.len % 4 === 0 && roll < 0.55) {
          // Accompagnement en contretemps (basse sur le 1er temps, accords sur les contretemps)
          add(0, 4, [r]);
          const nBeats = Math.floor(slot.len / 4);
          for (let b = 1; b < nBeats; b++) {
            add(b * 4, 2, [], true);
            add(b * 4 + 2, 2, upper);
          }
        } else if (slot.len >= 8 && slot.len % 8 === 0 && roll < 0.78) {
          // Syncope pianistique sur 2 temps : [2, 4, 2]
          const nPairs = Math.floor(slot.len / 8);
          for (let k = 0; k < nPairs; k++) {
            add(k * 8, 2, [r]);
            add(k * 8 + 2, 4, upper);
            add(k * 8 + 6, 2, [r + 4]);
          }
        } else if (slot.len >= 8 && slot.len % 4 === 0 && roll < 0.92) {
          // Arpèges en triolets de croches (avec silence occasionnel en virtuose)
          const nBeats = Math.floor(slot.len / 4);
          for (let b = 0; b < nBeats; b++) {
            if (b === 0) {
              addTuplet(0, 4, 3, 2, 2, [
                { Ds: [r] },
                { Ds: [r + 4] },
                { Ds: [upper[0] ?? seventhD] },
              ], `t-${b}`);
            } else if (level === 'expert' && rng.chance(0.35)) {
              addTuplet(b * 4, 4, 3, 2, 2, [
                { Ds: [], rest: true },
                { Ds: upper },
                { Ds: [upper[1] ?? ninthD] },
              ], `t-${b}`);
            } else {
              addTuplet(b * 4, 4, 3, 2, 2, [
                { Ds: [r + 4] },
                { Ds: [upper[0] ?? (r + 2)] },
                { Ds: [upper[1] ?? ninthD] },
              ], `t-${b}`);
            }
          }
        } else {
          const nBeats = Math.floor(slot.len / 4);
          for (let b = 0; b < nBeats; b++) {
            if (b === 0) add(0, 4, [r]);
            else add(b * 4, 4, upper);
          }
        }
      }
    }

    perMeasure[slot.m].push(...evs);
  }

  return perMeasure.map((evs, m) =>
    evs
      .sort((a, b) => a.start - b.start)
      .map((ev, i) => {
        if (ev.rest) {
          return {
            id: `left-${m}-${i}`,
            hand: 'left',
            start: ev.start,
            dur: ev.dur,
            ...(ev.notationDur != null ? { notationDur: ev.notationDur } : {}),
            ...(ev.tuplet ? { tuplet: ev.tuplet } : {}),
            rest: true,
            notes: [],
          };
        }
        const Ds = [...new Set(ev.Ds)].sort((a, b) => a - b);
        return {
          id: `left-${m}-${i}`,
          hand: 'left',
          start: ev.start,
          dur: ev.dur,
          ...(ev.notationDur != null ? { notationDur: ev.notationDur } : {}),
          ...(ev.tuplet ? { tuplet: ev.tuplet } : {}),
          rest: false,
          notes: Ds.map((D) => {
            const alter = scale.harmony[degreeOf(D, key)] ?? 0;
            return { D, alter, midi: toMidi(D, alter) };
          }),
        };
      })
  );
}

// ── Point d'entrée principal ────────────────────────────────

export function generateScore(settings, seed) {
  const rng = createRng(seed);
  const params = resolveParams(settings, rng);
  const key = getKey(params.key);
  const scale = buildScale(key, params.minorType);
  const meter = meterInfo(params.timeSignature);
  const n = params.measures;

  // Planification harmonique structurée
  const slots = planHarmony(rng, meter, params.level, n, key.mode, params.enrichRight || params.enrichLeft, params.extensionType, params.minD, key);

  const ctx = {
    key,
    scale,
    meter,
    slots,
    level: params.level,
    n,
    hands: params.hands,
    minD: params.minD,
    maxD: params.maxD,
    enrichRight: params.enrichRight,
    enrichLeft: params.enrichLeft,
    extensionType: params.extensionType,
  };

  const halfIdx = n >= 6 ? Math.floor(n / 2) : -1;
  const rhythms = [];
  for (let m = 0; m < n; m++) {
    if (m === halfIdx && m < n - 1 && rng.chance(0.45)) {
      // Rappel rythmique du motif initial en début de 2e phrase (A')
      rhythms.push(
        rhythms[0].map((ev, idx) => ({
          ...ev,
          ...(ev.tuplet ? { tuplet: { ...ev.tuplet, id: `tp-${m}-r${idx}` } } : {}),
        }))
      );
    } else {
      rhythms.push(genMeasureRhythm(rng, meter, params.level, m === n - 1, m));
    }
  }

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

  // 1. Contrôle et garantie stricte de l'ambitus [minD, maxD]
  measures.forEach((ms) => {
    for (const staff of [ms.treble, ms.bass]) {
      if (!staff) continue;
      for (const ev of staff) {
        if (ev.rest) continue;
        for (const note of ev.notes) {
          if (note.D < params.minD || note.D > params.maxD) {
            let res = note.D;
            while (res < params.minD && res + 7 <= params.maxD) res += 7;
            while (res > params.maxD && res - 7 >= params.minD) res -= 7;
            note.D = Math.max(params.minD, Math.min(params.maxD, res));
            const alter = scale.harmony[degreeOf(note.D, key)] ?? 0;
            note.alter = alter;
            note.midi = toMidi(note.D, alter);
          }
        }
        ev.notes.sort((a, b) => a.D - b.D);
        if (ev.appoggiatura && (ev.appoggiatura.D < params.minD || ev.appoggiatura.D > params.maxD)) {
          delete ev.appoggiatura;
        }
      }
    }
  });

  // 2. Garantie absolue de présence de minD en main gauche et maxD en main droite
  if (treble) {
    const hasMax = measures.some((m) => m.treble && m.treble.some((e) => !e.rest && e.notes.some((n) => n.D === params.maxD)));
    if (!hasMax) {
      const allPitched = [];
      measures.forEach((m) => {
        if (m.treble) m.treble.forEach((e) => { if (!e.rest && e.notes.length) allPitched.push(e); });
      });
      if (allPitched.length) {
        const targetEv = allPitched.reduce((best, e) => (e.notes.at(-1).D > best.notes.at(-1).D ? e : best), allPitched[0]);
        const alter = scale.harmony[degreeOf(params.maxD, key)] ?? 0;
        targetEv.notes[targetEv.notes.length - 1] = { D: params.maxD, alter, midi: toMidi(params.maxD, alter) };
        targetEv.notes.sort((a, b) => a.D - b.D);
      }
    }
    if (params.hands === 'right') {
      const hasMin = measures.some((m) => m.treble && m.treble.some((e) => !e.rest && e.notes.some((n) => n.D === params.minD)));
      if (!hasMin) {
        const allPitched = [];
        measures.forEach((m) => {
          if (m.treble) m.treble.forEach((e) => { if (!e.rest && e.notes.length) allPitched.push(e); });
        });
        if (allPitched.length) {
          const targetEv = allPitched.reduce((best, e) => (e.notes[0].D < best.notes[0].D ? e : best), allPitched[0]);
          const alter = scale.harmony[degreeOf(params.minD, key)] ?? 0;
          targetEv.notes[0] = { D: params.minD, alter, midi: toMidi(params.minD, alter) };
          targetEv.notes.sort((a, b) => a.D - b.D);
        }
      }
    }
  }

  if (bass) {
    const hasMin = measures.some((m) => m.bass && m.bass.some((e) => !e.rest && e.notes.some((n) => n.D === params.minD)));
    if (!hasMin) {
      const allPitched = [];
      measures.forEach((m) => {
        if (m.bass) m.bass.forEach((e) => { if (!e.rest && e.notes.length) allPitched.push(e); });
      });
      if (allPitched.length) {
        const targetEv = allPitched.reduce((best, e) => (e.notes[0].D < best.notes[0].D ? e : best), allPitched[0]);
        const alter = scale.harmony[degreeOf(params.minD, key)] ?? 0;
        targetEv.notes[0] = { D: params.minD, alter, midi: toMidi(params.minD, alter) };
        targetEv.notes.sort((a, b) => a.D - b.D);
      }
    }
    if (params.hands === 'left') {
      const hasMax = measures.some((m) => m.bass && m.bass.some((e) => !e.rest && e.notes.some((n) => n.D === params.maxD)));
      if (!hasMax) {
        const allPitched = [];
        measures.forEach((m) => {
          if (m.bass) m.bass.forEach((e) => { if (!e.rest && e.notes.length) allPitched.push(e); });
        });
        if (allPitched.length) {
          const targetEv = allPitched.reduce((best, e) => (e.notes.at(-1).D > best.notes.at(-1).D ? e : best), allPitched[0]);
          const alter = scale.harmony[degreeOf(params.maxD, key)] ?? 0;
          targetEv.notes[targetEv.notes.length - 1] = { D: params.maxD, alter, midi: toMidi(params.maxD, alter) };
          targetEv.notes.sort((a, b) => a.D - b.D);
        }
      }
    }
  }

  // 3. Contrôle de complétude de chaque mesure
  measures.forEach((ms) => {
    for (const staff of [ms.treble, ms.bass]) {
      if (!staff) continue;
      const total = staff.reduce((s, e) => s + e.dur, 0);
      if (Math.abs(total - meter.measureLen) > 1e-6) console.warn(`Mesure ${ms.index + 1} incomplète : ${total}/${meter.measureLen}`);
    }
  });

  return { seed, params, key, scale, meter, slots, measures, totalUnits: n * meter.measureLen };
}
