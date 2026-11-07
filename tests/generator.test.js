import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateScore, TIME_SIGNATURES, LEVELS, HANDS, meterInfo } from '../public/js/generator.js';
import { KEYS, MINOR_TYPES, buildScale, getKey, degreeOf, noteToD, analyzeScoreAmbitus, formatInterval } from '../public/js/theory.js';
import { buildAmbitusKeyboardSvg } from '../public/js/ambitus-ribbon.js';
import { midiFileBytes } from '../public/js/midi-file.js';
import { Player } from '../public/js/player.js';

const baseSettings = (over = {}) => ({
  timeSignature: '4/4', measures: 8, key: 'C', hands: 'both', level: 'debutant', minorType: 'harmonic',
  random: {}, ...over,
});

test('gammes mineures correctes (La mineur)', () => {
  const k = getKey('Am');
  assert.deepEqual(buildScale(k, 'natural').melodyUp, [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(buildScale(k, 'harmonic').melodyUp, [0, 0, 0, 0, 0, 0, 1]); // sol#
  assert.deepEqual(buildScale(k, 'melodic').melodyUp, [0, 0, 0, 0, 0, 1, 1]); // fa# sol#
  assert.deepEqual(buildScale(k, 'melodic').melodyDown, [0, 0, 0, 0, 0, 0, 0]);
});

test('armures', () => {
  assert.equal(getKey('Cb').fifths, -7);
  assert.equal(getKey('C#').fifths, 7);
  assert.equal(getKey('F#m').fifths, 3);
  assert.equal(getKey('Bbm').fifths, -5);
});

test('toutes les combinaisons produisent des mesures complètes', () => {
  let seed = 1;
  for (const ts of TIME_SIGNATURES) {
    for (const level of LEVELS) {
      for (const hands of HANDS) {
        for (const key of KEYS) {
          for (const minorType of MINOR_TYPES) {
            for (const measures of [1, 2, 5, 8]) {
              const score = generateScore(baseSettings({ timeSignature: ts, level, hands, key: key.id, minorType, measures }), seed++);
              const L = score.meter.measureLen;
              assert.equal(score.measures.length, measures);
              for (const m of score.measures) {
                for (const staff of [m.treble, m.bass]) {
                  if (!staff) continue;
                  assert.equal(staff.reduce((s, e) => s + e.dur, 0), L, `${ts} ${level} ${hands} ${key.id}`);
                  let pos = 0;
                  for (const e of staff) {
                    assert.equal(e.start, pos);
                    pos += e.dur;
                    assert.ok([1, 2, 3, 4, 6, 8, 12, 16, 24].includes(e.dur), `durée ${e.dur}`);
                    for (const n of e.notes) {
                      assert.ok(Number.isInteger(n.midi) && n.midi >= 21 && n.midi <= 108);
                      assert.ok(Math.abs(n.alter) <= 2);
                    }
                  }
                }
              }
              assert.equal(!!score.measures[0].treble, hands !== 'left');
              assert.equal(!!score.measures[0].bass, hands !== 'right');
            }
          }
        }
      }
    }
  }
});

test('la mélodie se termine sur la tonique', () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = generateScore(baseSettings({ key: 'Dm', level: 'avance' }), seed);
    const last = s.measures.at(-1).treble.filter((e) => !e.rest).at(-1);
    assert.equal(degreeOf(last.notes.at(-1).D, s.key), 0);
  }
});

test('reproductible avec la même graine', () => {
  const settings = baseSettings({ random: { key: true, timeSignature: true, measures: true, level: true, hands: true, bpm: true, enrichedChords: true } });
  assert.deepEqual(generateScore(settings, 42), generateScore(settings, 42));
});

