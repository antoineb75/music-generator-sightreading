import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateScore, TIME_SIGNATURES, LEVELS, HANDS, meterInfo } from '../docs/js/generator.js';
import { KEYS, MINOR_TYPES, buildScale, getKey, degreeOf, noteToD, analyzeScoreAmbitus, formatInterval, describeChord, getActivePlaybackInfo } from '../docs/js/theory.js';
import { buildAmbitusKeyboardSvg } from '../docs/js/ambitus-ribbon.js';
import { midiFileBytes } from '../docs/js/midi-file.js';
import { Player } from '../docs/js/player.js';

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
                  assert.ok(Math.abs(staff.reduce((s, e) => s + e.dur, 0) - L) < 1e-6, `${ts} ${level} ${hands} ${key.id}`);
                  let pos = 0;
                  for (const e of staff) {
                    assert.ok(Math.abs(e.start - pos) < 1e-6);
                    pos += e.dur;
                    const nd = e.notationDur ?? e.dur;
                    assert.ok([1, 2, 3, 4, 6, 8, 12, 16, 24].includes(nd), `durée ${nd}`);
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

test('describeChord : identification musicale exacte des accords (majeurs, mineurs, 7e, sus4)', () => {
  const kC = getKey('C');
  const scaleC = buildScale(kC, 'major');

  // I = Do majeur
  const chI = describeChord({ degree: 0 }, kC, scaleC);
  assert.equal(chI.rootName, 'Do');
  assert.equal(chI.fullLabel, 'Do majeur (I)');
  assert.equal(chI.shortLabel, 'Do');

  // ii = Ré mineur
  const chII = describeChord({ degree: 1 }, kC, scaleC);
  assert.equal(chII.rootName, 'Ré');
  assert.equal(chII.fullLabel, 'Ré mineur (ii)');
  assert.equal(chII.shortLabel, 'Rém');

  // V7 = Sol 7 (dominante)
  const chV7 = describeChord({ degree: 4, seventh: true }, kC, scaleC);
  assert.equal(chV7.rootName, 'Sol');
  assert.equal(chV7.fullLabel, 'Sol 7 (V7)');
  assert.equal(chV7.shortLabel, 'Sol 7');

  // Imaj7 = Do maj7
  const chImaj7 = describeChord({ degree: 0, seventh: true }, kC, scaleC);
  assert.equal(chImaj7.rootName, 'Do');
  assert.equal(chImaj7.fullLabel, 'Do maj7 (I7)');

  // IV = Fa majeur
  const chIV = describeChord({ degree: 3 }, kC, scaleC);
  assert.equal(chIV.rootName, 'Fa');
  assert.equal(chIV.fullLabel, 'Fa majeur (IV)');

  // sus4
  const chSus4 = describeChord({ degree: 4, sus4: true }, kC, scaleC);
  assert.equal(chSus4.rootName, 'Sol');
  assert.equal(chSus4.fullLabel, 'Sol sus4 (V)');

  // En La mineur harmonique : V7 = Mi 7 (dominante avec sensible Sol#)
  const kAm = getKey('Am');
  const scaleAm = buildScale(kAm, 'harmonic');
  const chAmV7 = describeChord({ degree: 4, seventh: true }, kAm, scaleAm);
  assert.equal(chAmV7.rootName, 'Mi');
  assert.equal(chAmV7.fullLabel, 'Mi 7 (V7)');
});

test('getActivePlaybackInfo : identification en direct de la note la plus aiguë et de l accord en cours', () => {
  const mockScore = {
    meter: { measureLen: 16, beatLen: 4 },
    totalUnits: 32,
    key: getKey('C'),
    scale: buildScale(getKey('C'), 'major'),
    slots: [
      { m: 0, start: 0, len: 16, degree: 0 }, // Mesure 1: Do majeur
      { m: 1, start: 0, len: 8, degree: 3 },  // Mesure 2 (début): Fa majeur
      { m: 1, start: 8, len: 8, degree: 4, seventh: true }, // Mesure 2 (fin): Sol 7
    ],
    measures: [
      {
        index: 0,
        treble: [
          {
            id: 't0-0', hand: 'right', start: 0, dur: 8, rest: false,
            notes: [{ D: 28, alter: 0, midi: 60 }, { D: 30, alter: 0, midi: 64 }], // C4 (60), E4 (64 -> plus aiguë)
          },
          {
            id: 't0-1', hand: 'right', start: 8, dur: 8, rest: false,
            notes: [{ D: 32, alter: 0, midi: 67 }], // G4 (67 -> Sol 4)
          },
        ],
        bass: [
          {
            id: 'b0-0', hand: 'left', start: 0, dur: 16, rest: false,
            notes: [{ D: 21, alter: 0, midi: 48 }], // C3 (48)
          },
        ],
      },
      {
        index: 1,
        treble: [
          {
            id: 't1-0', hand: 'right', start: 0, dur: 8, rest: false,
            notes: [{ D: 34, alter: 0, midi: 71 }], // B4 (71 -> Si 4)
          },
          {
            id: 't1-1', hand: 'right', start: 8, dur: 8, rest: false,
            notes: [{ D: 35, alter: 0, midi: 72 }], // C5 (72 -> Do 5)
          },
        ],
        bass: [
          {
            id: 'b1-0', hand: 'left', start: 0, dur: 8, rest: false,
            notes: [{ D: 24, alter: 0, midi: 53 }], // F3
          },
          {
            id: 'b1-1', hand: 'left', start: 8, dur: 8, rest: false,
            notes: [{ D: 25, alter: 0, midi: 55 }], // G3
          },
        ],
      },
    ],
  };

  // À u = 2 (dans la 1ère moitié de la mesure 1):
  // Notes actives: C4 (60), E4 (64), C3 (48). Note la plus aiguë = E4 = Mi 4.
  // Accord: Do majeur (I)
  const infoU2 = getActivePlaybackInfo(mockScore, 2);
  assert.equal(infoU2.hasNote, true);
  assert.equal(infoU2.topNote, 'Mi 4');
  assert.equal(infoU2.topNoteMidi, 64);
  assert.equal(infoU2.chord, 'Do majeur (I)');
  assert.equal(infoU2.measureLabel, '1 / 2');

  // À u = 10 (dans la 2ème moitié de la mesure 1):
  // Notes actives: G4 (67), C3 (48). Note la plus aiguë = G4 = Sol 4.
  const infoU10 = getActivePlaybackInfo(mockScore, 10);
  assert.equal(infoU10.topNote, 'Sol 4');
  assert.equal(infoU10.chord, 'Do majeur (I)');
  assert.equal(infoU10.measureLabel, '1 / 2');

  // À u = 18 (mesure 2, début):
  // Accord: Fa majeur (IV). Note la plus aiguë = Si 4 (71).
  const infoU18 = getActivePlaybackInfo(mockScore, 18);
  assert.equal(infoU18.topNote, 'Si 4');
  assert.equal(infoU18.chord, 'Fa majeur (IV)');
  assert.equal(infoU18.measureLabel, '2 / 2');

  // À u = 26 (mesure 2, fin):
  // Accord: Sol 7 (V7). Note la plus aiguë = Do 5 (72).
  const infoU26 = getActivePlaybackInfo(mockScore, 26);
  assert.equal(infoU26.topNote, 'Do 5');
  assert.equal(infoU26.chord, 'Sol 7 (V7)');
  assert.equal(infoU26.measureLabel, '2 / 2');
});

test('gravure VexFlow : la signature 6/8 et les mesures composées ne génèrent aucune exception (notamment setTempo)', async () => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const win = {};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/vendor/vexflow.js', import.meta.url), 'utf8'), {
    window: win,
    globalThis: win,
  });
  const VF = win.Vex.Flow;
  assert.ok(VF, 'VexFlow doit être chargé');

  const mockCtx = new Proxy({}, {
    get: (target, prop) => (prop === 'checkContext' ? () => mockCtx : () => {}),
  });

  // Test de setTempo pour toutes les signatures, en particulier les composées 6/8 et 12/8
  for (const ts of TIME_SIGNATURES) {
    const meter = meterInfo(ts);
    const stave = new VF.Stave(0, 0, 400);
    stave.addTimeSignature(meter.ts);

    // Reproduit exactement le code de renderer.js
    const dur = 'q';
    const dots = meter.compound ? 1 : 0;
    stave.setTempo({ name: 'Allegro', bpm: 120, duration: dur, dots }, 0);
    stave.setContext(mockCtx);

    assert.doesNotThrow(() => {
      stave.draw();
    }, `stave.draw() ne doit pas lancer d'erreur pour ${ts}`);
  }
});

