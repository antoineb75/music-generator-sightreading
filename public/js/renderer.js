// ─────────────────────────────────────────────────────────────
//  Gravure de la partition avec VexFlow (SVG), mise en page adaptative
// ─────────────────────────────────────────────────────────────

import { letterOf, octaveOf, vexKey } from './theory.js';
import { tempoItalianName } from './generator.js';

const VF = window.Vex?.Flow ?? window.Vex;

const DURATIONS = {
  1: ['16', 0], 2: ['8', 0], 3: ['8', 1], 4: ['q', 0], 6: ['q', 1],
  8: ['h', 0], 12: ['h', 1], 16: ['w', 0], 24: ['w', 1],
};
const ACCIDENTALS = { '-2': 'bb', '-1': 'b', 0: 'n', 1: '#', 2: '##' };

// Géométrie (unités logiques VexFlow)
const TREBLE_Y = 0;
const BASS_Y_GRAND = 100;
const STAVE_HEIGHT = 125;

/** Altérations accidentelles d'une portée sur une mesure (règles usuelles). */
function computeAccidentals(events, key) {
  const state = new Map();
  return events.map((ev) => ev.notes.map((n) => {
    const k = `${letterOf(n.D)}-${octaveOf(n.D)}`;
    const current = state.has(k) ? state.get(k) : key.signature[letterOf(n.D)];
    if (n.alter === current) return null;
    state.set(k, n.alter);
    return ACCIDENTALS[n.alter];
  }));
}

function eventWidth(ev, accs) {
  let w = 24 + Math.min(ev.dur, 8) * 1.6;
  if (DURATIONS[ev.dur][1]) w += 7;
  w += accs.filter(Boolean).length * 9;
  return w;
}

export class ScoreRenderer {
  constructor(container, { onNoteClick } = {}) {
    this.container = container;
    this.onNoteClick = onNoteClick;
    this.elements = new Map(); // id d'événement -> [SVGElement]
    this.systemOfMeasure = [];
    this.currentSystem = -1;
    this.lastWidth = 0;
    container.addEventListener('click', (e) => {
      const el = e.target.closest('[data-ev-id]');
      if (el) this.onNoteClick?.(el.dataset.evId);
    });
  }

  clear() {
    this.container.innerHTML = '';
    this.elements.clear();
  }