test('accords enrichis selon le niveau et la configuration des mains', () => {
  // 1. Initiation : aucune note simultanée à la main droite
  const init = generateScore(baseSettings({ level: 'initiation', enrichedChords: 'auto' }), 100);
  const initAllTrebleNotes = init.measures.flatMap((m) => m.treble.filter((e) => !e.rest));
  assert.ok(initAllTrebleNotes.every((e) => e.notes.length === 1), 'Initiation ne doit avoir aucun accord à la main droite');

  // 2. Débutant : aucune harmonisation à la main droite en auto
  const deb = generateScore(baseSettings({ level: 'debutant', enrichedChords: 'auto' }), 101);
  const debAllTrebleNotes = deb.measures.flatMap((m) => m.treble.filter((e) => !e.rest));
  assert.ok(debAllTrebleNotes.every((e) => e.notes.length === 1), 'Débutant auto ne doit pas avoir d’accords à la main droite');

  // 3. Intermédiaire avec main droite enrichie
  const interMD = generateScore(baseSettings({ level: 'intermediaire', enrichedChords: 'right' }), 102);
  const interTrebleChords = interMD.measures.flatMap((m) => m.treble.filter((e) => !e.rest && e.notes.length > 1));
  assert.ok(interTrebleChords.length > 0, 'Intermédiaire main droite doit comporter des accords sous la mélodie');

  // 4. Option 7èmes explicite (seventh)
  const sevBoth = generateScore(baseSettings({ level: 'intermediaire', enrichedChords: 'seventh' }), 105);
  assert.equal(sevBoth.params.extensionType, 'seventh');
  assert.ok(sevBoth.params.enrichRight && sevBoth.params.enrichLeft);

  // 5. Option très enrichis 9e/11e/13e (extended)
  const extBoth = generateScore(baseSettings({ level: 'expert', enrichedChords: 'extended' }), 106);
  assert.equal(extBoth.params.extensionType, 'extended');
  assert.ok(extBoth.params.enrichRight && extBoth.params.enrichLeft);
  const extTrebleChords = extBoth.measures.flatMap((m) => m.treble.filter((e) => !e.rest && e.notes.length >= 2));
  assert.ok(extTrebleChords.length > 0, 'Virtuose enrichi doit comporter des accords main droite');

  // 6. Avancé avec les deux mains enrichies
  const advBoth = generateScore(baseSettings({ level: 'avance', enrichedChords: 'both' }), 103);
  const advTrebleChords = advBoth.measures.flatMap((m) => m.treble.filter((e) => !e.rest && e.notes.length >= 2));
  assert.ok(advTrebleChords.length > 0, 'Avancé doit comporter des accords riches à la main droite');
  assert.ok(advBoth.params.enrichRight && advBoth.params.enrichLeft);

  // 7. Désactivé
  const none = generateScore(baseSettings({ level: 'avance', enrichedChords: 'none' }), 104);
  const noneTrebleChords = none.measures.flatMap((m) => m.treble.filter((e) => !e.rest && e.notes.length > 1));
  assert.equal(noneTrebleChords.length, 0, 'Désactivé ne doit avoir aucun accord à la main droite');
  assert.equal(none.params.extensionType, 'none');
});

test('paramètre tempo et tempo aléatoire', () => {
  const fixed = generateScore(baseSettings({ bpm: 112 }), 10);
  assert.equal(fixed.params.bpm, 112);

  const rnd = generateScore(baseSettings({ random: { bpm: true } }), 10);
  assert.ok(rnd.params.bpm >= 40 && rnd.params.bpm <= 200);
});

test('étalonnage exact du tempo : 60 BPM = 1 battement par seconde (60 battements/minute)', () => {
  const fakeSynth = { now: 0, playNote: () => {}, click: () => {}, stopAll: () => {}, ensure: async () => {} };
  const fakeMidi = { ready: false, allNotesOff: () => {} };
  const player = new Player({ synth: fakeSynth, midi: fakeMidi });

  for (const ts of TIME_SIGNATURES) {
    const score = generateScore(baseSettings({ timeSignature: ts, bpm: 60 }), 1);
    player.load(score);
    player.setTempo(60);

    // Durée exacte d'un battement (un temps) en secondes
    const beatDuration = player.beatLen * player.spu;
    assert.equal(Math.round(beatDuration * 1000), 1000, `À 60 BPM, 1 battement doit faire 1000ms pour ${ts}`);
    const beatsPerMinute = 60 / beatDuration;
    assert.equal(Math.round(beatsPerMinute), 60, `À 60 BPM, il doit y avoir 60 battements/minute pour ${ts}`);

    // À 120 BPM : 1 battement = 0.5s = 500ms (120 battements/minute)
    player.setTempo(120);
    const beatDuration120 = player.beatLen * player.spu;
    assert.equal(Math.round(beatDuration120 * 1000), 500, `À 120 BPM, 1 battement doit faire 500ms pour ${ts}`);
    const beatsPerMinute120 = 60 / beatDuration120;
    assert.equal(Math.round(beatsPerMinute120), 120, `À 120 BPM, il doit y avoir 120 battements/minute pour ${ts}`);
  }
});

test('fichier MIDI valide', () => {
  const s = generateScore(baseSettings({ key: 'Eb', timeSignature: '6/8' }), 7);
  const bytes = midiFileBytes(s, 100);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  assert.equal(bytes[9], 1); // format 1
  assert.equal(bytes[11], 3); // 3 pistes
});