test('complexité rythmique dès le niveau intermédiaire : soupirs, contretemps, triolets, duolets et rendu VexFlow', async () => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const win = {};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/vendor/vexflow.js', import.meta.url), 'utf8'), {
    window: win,
    globalThis: win,
  });
  const VF = win.Vex.Flow;
  const mockCtx = new Proxy({}, {
    get: (target, prop) => (prop === 'checkContext' ? () => mockCtx : prop === 'measureText' ? () => ({ width: 10 }) : () => {}),
  });
  const DURATIONS = {
    1: ['16', 0], 2: ['8', 0], 3: ['8', 1], 4: ['q', 0], 6: ['q', 1],
    8: ['h', 0], 12: ['h', 1], 16: ['w', 0], 24: ['w', 1],
  };

  let hasRest = false;
  let hasTriplet = false;
  let hasDuplet = false;
  let hasOffbeat = false;
  let bassHasRest = false;
  let bassHasTriplet = false;
  let bassHasDuplet = false;
  let bassHasOffbeat = false;

  for (const level of ['intermediaire', 'avance', 'expert']) {
    for (const ts of ['4/4', '3/4', '6/8', '2/2']) {
      for (let seed = 1; seed <= 8; seed++) {
        const score = generateScore(baseSettings({ timeSignature: ts, measures: 8, level, hands: 'both', bpm: 100 }), seed);
        const bytes = midiFileBytes(score, 100);
        assert.ok(bytes.length > 20);

        const beamGroups = [new VF.Fraction(score.meter.den === 8 && score.meter.num === 3 ? 6 : score.meter.beatLen, 16)];
        for (const m of score.measures) {
          for (const [staff, clef] of [[m.treble, 'treble'], [m.bass, 'bass']]) {
            if (!staff) continue;
            const tupletGroups = new Map();
            const tuplets = [];
            const notes = staff.map((ev) => {
              if (ev.rest) { hasRest = true; if (clef === 'bass') bassHasRest = true; }
              if (ev.tuplet?.num === 3) { hasTriplet = true; if (clef === 'bass') bassHasTriplet = true; }
              if (ev.tuplet?.num === 2) { hasDuplet = true; if (clef === 'bass') bassHasDuplet = true; }
              if (!ev.rest && ev.start % score.meter.beatLen !== 0) { hasOffbeat = true; if (clef === 'bass') bassHasOffbeat = true; }

              const [base, dots] = DURATIONS[ev.notationDur ?? ev.dur];
              const dur = base + 'd'.repeat(dots);
              const note = ev.rest
                ? new VF.StaveNote({ clef, keys: [clef === 'treble' ? 'b/4' : 'd/3'], duration: `${dur}r` })
                : new VF.StaveNote({ clef, keys: ev.notes.map(() => 'c/4'), duration: dur });
              if (dots) VF.Dot.buildAndAttach([note], { all: true });
              if (ev.tuplet) {
                let grp = tupletGroups.get(ev.tuplet.id);
                if (!grp) { grp = { meta: ev.tuplet, notes: [] }; tupletGroups.set(ev.tuplet.id, grp); }
                grp.notes.push(note);
              }
              return note;
            });
            for (const { meta, notes: tNotes } of tupletGroups.values()) {
              tuplets.push(new VF.Tuplet(tNotes, { num_notes: meta.num, notes_occupied: meta.occupied }));
            }
            const stave = new VF.Stave(0, 0, 400);
            const voice = new VF.Voice({ num_beats: score.meter.num, beat_value: score.meter.den })
              .setMode(VF.Voice.Mode.SOFT)
              .addTickables(notes);
            voice.setStave(stave);
            const beams = VF.Beam.generateBeams(notes, { groups: beamGroups });
            new VF.Formatter().joinVoices([voice]).format([voice], 350);
            voice.draw(mockCtx, stave);
            beams.forEach((b) => b.setContext(mockCtx).draw());
            tuplets.forEach((t) => t.setContext(mockCtx).draw());
          }
        }
      }
    }
  }

  assert.ok(hasRest, 'Doit générer des soupirs / silences');
  assert.ok(hasOffbeat, 'Doit générer des contretemps / syncopes');
  assert.ok(hasTriplet, 'Doit générer des triolets');
  assert.ok(hasDuplet, 'Doit générer des duolets en mesure composée');
  assert.ok(bassHasRest, 'La main gauche doit aussi générer des soupirs / silences');
  assert.ok(bassHasOffbeat, 'La main gauche doit aussi générer des contretemps / syncopes');
  assert.ok(bassHasTriplet, 'La main gauche doit aussi générer des triolets');
  assert.ok(bassHasDuplet, 'La main gauche doit aussi générer des duolets en mesure composée');
});

