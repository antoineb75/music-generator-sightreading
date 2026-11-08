// ─────────────────────────────────────────────────────────────
//  Théorie musicale : tonalités, gammes, hauteurs, noms français
// ─────────────────────────────────────────────────────────────
//
// Une hauteur est représentée par un « degré diatonique absolu » D
// (D = octave * 7 + indice de lettre, C = 0) et une altération
// (-2 … +2). Cette représentation facilite le calcul des mouvements
// conjoints / disjoints et l'affichage sur la portée.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
export const FR_LETTERS = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

const MAJOR_TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const MINOR_TONICS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'];

const SCALE_PATTERNS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic: [0, 2, 3, 5, 7, 9, 11], // forme ascendante
};

export const MINOR_TYPES = ['harmonic', 'natural', 'melodic'];
export const MINOR_TYPE_LABELS = {
  harmonic: 'harmonique',
  natural: 'naturel',
  melodic: 'mélodique',
};

const mod = (n, m) => ((n % m) + m) % m;

function parseTonic(name) {
  const letter = LETTERS.indexOf(name[0]);
  const acc = name.slice(1);
  const alter = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  return { letter, alter };
}

/** Calcule les altérations des 7 degrés d'une gamme. */
function buildAlters(tonicLetter, tonicAlter, pattern) {
  const tonicPC = NATURAL_PC[tonicLetter] + tonicAlter;
  return pattern.map((interval, i) => {
    const letter = (tonicLetter + i) % 7;
    return mod(tonicPC + interval - NATURAL_PC[letter] + 6, 12) - 6;
  });
}

