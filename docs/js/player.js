// ─────────────────────────────────────────────────────────────
//  Séquenceur : lecture de la partition (synthé piano ou MIDI)
// ─────────────────────────────────────────────────────────────
//
// Planification « à anticipation » : toutes les 25 ms on programme les
// notes des 200 ms à venir sur l'horloge précise (AudioContext ou
// performance.now pour le MIDI). Le surlignage visuel est synchronisé
// sur la même horloge via requestAnimationFrame.

import { buildNoteEvents, buildBeatEvents } from './events.js';

const LOOKAHEAD = 0.2;
const TICK_MS = 25;

export class Player {
  constructor({ synth, midi, onNoteOn, onNoteOff, onPosition, onStateChange }) {
    this.synth = synth;
    this.midi = midi;
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onPosition = onPosition;
    this.onStateChange = onStateChange;
    this.output = 'synth';
    this.bpm = 90;
    this.metronome = false;
    this.state = 'stopped';
    this.score = null;
    this.notes = [];
    this.beats = [];
    this.posU = 0;
    this.visual = [];
    this.lit = new Map();
  }

  load(score) {
    this.stop();
    this.score = score;
    this.notes = buildNoteEvents(score);
    this.beats = buildBeatEvents(score);
    this.posU = 0;
  }

  get beatLen() {
    return this.score?.meter?.beatLen ?? 4;
  }

  get spu() {
    // Étalonnage universel : 1 battement (beatLen unités) = 60 / this.bpm secondes.
    // À 60 BPM, 1 battement dure EXACTEMENT 1.000000 seconde (60 battements par minute).
    return 60 / (this.bpm * this.beatLen);
  }

  clock() {
    return this.output === 'midi' ? performance.now() / 1000 : this.synth.now;
  }

  timeOf(u) {
    return this.anchorTime + (u - this.anchorU) * this.spu;
  }

  unitsAt(t) {
    return this.anchorU + (t - this.anchorTime) / this.spu;
  }

  setTempo(bpm) {
    if (this.state === 'playing') {
      const t = this.clock();
      this.anchorU = this.unitsAt(t);
      this.anchorTime = t;
    }
    this.bpm = bpm;
  }

  setOutput(output) {
    if (output === this.output) return;
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) this.pause();
    this.output = output;
  }

  /** Positionne la tête de lecture (en unités). */
  seek(u) {
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) this.#halt();
    this.posU = Math.max(0, Math.min(u, this.score?.totalUnits ?? 0));
    this.onPosition?.(this.posU);
    if (wasPlaying) this.play();
    else if (this.state === 'stopped' && this.posU > 0) this.#setState('paused');
  }

  async play() {
    if (!this.score || this.state === 'playing' || this.starting) return;
    this.starting = true;
    try {
      if (this.output === 'synth') await this.synth.ensure();
      else if (!this.midi.ready) throw new Error('Aucune sortie MIDI sélectionnée.');
    } finally {
      this.starting = false;
    }
    if (this.state === 'playing') return;

    if (this.posU >= this.score.totalUnits) this.posU = 0;
    this.anchorTime = this.clock() + 0.05; // 50ms de latence de démarrage immédiate
    this.anchorU = this.posU;
    this.noteIdx = this.notes.findIndex((n) => n.u >= this.posU);
    if (this.noteIdx < 0) this.noteIdx = this.notes.length;
    this.beatIdx = this.beats.findIndex((b) => b.u >= this.posU);
    if (this.beatIdx < 0) this.beatIdx = this.beats.length;

    if (this.output === 'midi') {
      const t = this.clock();
      this.midi.programChange(0, 0, t);
      this.midi.programChange(1, 0, t);
    }

    this.#setState('playing');
    this.timer = setInterval(() => this.#tick(), TICK_MS);
    this.#tick();
    if (typeof requestAnimationFrame === 'function') {
      this.raf = requestAnimationFrame(() => this.#frame());
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.posU = Math.max(0, Math.min(this.score.totalUnits, this.unitsAt(this.clock())));
    this.#halt();
    this.#setState('paused');
  }

  stop() {
    this.#halt();
    this.posU = 0;
    this.onPosition?.(0);
    this.#setState('stopped');
  }

  toggle() {
    return this.state === 'playing' ? this.pause() : this.play();
  }

  #setState(s) {
    this.state = s;
    this.onStateChange?.(s);
  }

  #halt() {
    clearInterval(this.timer);
    if (typeof cancelAnimationFrame === 'function' && this.raf) {
      cancelAnimationFrame(this.raf);
    }
    this.timer = null;
    if (this.output === 'synth') this.synth.stopAll();
    else this.midi.allNotesOff();
    for (const id of this.lit.keys()) this.onNoteOff?.(id);
    this.lit.clear();
    this.visual = [];
  }

  #tick() {
    const horizon = this.clock() + LOOKAHEAD;
    const spu = this.spu;
    while (this.noteIdx < this.notes.length && this.timeOf(this.notes[this.noteIdx].u) < horizon) {
      const n = this.notes[this.noteIdx++];
      const t = this.timeOf(n.u);
      const d = n.durU * spu;
      const gate = d * 0.95;
      if (this.output === 'synth') {
        this.synth.playNote(n.midi, t, gate, n.vel);
      } else {
        this.midi.noteOn(n.channel, n.midi, n.vel, t);
        this.midi.noteOff(n.channel, n.midi, t + gate);
      }
      this.visual.push({ id: n.id, on: t, off: t + d - 0.015, started: false });
    }
    if (this.metronome) {
      while (this.beatIdx < this.beats.length && this.timeOf(this.beats[this.beatIdx].u) < horizon) {
        const b = this.beats[this.beatIdx++];
        const t = this.timeOf(b.u);
        if (this.output === 'synth') this.synth.click(t, b.accent);
        else {
          this.midi.noteOn(9, b.accent ? 76 : 77, b.accent ? 110 : 80, t);
          this.midi.noteOff(9, b.accent ? 76 : 77, t + 0.05);
        }
      }
    } else {
      while (this.beatIdx < this.beats.length && this.timeOf(this.beats[this.beatIdx].u) < horizon) this.beatIdx++;
    }
    if (this.noteIdx >= this.notes.length && this.clock() > this.timeOf(this.score.totalUnits) + 0.15) {
      this.stop();
    }
  }

  #frame() {
    if (this.state !== 'playing') return;
    const now = this.clock();
    const keep = [];
    for (const v of this.visual) {
      if (!v.started && now >= v.on) {
        v.started = true;
        const c = this.lit.get(v.id) || 0;
        this.lit.set(v.id, c + 1);
        if (c === 0) this.onNoteOn?.(v.id);
      }
      if (v.started && now >= v.off) {
        const c = (this.lit.get(v.id) || 1) - 1;
        if (c <= 0) { this.lit.delete(v.id); this.onNoteOff?.(v.id); } else this.lit.set(v.id, c);
        continue;
      }
      keep.push(v);
    }
    this.visual = keep;
    const u = this.unitsAt(now);
    if (u >= 0) this.onPosition?.(Math.min(u, this.score.totalUnits));
    if (typeof requestAnimationFrame === 'function') {
      this.raf = requestAnimationFrame(() => this.#frame());
    }
  }
}
