// ─────────────────────────────────────────────────────────────
//  Gestion des paramètres et persistance (localStorage)
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'partitio_user_settings_v1';
const LAST_SCORE_SEED_KEY = 'partitio_last_seed_v1';

export const DEFAULT_SETTINGS = {
  timeSignature: '4/4',
  measures: 8,
  key: 'C',
  minorType: 'harmonic',
  level: 'debutant',
  hands: 'both',
  enrichedChords: 'auto', // 'auto' | 'both' | 'right' | 'left' | 'none'
  minNote: 'C2',
  maxNote: 'C6',
  bpm: 90,
  metronome: false,
  output: 'synth', // 'synth' | 'midi'
  midiOutputId: '',
  random: {
    timeSignature: false,
    measures: false,
    key: false,
    minorType: false,
    level: false,
    hands: false,
    enrichedChords: false,
    minNote: false,
    maxNote: false,
  },
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, random: { ...DEFAULT_SETTINGS.random } };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      random: {
        ...DEFAULT_SETTINGS.random,
        ...(parsed.random || {}),
      },
    };
  } catch (e) {
    console.warn('Impossible de charger les réglages:', e);
    return { ...DEFAULT_SETTINGS, random: { ...DEFAULT_SETTINGS.random } };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Impossible d’enregistrer les réglages:', e);
  }
}

export function loadLastSeed() {
  try {
    const s = localStorage.getItem(LAST_SCORE_SEED_KEY);
    return s ? parseInt(s, 10) : null;
  } catch {
    return null;
  }
}

export function saveLastSeed(seed) {
  try {
    localStorage.setItem(LAST_SCORE_SEED_KEY, String(seed));
  } catch {
    // ignoré
  }
}