export function accidentalSymbol(alter) {
  return { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' }[alter] ?? '';
}

export function frNoteName(letter, alter = 0) {
  return FR_LETTERS[letter] + accidentalSymbol(alter);
}

/** Liste de toutes les tonalités disponibles. */
export const KEYS = [
  ...MAJOR_TONICS.map((t) => makeKey(t, 'major')),
  ...MINOR_TONICS.map((t) => makeKey(t, 'minor')),
];

function makeKey(tonic, mode) {
  const { letter, alter } = parseTonic(tonic);
  const sigAlters = buildAlters(letter, alter, mode === 'major' ? SCALE_PATTERNS.major : SCALE_PATTERNS.natural);
  // Armure : lettre -> altération
  const signature = new Array(7).fill(0);
  sigAlters.forEach((a, i) => { signature[(letter + i) % 7] = a; });
  const fifths = signature.reduce((s, a) => s + a, 0); // >0 dièses, <0 bémols
  const id = mode === 'major' ? tonic : `${tonic}m`; // format VexFlow
  const sigLabel = fifths === 0 ? '' : fifths > 0 ? `${fifths}♯` : `${-fifths}♭`;
  return {
    id,
    vexSpec: id,
    tonicLetter: letter,
    tonicAlter: alter,
    mode,
    signature,
    fifths,
    name: `${frNoteName(letter, alter)} ${mode === 'major' ? 'majeur' : 'mineur'}`,
    sigLabel,
  };
}

export function getKey(id) {
  return KEYS.find((k) => k.id === id) ?? KEYS[0];
}

/**
 * Construit le contexte de gamme pour une tonalité.
 *  - melodyUp / melodyDown : altérations utilisées par la mélodie
 *  - harmony               : altérations utilisées pour construire les accords
 */
export function buildScale(key, minorType = 'harmonic') {
  const { tonicLetter: l, tonicAlter: a } = key;
  if (key.mode === 'major') {
    const alters = buildAlters(l, a, SCALE_PATTERNS.major);
    return { key, minorType: null, melodyUp: alters, melodyDown: alters, harmony: alters };
  }
  const natural = buildAlters(l, a, SCALE_PATTERNS.natural);
  const harmonic = buildAlters(l, a, SCALE_PATTERNS.harmonic);
  const melodic = buildAlters(l, a, SCALE_PATTERNS.melodic);
  switch (minorType) {
    case 'natural':
      return { key, minorType, melodyUp: natural, melodyDown: natural, harmony: natural };
    case 'melodic':
      // Ascendant : 6e et 7e haussées ; descendant : forme naturelle.
      // L'harmonie utilise la dominante majeure (forme harmonique).
      return { key, minorType, melodyUp: melodic, melodyDown: natural, harmony: harmonic };
    case 'harmonic':
    default:
      return { key, minorType: 'harmonic', melodyUp: harmonic, melodyDown: harmonic, harmony: harmonic };
  }
}

// ── Hauteurs ────────────────────────────────────────────────

export const letterOf = (D) => mod(D, 7);
export const octaveOf = (D) => Math.floor(D / 7);

/** Degré (0 = tonique) d'une hauteur diatonique dans la tonalité. */
export const degreeOf = (D, key) => mod(letterOf(D) - key.tonicLetter, 7);

export function toMidi(D, alter) {
  return 12 * (octaveOf(D) + 1) + NATURAL_PC[letterOf(D)] + alter;
}

/** Clé VexFlow (« c/4 ») – seule la lettre détermine la position. */
export function vexKey(D) {
  return `${LETTERS[letterOf(D)].toLowerCase()}/${octaveOf(D)}`;
}

/** D de la lettre `letter` à l'octave `octave`. */
export const dOf = (letter, octave) => octave * 7 + letter;

/** Plus petite valeur D ≥ min ayant la lettre donnée. */
export function lowestDWithLetter(letter, min) {
  let D = Math.floor(min / 7) * 7 + letter;
  if (D < min) D += 7;
  return D;
}

// ── Liste des notes du piano pour l'ambitus (C1 … C7) ───────

export const PIANO_NOTES = [];
for (let oct = 1; oct <= 7; oct++) {
  for (let l = 0; l < 7; l++) {
    const id = `${LETTERS[l]}${oct}`;
    const D = oct * 7 + l;
    const midi = toMidi(D, 0);
    const frName = FR_LETTERS[l] + oct;
    const isMiddleC = (oct === 4 && l === 0);
    const label = `${frName} (${id}${isMiddleC ? ' - Do central' : ''})`;
    PIANO_NOTES.push({ id, letter: l, octave: oct, D, midi, frName, label });
    if (oct === 7 && l === 0) break;
  }
}

export function noteToD(noteId) {
  const note = PIANO_NOTES.find((n) => n.id === noteId);
  if (note) return note.D;
  const letter = LETTERS.indexOf(noteId[0]);
  const oct = parseInt(noteId.slice(1), 10);
  return oct * 7 + (letter >= 0 ? letter : 0);
}

export function dToNote(D) {
  const l = letterOf(D);
  const oct = octaveOf(D);
  return `${LETTERS[l]}${oct}`;
}

export function frNoteLabel(noteId) {
  const note = PIANO_NOTES.find((n) => n.id === noteId);
  return note ? note.frName : noteId;
}

/** Formate un intervalle musical en français (ex. « 2 octaves et une quinte »). */
export function formatInterval(semitones) {
  if (semitones === 0) return 'unisson';
  const oct = Math.floor(semitones / 12);
  const rem = semitones % 12;
  const REM_NAMES = {
    0: '',
    1: 'seconde mineure',
    2: 'seconde majeure',
    3: 'tierce mineure',
    4: 'tierce majeure',
    5: 'quarte',
    6: 'triton',
    7: 'quinte',
    8: 'sixte mineure',
    9: 'sixte majeure',
    10: 'septième mineure',
    11: 'septième majeure',
  };
  if (oct === 0) return REM_NAMES[rem] || `${semitones} demi-tons`;
  const octStr = oct === 1 ? '1 octave' : `${oct} octaves`;
  if (rem === 0) return octStr;
  return `${octStr} et ${REM_NAMES[rem] || `${rem} demi-tons`}`;
}

/**
 * Analyse l'ambitus réel utilisé par chaque main et au global pour une partition donnée.
 */
export function analyzeScoreAmbitus(score) {
  let minTrebleD = Infinity;
  let maxTrebleD = -Infinity;
  let minTrebleAlter = 0;
  let maxTrebleAlter = 0;

  let minBassD = Infinity;
  let maxBassD = -Infinity;
  let minBassAlter = 0;
  let maxBassAlter = 0;

  let minD = Infinity;
  let maxD = -Infinity;
  let minAlter = 0;
  let maxAlter = 0;

  score.measures.forEach((m) => {
    if (m.treble) {
      m.treble.forEach((ev) => {
        if (!ev.rest && ev.notes) {
          ev.notes.forEach((n) => {
            if (n.D < minTrebleD) { minTrebleD = n.D; minTrebleAlter = n.alter ?? 0; }
            if (n.D > maxTrebleD) { maxTrebleD = n.D; maxTrebleAlter = n.alter ?? 0; }
            if (n.D < minD) { minD = n.D; minAlter = n.alter ?? 0; }
            if (n.D > maxD) { maxD = n.D; maxAlter = n.alter ?? 0; }
          });
        }
      });
    }
    if (m.bass) {
      m.bass.forEach((ev) => {
        if (!ev.rest && ev.notes) {
          ev.notes.forEach((n) => {
            if (n.D < minBassD) { minBassD = n.D; minBassAlter = n.alter ?? 0; }
            if (n.D > maxBassD) { maxBassD = n.D; maxBassAlter = n.alter ?? 0; }
            if (n.D < minD) { minD = n.D; minAlter = n.alter ?? 0; }
            if (n.D > maxD) { maxD = n.D; maxAlter = n.alter ?? 0; }
          });
        }
      });
    }
  });

  if (minD === Infinity) {
    minD = score.params.minD ?? 14;
    maxD = score.params.maxD ?? 42;
  }

  const minNote = dToNote(minD);
  const maxNote = dToNote(maxD);
  const minMidi = toMidi(minD, minAlter);
  const maxMidi = toMidi(maxD, maxAlter);
  const totalSemitones = Math.max(0, maxMidi - minMidi);

  const res = {
    minD,
    maxD,
    minNote,
    maxNote,
    minFr: frNoteLabel(minNote),
    maxFr: frNoteLabel(maxNote),
    minMidi,
    maxMidi,
    totalSemitones,
    intervalLabel: formatInterval(totalSemitones),
    treble: null,
    bass: null,
  };

  if (minTrebleD !== Infinity) {
    const tMinNote = dToNote(minTrebleD);
    const tMaxNote = dToNote(maxTrebleD);
    const tMinMidi = toMidi(minTrebleD, minTrebleAlter);
    const tMaxMidi = toMidi(maxTrebleD, maxTrebleAlter);
    const st = Math.max(0, tMaxMidi - tMinMidi);
    res.treble = {
      minD: minTrebleD,
      maxD: maxTrebleD,
      minNote: tMinNote,
      maxNote: tMaxNote,
      minFr: frNoteLabel(tMinNote),
      maxFr: frNoteLabel(tMaxNote),
      minMidi: tMinMidi,
      maxMidi: tMaxMidi,
      semitones: st,
      intervalLabel: formatInterval(st),
    };
  }

  if (minBassD !== Infinity) {
    const bMinNote = dToNote(minBassD);
    const bMaxNote = dToNote(maxBassD);
    const bMinMidi = toMidi(minBassD, minBassAlter);
    const bMaxMidi = toMidi(maxBassD, maxBassAlter);
    const st = Math.max(0, bMaxMidi - bMinMidi);
    res.bass = {
      minD: minBassD,
      maxD: maxBassD,
      minNote: bMinNote,
      maxNote: bMaxNote,
      minFr: frNoteLabel(bMinNote),
      maxFr: frNoteLabel(bMaxNote),
      minMidi: bMinMidi,
      maxMidi: bMaxMidi,
      semitones: st,
      intervalLabel: formatInterval(st),
    };
  }

  return res;
}

// ── Description harmonique des accords et repérage en cours de jeu ───────

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'vii°'];

