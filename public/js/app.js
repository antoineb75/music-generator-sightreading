// ─────────────────────────────────────────────────────────────
//  Application principale : coordination UI, Moteur, Audio & Rendu
// ─────────────────────────────────────────────────────────────

import { KEYS, getKey, MINOR_TYPE_LABELS, PIANO_NOTES, noteToD, frNoteLabel, analyzeScoreAmbitus } from './theory.js';
import { generateScore, LEVEL_LABELS, HAND_LABELS, ENRICHED_LABELS, tempoItalianName } from './generator.js';
import { newSeed } from './rng.js';
import { ScoreRenderer } from './renderer.js';
import { updateAmbitusDisplay } from './ambitus-ribbon.js';
import { PianoSynth } from './piano-synth.js';
import { MidiOut } from './midi.js';
import { Player } from './player.js';
import { midiFileBytes } from './midi-file.js';
import {
  loadSettings,
  saveSettings,
  loadLastSeed,
  saveLastSeed,
} from './settings.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ── Éléments DOM ──────────────────────────────────────────
  const selectKey = document.getElementById('select-key');
  const selectMinorType = document.getElementById('select-minor-type');
  const groupMinorType = document.getElementById('group-minor-type');
  const selectTimeSig = document.getElementById('select-time-sig');
  const inputMeasures = document.getElementById('input-measures');
  const badgeMeasures = document.getElementById('badge-measures');
  const selectLevel = document.getElementById('select-level');
  const selectHands = document.getElementById('select-hands');
  const selectEnriched = document.getElementById('select-enriched');
  const selectMinNote = document.getElementById('select-min-note');
  const selectMaxNote = document.getElementById('select-max-note');

  const rndKey = document.getElementById('rnd-key');
  const rndMinorType = document.getElementById('rnd-minor-type');
  const rndTimeSig = document.getElementById('rnd-time-sig');
  const rndMeasures = document.getElementById('rnd-measures');
  const rndLevel = document.getElementById('rnd-level');
  const rndHands = document.getElementById('rnd-hands');
  const rndEnriched = document.getElementById('rnd-enriched');
  const rndMinNote = document.getElementById('rnd-min-note');
  const rndMaxNote = document.getElementById('rnd-max-note');

  const btnGenerate = document.getElementById('btn-generate');
  const btnPlay = document.getElementById('btn-play');
  const iconPlay = document.getElementById('icon-play');
  const labelPlay = document.getElementById('label-play');
  const btnStop = document.getElementById('btn-stop');
  const checkMetronome = document.getElementById('check-metronome');
  const inputBpm = document.getElementById('input-bpm');
  const badgeBpm = document.getElementById('badge-bpm');
  const selectOutput = document.getElementById('select-output');
  const selectMidiDevice = document.getElementById('select-midi-device');

  const btnPrint = document.getElementById('btn-print');
  const btnDownloadMidi = document.getElementById('btn-download-midi');
  const btnTogglePanel = document.getElementById('btn-toggle-panel');
  const panelSettings = document.getElementById('panel-settings');
  const scoreContainer = document.getElementById('score-container');
  const scoreTitle = document.getElementById('score-title');
  const scoreDetails = document.getElementById('score-details');
  const ambitusCard = document.getElementById('ambitus-card');

  // ── Remplissage des tonalités ─────────────────────────────
  const majorGroup = document.createElement('optgroup');
  majorGroup.label = 'Tonalités Majeures';
  const minorGroup = document.createElement('optgroup');
  minorGroup.label = 'Tonalités Mineures';

  KEYS.forEach((k) => {
    const opt = document.createElement('option');
    opt.value = k.id;
    opt.textContent = `${k.name} ${k.sigLabel ? `(${k.sigLabel})` : ''}`.trim();
    if (k.mode === 'major') majorGroup.appendChild(opt);
    else minorGroup.appendChild(opt);
  });
  selectKey.appendChild(majorGroup);
  selectKey.appendChild(minorGroup);

  // ── Remplissage des notes d'ambitus (min & max) ───────────
  const OCTAVE_LABELS = {
    1: 'Octave 1 (Grave)',
    2: 'Octave 2 (Basse standard)',
    3: 'Octave 3 (Médium grave)',
    4: 'Octave 4 (Médium / Clé de Sol)',
    5: 'Octave 5 (Aigu)',
    6: 'Octave 6 (Sur-aigu)',
    7: 'Octave 7',
  };

  function populateNoteSelect(selectEl) {
    selectEl.innerHTML = '';
    const groups = {};
    for (let oct = 1; oct <= 7; oct++) {
      const g = document.createElement('optgroup');
      g.label = OCTAVE_LABELS[oct] || `Octave ${oct}`;
      groups[oct] = g;
      selectEl.appendChild(g);
    }
    PIANO_NOTES.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.label;
      if (groups[n.octave]) groups[n.octave].appendChild(opt);
    });
  }
  populateNoteSelect(selectMinNote);
  populateNoteSelect(selectMaxNote);

  // ── Initialisation des modules ────────────────────────────
  const synth = new PianoSynth();
  const midi = new MidiOut();
  let currentScore = null;

  const renderer = new ScoreRenderer(scoreContainer, {
    onNoteClick: (evId) => {
      // Écoute ponctuelle d'une note en cliquant dessus
      if (!currentScore) return;
      const allEvs = currentScore.measures.flatMap((m) => [m.treble, m.bass].filter(Boolean).flat());
      const ev = allEvs.find((e) => e.id === evId);
      if (!ev || ev.rest) return;
      synth.ensure().then(() => {
        ev.notes.forEach((n) => synth.playNote(n.midi, synth.now, 0.7, 85));
      });
      renderer.highlight(evId, true);
      setTimeout(() => renderer.highlight(evId, false), 400);
    },
  });

  const player = new Player({
    synth,
    midi,
    onNoteOn: (id) => renderer.highlight(id, true),
    onNoteOff: (id) => renderer.highlight(id, false),
    onPosition: (u) => {
      if (!currentScore) return;
      const mIdx = Math.floor(u / currentScore.meter.measureLen);
      renderer.followMeasure(mIdx);
    },
    onStateChange: (state) => {
      if (state === 'playing') {
        iconPlay.textContent = '⏸';
        labelPlay.textContent = 'Pause';
        btnPlay.classList.add('is-active');
      } else if (state === 'paused') {
        iconPlay.textContent = '▶';
        labelPlay.textContent = 'Reprendre';
        btnPlay.classList.remove('is-active');
      } else {
        iconPlay.textContent = '▶';
        labelPlay.textContent = 'Jouer';
        btnPlay.classList.remove('is-active');
        renderer.clearHighlights();
        renderer.resetFollow();
      }
    },
  });

  // ── Chargement des derniers réglages enregistrés ───────────
  let settings = loadSettings();

  function applySettingsToUI() {
    selectKey.value = settings.key || 'C';
    selectMinorType.value = settings.minorType || 'harmonic';
    selectTimeSig.value = settings.timeSignature || '4/4';
    inputMeasures.value = settings.measures || 8;
    badgeMeasures.textContent = settings.measures || 8;
    selectLevel.value = settings.level || 'debutant';
    selectHands.value = settings.hands || 'both';
    selectEnriched.value = settings.enrichedChords || 'auto';
    selectMinNote.value = settings.minNote || 'C2';
    selectMaxNote.value = settings.maxNote || 'C6';
    inputBpm.value = settings.bpm || 90;
    const itName = tempoItalianName(settings.bpm || 90);
    badgeBpm.textContent = `${settings.bpm || 90} BPM (${itName})`;
    checkMetronome.checked = !!settings.metronome;
    selectOutput.value = settings.output || 'synth';

    rndKey.checked = !!settings.random.key;
    rndMinorType.checked = !!settings.random.minorType;
    rndTimeSig.checked = !!settings.random.timeSignature;
    rndMeasures.checked = !!settings.random.measures;
    rndLevel.checked = !!settings.random.level;
    rndHands.checked = !!settings.random.hands;
    rndEnriched.checked = !!settings.random.enrichedChords;
    rndMinNote.checked = !!settings.random.minNote;
    rndMaxNote.checked = !!settings.random.maxNote;

    updateMinorVisibility();
    updateRandomDisableStates();
    player.setTempo(settings.bpm || 90);
    player.metronome = !!settings.metronome;
    player.setOutput(settings.output || 'synth');
  }

  function setBpmValue(val, syncPlayer = true) {
    const bpm = Math.min(240, Math.max(40, parseInt(val, 10) || 90));
    const it = tempoItalianName(bpm);
    inputBpm.value = bpm;
    badgeBpm.textContent = `${bpm} BPM (${it})`;
    settings.bpm = bpm;
    if (syncPlayer) player.setTempo(bpm);
    saveSettings(settings);
  }

  function ensureNoteRangeOrder(changedSource = 'min') {
    const minD = noteToD(selectMinNote.value);
    const maxD = noteToD(selectMaxNote.value);
    if (minD > maxD) {
      if (changedSource === 'min') {
        selectMaxNote.value = selectMinNote.value;
      } else {
        selectMinNote.value = selectMaxNote.value;
      }
    }
  }

  function readSettingsFromUI() {
    ensureNoteRangeOrder();
    settings.key = selectKey.value;
    settings.minorType = selectMinorType.value;
    settings.timeSignature = selectTimeSig.value;
    settings.measures = parseInt(inputMeasures.value, 10);
    settings.level = selectLevel.value;
    settings.hands = selectHands.value;
    settings.enrichedChords = selectEnriched.value;
    settings.minNote = selectMinNote.value;
    settings.maxNote = selectMaxNote.value;
    settings.bpm = parseInt(inputBpm.value, 10);
    settings.metronome = checkMetronome.checked;
    settings.output = selectOutput.value;

    settings.random = {
      key: rndKey.checked,
      minorType: rndMinorType.checked,
      timeSignature: rndTimeSig.checked,
      measures: rndMeasures.checked,
      level: rndLevel.checked,
      hands: rndHands.checked,
      enrichedChords: rndEnriched.checked,
      minNote: rndMinNote.checked,
      maxNote: rndMaxNote.checked,
    };
    saveSettings(settings);
  }

  function updateMinorVisibility() {
    const k = getKey(selectKey.value);
    const isMinor = k.mode === 'minor';
    groupMinorType.style.display = isMinor || rndKey.checked ? 'flex' : 'none';
  }

  function updateRandomDisableStates() {
    selectKey.disabled = rndKey.checked;
    selectMinorType.disabled = rndMinorType.checked;
    selectTimeSig.disabled = rndTimeSig.checked;
    inputMeasures.disabled = rndMeasures.checked;
    selectLevel.disabled = rndLevel.checked;
    selectHands.disabled = rndHands.checked;
    selectEnriched.disabled = rndEnriched.checked;
    selectMinNote.disabled = rndMinNote.checked;
    selectMaxNote.disabled = rndMaxNote.checked;
  }

  // ── Gestion de la sortie MIDI ──────────────────────────────
  async function setupMidiOutput() {
    if (!MidiOut.supported) {
      const opt = selectOutput.querySelector('option[value="midi"]');
      if (opt) opt.textContent = '🎛️ MIDI (Non supporté par ce navigateur)';
      return;
    }
    try {
      await midi.init();
      const refreshDevices = () => {
        const devices = midi.outputs();
        selectMidiDevice.innerHTML = '';
        if (devices.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '(Aucun instrument MIDI détecté)';
          selectMidiDevice.appendChild(opt);
          selectMidiDevice.disabled = true;
        } else {
          selectMidiDevice.disabled = false;
          devices.forEach((d) => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.name;
            selectMidiDevice.appendChild(opt);
          });
          const target = settings.midiOutputId || devices[0].id;
          selectMidiDevice.value = target;
          midi.select(target);
        }
      };
      midi.onChange = refreshDevices;
      refreshDevices();
    } catch (e) {
      console.warn('Web MIDI non accessible:', e);
    }
  }

  function updateOutputVisibility() {
    const isMidi = selectOutput.value === 'midi';
    selectMidiDevice.style.display = isMidi ? 'inline-block' : 'none';
    player.setOutput(isMidi ? 'midi' : 'synth');
  }

  // ── Génération et Rendu ────────────────────────────────────
  function doGenerate(forceNewSeed = true) {
    readSettingsFromUI();
    let seed = forceNewSeed ? newSeed() : loadLastSeed();
    if (!seed) seed = newSeed();
    saveLastSeed(seed);

    player.stop();

    const score = generateScore(settings, seed);
    currentScore = score;
    player.load(score);

    // Métadonnées
    const p = score.params;
    setBpmValue(p.bpm);
    const itName = tempoItalianName(p.bpm);
    const modeStr = score.key.mode === 'minor'
      ? `mineur (${MINOR_TYPE_LABELS[score.scale.minorType] || 'harmonique'})`
      : 'majeur';
    scoreTitle.textContent = `Partition de piano en ${score.key.name.replace(/ mineur| majeur/, '')} ${modeStr}`;
    const extLabel = p.extensionType === 'extended' ? '9e/11e/13e' : p.extensionType === 'seventh' ? '7èmes' : 'triades';
    const enrichedDesc = (p.enrichRight && p.enrichLeft)
      ? `Deux mains (${extLabel})`
      : p.enrichRight
        ? `Main droite seule (${extLabel})`
        : p.enrichLeft
          ? `Main gauche seule (${extLabel})`
          : 'Désactivé (triades)';

    // Analyse précise de l'ambitus réel utilisé
    const ambitus = analyzeScoreAmbitus(score);
    updateAmbitusDisplay(ambitusCard, ambitus, p);

    scoreDetails.innerHTML = `
      <span>Tonalité : <strong>${score.key.name}</strong></span>
      <span>•</span>
      <span>Mesure : <strong>${p.timeSignature}</strong></span>
      <span>•</span>
      <span>Tempo : <strong>${p.bpm} BPM (${itName})</strong></span>
      <span>•</span>
      <span><strong>${p.measures}</strong> mesures</span>
      <span>•</span>
      <span>Niveau : <strong>${LEVEL_LABELS[p.level]}</strong></span>
      <span>•</span>
      <span>Mains : <strong>${HAND_LABELS[p.hands]}</strong></span>
      <span>•</span>
      <span>Ambitus : <strong>${ambitus.minFr} (${ambitus.minNote}) → ${ambitus.maxFr} (${ambitus.maxNote})</strong> (${ambitus.intervalLabel})</span>
      <span>•</span>
      <span>Accords enrichis : <strong>${enrichedDesc}</strong></span>
    `;

    renderCurrentScore();
  }

  function renderCurrentScore() {
    if (!currentScore) return;
    const width = scoreContainer.clientWidth;
    renderer.render(currentScore, { width });
  }

  // ── Événements UI ──────────────────────────────────────────
  [selectKey, selectMinorType, selectTimeSig, selectLevel, selectHands, selectEnriched].forEach((el) => {
    el.addEventListener('change', () => {
      readSettingsFromUI();
      updateMinorVisibility();
    });
  });

  selectMinNote.addEventListener('change', () => {
    ensureNoteRangeOrder('min');
    readSettingsFromUI();
  });

  selectMaxNote.addEventListener('change', () => {
    ensureNoteRangeOrder('max');
    readSettingsFromUI();
  });

  inputMeasures.addEventListener('input', () => {
    badgeMeasures.textContent = inputMeasures.value;
    readSettingsFromUI();
  });

  inputBpm.addEventListener('input', () => {
    setBpmValue(inputBpm.value);
  });

  checkMetronome.addEventListener('change', () => {
    player.metronome = checkMetronome.checked;
    readSettingsFromUI();
  });

  [rndKey, rndMinorType, rndTimeSig, rndMeasures, rndLevel, rndHands, rndEnriched, rndMinNote, rndMaxNote].forEach((cb) => {
    cb.addEventListener('change', () => {
      readSettingsFromUI();
      updateRandomDisableStates();
      updateMinorVisibility();
    });
  });

  selectOutput.addEventListener('change', async () => {
    readSettingsFromUI();
    updateOutputVisibility();
    if (selectOutput.value === 'midi') {
      await setupMidiOutput();
    }
  });

  selectMidiDevice.addEventListener('change', () => {
    midi.select(selectMidiDevice.value);
    settings.midiOutputId = selectMidiDevice.value;
    saveSettings(settings);
  });

  btnGenerate.addEventListener('click', () => doGenerate(true));

  btnPlay.addEventListener('click', async () => {
    try {
      await player.toggle();
    } catch (e) {
      alert(`Erreur de lecture : ${e.message}`);
    }
  });

  btnStop.addEventListener('click', () => player.stop());

  // Téléchargement du fichier MIDI
  btnDownloadMidi.addEventListener('click', () => {
    if (!currentScore) return;
    const bpm = parseInt(inputBpm.value, 10);
    const bytes = midiFileBytes(currentScore, bpm);
    const blob = new Blob([bytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partition-${currentScore.key.id}-${currentScore.params.timeSignature.replace('/', '-')}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Impression
  btnPrint.addEventListener('click', () => {
    window.print();
  });

  // Repli du panneau des paramètres
  btnTogglePanel.addEventListener('click', () => {
    panelSettings.classList.toggle('collapsed');
    const isCollapsed = panelSettings.classList.contains('collapsed');
    btnTogglePanel.textContent = isCollapsed ? 'Afficher ▼' : 'Masquer ▲';
    btnTogglePanel.setAttribute('aria-expanded', String(!isCollapsed));
  });

  // Re-gravure adaptative lors d'un redimensionnement écran (débouncé)
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderCurrentScore();
    }, 150);
  });

  // ── Démarrage ──────────────────────────────────────────────
  applySettingsToUI();
  updateOutputVisibility();
  if (settings.output === 'midi') setupMidiOutput();

  // Génère la partition initiale (en restaurant la dernière ou en créant une nouvelle)
  doGenerate(false);
});
