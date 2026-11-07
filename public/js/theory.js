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