/**
 * Détermine le nom en français et le degré d'un accord harmonique.
 * @param {Object} slot - { degree, seventh, ninth, sus4, add9 }
 * @param {Object} key - Tonalité
 * @param {Object} scale - Gamme
 * @returns {{ rootName: string, quality: string, shortLabel: string, fullLabel: string, degreeRoman: string }}
 */
export function describeChord(slot, key, scale) {
  if (!slot || !key) return { rootName: '—', quality: '', shortLabel: '—', fullLabel: '—', degreeRoman: '' };
  const d = slot.degree ?? 0;
  const rootLetter = (key.tonicLetter + d) % 7;
  const rootAlter = scale?.harmony?.[d] ?? 0;
  const rootName = frNoteName(rootLetter, rootAlter);

  const pcRoot = (NATURAL_PC[rootLetter] + rootAlter + 12) % 12;

  // Tierce (ou quarte si sus4)
  const thirdDeg = slot.sus4 ? (d + 3) % 7 : (d + 2) % 7;
  const thirdLetter = (key.tonicLetter + thirdDeg) % 7;
  const thirdAlter = scale?.harmony?.[thirdDeg] ?? 0;
  const pcThird = (NATURAL_PC[thirdLetter] + thirdAlter + 12) % 12;
  const thirdInterval = (pcThird - pcRoot + 12) % 12;

  // Quinte
  const fifthDeg = (d + 4) % 7;
  const fifthLetter = (key.tonicLetter + fifthDeg) % 7;
  const fifthAlter = scale?.harmony?.[fifthDeg] ?? 0;
  const pcFifth = (NATURAL_PC[fifthLetter] + fifthAlter + 12) % 12;
  const fifthInterval = (pcFifth - pcRoot + 12) % 12;

  // Septième
  let seventhInterval = -1;
  if (slot.seventh) {
    const seventhDeg = (d + 6) % 7;
    const seventhLetter = (key.tonicLetter + seventhDeg) % 7;
    const seventhAlter = scale?.harmony?.[seventhDeg] ?? 0;
    const pcSeventh = (NATURAL_PC[seventhLetter] + seventhAlter + 12) % 12;
    seventhInterval = (pcSeventh - pcRoot + 12) % 12;
  }

  let quality = '';
  let shortQuality = '';

  if (slot.sus4) {
    quality = slot.seventh ? '7sus4' : 'sus4';
    shortQuality = quality;
  } else if (thirdInterval === 4) {
    // Accord majeur
    if (fifthInterval === 7) {
      if (slot.seventh) {
        if (seventhInterval === 10) {
          quality = slot.ninth ? '9' : '7';
          shortQuality = quality;
        } else {
          quality = slot.ninth ? 'maj9' : 'maj7';
          shortQuality = quality;
        }
      } else if (slot.add9) {
        quality = 'add9';
        shortQuality = 'add9';
      } else {
        quality = 'majeur';
        shortQuality = '';
      }
    } else if (fifthInterval === 8) {
      quality = 'augmenté';
      shortQuality = 'aug';
    }
  } else if (thirdInterval === 3) {
    // Accord mineur
    if (fifthInterval === 7) {
      if (slot.seventh) {
        quality = slot.ninth ? 'm9' : 'm7';
        shortQuality = quality;
      } else if (slot.add9) {
        quality = 'm(add9)';
        shortQuality = quality;
      } else {
        quality = 'mineur';
        shortQuality = 'm';
      }
    } else if (fifthInterval === 6) {
      if (slot.seventh) {
        quality = seventhInterval === 9 ? 'dim7' : 'm7♭5';
        shortQuality = quality;
      } else {
        quality = 'diminué';
        shortQuality = 'dim';
      }
    }
  }

  const romanList = key.mode === 'minor' ? ROMAN_MINOR : ROMAN_MAJOR;
  let degRoman = romanList[d] ?? '';
  if (slot.seventh) degRoman += '7';
  if (slot.ninth) degRoman += '9';

  const shortLabel = `${rootName}${shortQuality ? (shortQuality.startsWith('m') && !shortQuality.startsWith('maj') ? shortQuality : ' ' + shortQuality) : ''}`;
  const fullLabel = `${rootName} ${quality}`.trim() + (degRoman ? ` (${degRoman})` : '');

  return {
    rootName,
    quality,
    shortLabel,
    fullLabel,
    degreeRoman: degRoman,
  };
}