  render(score, { width, print = false } = {}) {
    this.score = score;
    this.clear();
    if (!VF) {
      this.container.textContent = 'Erreur : la librairie VexFlow est introuvable.';
      return;
    }
    const W = Math.max(280, Math.floor(width ?? this.container.clientWidth ?? 800));
    this.lastWidth = W;
    const scale = print ? 0.74 : W < 480 ? 0.6 : W < 760 ? 0.76 : W < 1100 ? 0.9 : 1;
    const LW = W / scale;

    const { key, meter, measures, params } = score;
    const showTreble = params.hands !== 'left';
    const showBass = params.hands !== 'right';
    const grand = showTreble && showBass;
    const bassY = grand ? BASS_Y_GRAND : 0;
    const systemH = (grand ? BASS_Y_GRAND : 0) + STAVE_HEIGHT;

    // Pré-calcul des altérations et largeurs
    const prepared = measures.map((m) => {
      const tAcc = m.treble ? computeAccidentals(m.treble, key) : null;
      const bAcc = m.bass ? computeAccidentals(m.bass, key) : null;
      const wT = m.treble ? m.treble.reduce((s, ev, i) => s + eventWidth(ev, tAcc[i]), 0) : 0;
      const wB = m.bass ? m.bass.reduce((s, ev, i) => s + eventWidth(ev, bAcc[i]), 0) : 0;
      return { m, tAcc, bAcc, content: Math.max(wT, wB, 60) + 22 };
    });

    // Largeur des clés / armure / chiffrage
    const probe = (withClef, withTime) => {
      let best = 0;
      for (const clef of [showTreble && 'treble', showBass && 'bass'].filter(Boolean)) {
        const s = new VF.Stave(0, 0, 500);
        if (withClef) s.addClef(clef).addKeySignature(key.vexSpec);
        if (withTime) s.addTimeSignature(meter.ts);
        best = Math.max(best, s.getNoteStartX());
      }
      return best;
    };
    const plain = probe(false, false);
    const extraFirst = probe(true, true) - plain;
    const extraLine = probe(true, false) - plain;

    // Répartition en systèmes (lignes)
    const left = grand ? 28 : 10;
    const usable = LW - left - 10;
    const maxPerLine = print ? 4 : LW > 1300 ? 6 : 5;
    const lines = [];
    let line = [];
    let used = 0;
    prepared.forEach((p) => {
      let extra = line.length === 0 ? (lines.length === 0 ? extraFirst : extraLine) : 0;
      if (line.length && (used + p.content > usable || line.length >= maxPerLine)) {
        lines.push(line);
        line = [];
        used = 0;
        extra = extraLine;
      }
      line.push({ ...p, extra });
      used += p.content + extra;
    });
    if (line.length) lines.push(line);

    this.systemOfMeasure = [];
    this.currentSystem = -1;
    const beamGroups = [new VF.Fraction(meter.den === 8 && meter.num === 3 ? 6 : meter.beatLen, 16)];

    lines.forEach((items, li) => {
      const sumExtra = items.reduce((s, it) => s + it.extra, 0);
      const sumContent = items.reduce((s, it) => s + it.content, 0);
      const isLastLine = li === lines.length - 1;
      const stretch = isLastLine && sumExtra + sumContent < usable * 0.7 ? 1 : (usable - sumExtra) / sumContent;

      const div = document.createElement('div');
      div.className = 'system';
      div.dataset.system = String(li);
      this.container.appendChild(div);

      const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
      renderer.resize(W, Math.ceil(systemH * scale) + 4);
      const ctx = renderer.getContext();
      ctx.scale(scale, scale);
      const svg = div.querySelector('svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Système ${li + 1}`);

      let x = left;
      items.forEach((it, idx) => {
        const { m } = it;
        const w = it.extra + it.content * stretch;
        const isFirstOfLine = idx === 0;
        const isLastMeasure = m.index === measures.length - 1;
        this.systemOfMeasure[m.index] = li;

        const makeStave = (clef, y) => {
          const s = new VF.Stave(x, y, w);
          if (isFirstOfLine) {
            s.addClef(clef).addKeySignature(key.vexSpec);
            if (m.index === 0) s.addTimeSignature(meter.ts);
          }
          if (isLastMeasure) s.setEndBarType(VF.Barline.type.END);
          return s;
        };
        const tStave = showTreble ? makeStave('treble', TREBLE_Y) : null;
        const bStave = showBass ? makeStave('bass', bassY) : null;
        const topStave = tStave ?? bStave;
        if (isFirstOfLine && m.index > 0) topStave.setMeasure(m.index + 1);
        if (m.index === 0 && params.bpm) {
          const itName = tempoItalianName(params.bpm);
          const dur = meter.compound ? 'qd' : 'q';
          const dots = meter.compound ? 1 : 0;
          topStave.setTempo({ name: itName, bpm: params.bpm, duration: dur, dots }, 0);
        }

        if (tStave && bStave) {
          const startX = Math.max(tStave.getNoteStartX(), bStave.getNoteStartX());
          tStave.setNoteStartX(startX);
          bStave.setNoteStartX(startX);
        }
        [tStave, bStave].forEach((s) => s && s.setContext(ctx).draw());

        if (tStave && bStave) {
          if (isFirstOfLine) {
            new VF.StaveConnector(tStave, bStave).setType('brace').setContext(ctx).draw();
            new VF.StaveConnector(tStave, bStave).setType('singleLeft').setContext(ctx).draw();
          }
          new VF.StaveConnector(tStave, bStave)
            .setType(isLastMeasure ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();
        }

        // Notes
        const voices = [];
        const beams = [];
        const built = [];
        const formatter = new VF.Formatter();
        const buildStaff = (events, accs, clef, stave) => {
          const notes = events.map((ev, i) => {
            const [base, dots] = DURATIONS[ev.dur];
            const dur = base + 'd'.repeat(dots);
            let note;
            if (ev.rest) {
              note = new VF.StaveNote({ clef, keys: [clef === 'treble' ? 'b/4' : 'd/3'], duration: `${dur}r` });
            } else {
              note = new VF.StaveNote({ clef, keys: ev.notes.map((n) => vexKey(n.D)), duration: dur, auto_stem: true });
              accs[i].forEach((a, k) => { if (a) note.addModifier(new VF.Accidental(a), k); });
            }
            if (dots) VF.Dot.buildAndAttach([note], { all: true });
            built.push({ note, ev });
            return note;
          });
          const voice = new VF.Voice({ num_beats: meter.num, beat_value: meter.den })
            .setMode(VF.Voice.Mode.SOFT)
            .addTickables(notes);
          voice.setStave(stave);
          beams.push(...VF.Beam.generateBeams(notes, { groups: beamGroups }));
          formatter.joinVoices([voice]);
          voices.push({ voice, stave });
        };
        if (tStave) buildStaff(m.treble, it.tAcc, 'treble', tStave);
        if (bStave) buildStaff(m.bass, it.bAcc, 'bass', bStave);

        const noteWidth = topStave.getNoteEndX() - topStave.getNoteStartX() - 12;
        formatter.format(voices.map((v) => v.voice), Math.max(20, noteWidth));
        voices.forEach(({ voice, stave }) => voice.draw(ctx, stave));
        beams.forEach((b) => b.setContext(ctx).draw());

        for (const { note, ev } of built) {
          const el = note.getSVGElement?.() ?? null;
          if (!el) continue;
          if (!ev.rest) {
            el.dataset.evId = ev.id;
            el.classList.add('vf-note-clickable');
          }
          const list = this.elements.get(ev.id) ?? [];
          list.push(el);
          this.elements.set(ev.id, list);
        }
        x += w;
      });

      // SVG fluide
      svg.style.width = '100%';
      svg.style.height = 'auto';
    });
  }

  highlight(id, on) {
    const els = this.elements.get(id);
    if (!els) return;
    els.forEach((el) => el.classList.toggle('is-playing', on));
  }

  clearHighlights() {
    this.container.querySelectorAll('.is-playing').forEach((el) => el.classList.remove('is-playing'));
  }

  /** Fait défiler pour garder visible le système de la mesure courante. */
  followMeasure(measureIndex) {
    const sys = this.systemOfMeasure[measureIndex];
    if (sys == null || sys === this.currentSystem) return;
    this.currentSystem = sys;
    this.container.querySelectorAll('.system.is-current').forEach((el) => el.classList.remove('is-current'));
    const el = this.container.querySelector(`.system[data-system="${sys}"]`);
    if (!el) return;
    el.classList.add('is-current');
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 20) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  resetFollow() {
    this.currentSystem = -1;
    this.container.querySelectorAll('.system.is-current').forEach((el) => el.classList.remove('is-current'));
  }
}
