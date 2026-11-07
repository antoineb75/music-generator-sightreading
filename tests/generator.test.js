import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateScore, TIME_SIGNATURES, LEVELS, HANDS } from '../public/js/generator.js';
import { KEYS, MINOR_TYPES, buildScale, getKey, degreeOf } from '../public/js/theory.js';
import { midiFileBytes } from '../public/js/midi-file.js';

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

test('fichier MIDI valide', () => {
  const s = generateScore(baseSettings({ key: 'Eb', timeSignature: '6/8' }), 7);
  const bytes = midiFileBytes(s, 100);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  assert.equal(bytes[9], 1); // format 1
  assert.equal(bytes[11], 3); // 3 pistes
});