/**
 * Détermine en temps réel la note la plus aiguë active et l'accord en cours à l'instant u.
 * @param {Object} score
 * @param {number} u - Position temporelle en unités
 */
export function getActivePlaybackInfo(score, u) {
  if (!score || !score.measures || score.measures.length === 0) {
    return { topNote: '—', chord: '—', chordShort: '—', measureLabel: '—', hasNote: false };
  }

  const mLen = score.meter.measureLen;
  const clampedU = Math.max(0, Math.min(u, score.totalUnits - 0.001));
  const mIdx = Math.max(0, Math.min(score.measures.length - 1, Math.floor(clampedU / mLen)));
  const m = score.measures[mIdx];
  const posInM = clampedU - mIdx * mLen;

  // 1. Recherche de l'accord en cours dans la mesure
  const slot = score.slots?.find((s) => s.m === mIdx && posInM >= s.start && posInM < s.start + s.len)
    ?? score.slots?.findLast((s) => s.m === mIdx)
    ?? score.slots?.[score.slots.length - 1];
  const chordInfo = describeChord(slot, score.key, score.scale);

  // 2. Recherche de toutes les notes actives à cet instant précis
  const activeNotes = [];
  if (m) {
    for (const staff of [m.treble, m.bass]) {
      if (!staff) continue;
      for (const ev of staff) {
        if (ev.rest) continue;
        if (posInM >= ev.start && posInM < ev.start + ev.dur) {
          for (const n of ev.notes) {
            activeNotes.push(n);
          }
        }
      }
    }
  }

  let topNoteLabel = '—';
  let topNoteMidi = null;

  if (activeNotes.length > 0) {
    const topNote = activeNotes.reduce((max, n) => (n.midi > max.midi ? n : max), activeNotes[0]);
    const letter = letterOf(topNote.D);
    const octave = octaveOf(topNote.D);
    const name = frNoteName(letter, topNote.alter);
    topNoteLabel = `${name} ${octave}`;
    topNoteMidi = topNote.midi;
  }

  return {
    measureIndex: mIdx,
    measureLabel: `${mIdx + 1} / ${score.measures.length}`,
    topNote: topNoteLabel,
    topNoteMidi,
    chord: chordInfo.fullLabel,
    chordShort: chordInfo.shortLabel,
    hasNote: activeNotes.length > 0,
  };
}