test('ambitus strict : respect de la note la plus basse et de la note la plus haute', () => {
  const testCases = [
    { minNote: 'C3', maxNote: 'C5', hands: 'both', key: 'C', level: 'intermediaire' },
    { minNote: 'E2', maxNote: 'G4', hands: 'left', key: 'Am', level: 'debutant' },
    { minNote: 'G3', maxNote: 'E5', hands: 'right', key: 'F', level: 'initiation' },
    { minNote: 'A1', maxNote: 'C6', hands: 'both', key: 'G', level: 'avance' },
    { minNote: 'C4', maxNote: 'C5', hands: 'right', key: 'D', level: 'expert' }, // Ambitus très serré (1 octave)
  ];

  for (let seed = 1; seed <= 30; seed++) {
    for (const tc of testCases) {
      const score = generateScore(baseSettings({ ...tc }), seed);
      const minD = noteToD(score.params.minNote);
      const maxD = noteToD(score.params.maxNote);

      let trebleHasMax = false;
      let trebleHasMin = false;
      let bassHasMax = false;
      let bassHasMin = false;

      for (const m of score.measures) {
        if (m.treble) {
          for (const ev of m.treble) {
            if (ev.rest) continue;
            for (const n of ev.notes) {
              assert.ok(n.D >= minD && n.D <= maxD, `Treble note ${n.D} hors limites [${minD}, ${maxD}]`);
              if (n.D === maxD) trebleHasMax = true;
              if (n.D === minD) trebleHasMin = true;
            }
          }
        }
        if (m.bass) {
          for (const ev of m.bass) {
            if (ev.rest) continue;
            for (const n of ev.notes) {
              assert.ok(n.D >= minD && n.D <= maxD, `Bass note ${n.D} hors limites [${minD}, ${maxD}]`);
              if (n.D === minD) bassHasMin = true;
              if (n.D === maxD) bassHasMax = true;
            }
          }
        }
      }

      if (tc.hands === 'both') {
        assert.ok(bassHasMin, `La main gauche doit contenir la note la plus basse (${tc.minNote}) pour graine ${seed}`);
        assert.ok(trebleHasMax, `La main droite doit contenir la note la plus haute (${tc.maxNote}) pour graine ${seed}`);
      } else if (tc.hands === 'right') {
        assert.ok(trebleHasMax, `La main droite doit contenir la note la plus haute (${tc.maxNote}) pour graine ${seed}`);
        assert.ok(trebleHasMin, `La main droite seule doit contenir la note la plus basse (${tc.minNote}) pour graine ${seed}`);
      } else if (tc.hands === 'left') {
        assert.ok(bassHasMin, `La main gauche doit contenir la note la plus basse (${tc.minNote}) pour graine ${seed}`);
        assert.ok(bassHasMax, `La main gauche seule doit contenir la note la plus haute (${tc.maxNote}) pour graine ${seed}`);
      }
    }
  }
});

test('jouabilité pianistique : écartement des doigts et voicings réalisables', () => {
  for (let seed = 1; seed <= 50; seed++) {
    for (const level of LEVELS) {
      for (const hands of HANDS) {
        const score = generateScore(baseSettings({ level, hands, enrichedChords: 'both' }), seed);
        for (const m of score.measures) {
          for (const staff of [m.treble, m.bass]) {
            if (!staff) continue;
            for (const ev of staff) {
              if (ev.rest || ev.notes.length <= 1) continue;
              // Tout accord plaqué à une main doit avoir un écartement max <= 8 degrés (une octave)
              const minChordD = ev.notes[0].D;
              const maxChordD = ev.notes.at(-1).D;
              assert.ok(
                maxChordD - minChordD <= 8,
                `Accord injouable d'une seule main : écart de ${maxChordD - minChordD} degrés (${minChordD} -> ${maxChordD})`
              );
            }
          }
        }
      }
    }
  }
});

test("analyse de l'ambitus et composant d'affichage", () => {
  assert.equal(formatInterval(0), 'unisson');
  assert.equal(formatInterval(12), '1 octave');
  assert.equal(formatInterval(24), '2 octaves');
  assert.equal(formatInterval(48), '4 octaves');
  assert.equal(formatInterval(7), 'quinte');
  assert.equal(formatInterval(19), '1 octave et quinte');

  const score = generateScore(baseSettings({ minNote: 'C2', maxNote: 'C6', hands: 'both' }), 42);
  const amb = analyzeScoreAmbitus(score);

  assert.equal(amb.minNote, 'C2');
  assert.equal(amb.maxNote, 'C6');
  assert.ok(amb.totalSemitones >= 48);
  assert.ok(amb.treble);
  assert.ok(amb.bass);
  assert.equal(amb.bass.minNote, 'C2');
  assert.equal(amb.treble.maxNote, 'C6');

  const svg = buildAmbitusKeyboardSvg(amb, 'both');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(svg.includes('ambitus-keyboard-svg'));
  assert.ok(svg.includes('key-white'));
  assert.ok(svg.includes('key-black'));
});

test('ambitus extrême : C1 (extrême grave) et C7 (extrême aigu) sans dépassement', () => {
  for (let seed = 100; seed <= 120; seed++) {
    const score = generateScore(baseSettings({ minNote: 'C1', maxNote: 'C7', hands: 'both', measures: 8 }), seed);
    const amb = analyzeScoreAmbitus(score);
    assert.equal(amb.minNote, 'C1');
    assert.equal(amb.maxNote, 'C7');
    assert.equal(amb.bass.minNote, 'C1');
    assert.equal(amb.treble.maxNote, 'C7');
    assert.ok(amb.totalSemitones >= 72); // 6 octaves complètes

    for (const m of score.measures) {
      for (const ev of [...(m.treble || []), ...(m.bass || [])]) {
        if (ev.rest) continue;
        for (const n of ev.notes) {
          assert.ok(n.D >= noteToD('C1') && n.D <= noteToD('C7'), `Note hors bornes : ${n.D}`);
        }
      }
    }
  }
});