test('appogiatures : génération, respect de l ambitus, lecture/MIDI et gravure VexFlow', async () => {
  const { buildNoteEvents } = await import('../docs/js/events.js');
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const win = {};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/vendor/vexflow.js', import.meta.url), 'utf8'), {
    window: win,
    globalThis: win,
  });
  const VF = win.Vex.Flow;
  const mockCtx = new Proxy({}, {
    get: (target, prop) => (prop === 'checkContext' ? () => mockCtx : prop === 'measureText' ? () => ({ width: 10 }) : () => {}),
  });

  let foundApp = false;
  for (const level of ['intermediaire', 'avance', 'expert']) {
    for (let seed = 1; seed <= 12; seed++) {
      const score = generateScore(baseSettings({ timeSignature: '4/4', measures: 8, level, hands: 'both', minNote: 'C3', maxNote: 'G5' }), seed);
      const minD = score.params.minD;
      const maxD = score.params.maxD;
      for (const m of score.measures) {
        for (const ev of (m.treble || [])) {
          if (ev.appoggiatura) {
            foundApp = true;
            assert.ok(ev.appoggiatura.D >= minD && ev.appoggiatura.D <= maxD, 'appogiature dans l ambitus');
            assert.notEqual(ev.appoggiatura.D, ev.notes[0].D);
          }
        }
      }
      const noteEvs = buildNoteEvents(score);
      assert.ok(noteEvs.length > 0);
      const bytes = midiFileBytes(score, 100);
      assert.ok(bytes.length > 20);
    }
  }
  assert.ok(foundApp, 'Doit générer des appogiatures à partir du niveau intermédiaire');

  // Vérification gravure VexFlow d'une appogiature avec altération accidentelle
  const stave = new VF.Stave(0, 0, 400).addClef('treble').addTimeSignature('4/4');
  const n1 = new VF.StaveNote({ clef: 'treble', keys: ['c/5'], duration: 'h', auto_stem: true });
  const gn = new VF.GraceNote({ clef: 'treble', keys: ['b/4'], duration: '8', slash: false });
  gn.addModifier(new VF.Accidental('#'), 0);
  n1.addModifier(new VF.GraceNoteGroup([gn], false), 0);
  const n2 = new VF.StaveNote({ clef: 'treble', keys: ['d/5'], duration: 'h', auto_stem: true });
  const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables([n1, n2]);
  voice.setStave(stave);
  new VF.Formatter().joinVoices([voice]).format([voice], 350);
  assert.doesNotThrow(() => voice.draw(mockCtx, stave));
});



