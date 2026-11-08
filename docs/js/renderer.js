// ─────────────────────────────────────────────────────────────
//  Gravure de la partition avec VexFlow (SVG), mise en page adaptative
// ─────────────────────────────────────────────────────────────

import { letterOf, octaveOf, vexKey, analyzeScoreAmbitus, dToNote, frNoteLabel } from './theory.js';
import { tempoItalianName } from './generator.js';

const VF = window.Vex?.Flow ?? window.Vex;

const DURATIONS = {
  1: ['16', 0], 2: ['8', 0], 3: ['8', 1], 4: ['q', 0], 6: ['q', 1],
  8: ['h', 0], 12: ['h', 1], 16: ['w', 0], 24: ['w', 1],
};
const ACCIDENTALS = { '-2': 'bb', '-1': 'b', 0: 'n', 1: '#', 2: '##' };

// Hauteur standard d'une portée de 5 lignes (4 interlignes de 10px)
const STAVE_SPAN = 40;

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
  let w = 26 + Math.min(ev.dur, 8) * 1.8;
  if (DURATIONS[ev.dur][1]) w += 8;
  w += accs.filter(Boolean).length * 11;
  // Espace additionnel pour les notes à lignes supplémentaires multiples (> 2 lignes)
  const maxLedger = ev.notes.reduce((max, n) => {
    const aboveTreble = Math.max(0, n.D - 38);
    const belowTreble = Math.max(0, 30 - n.D);
    const aboveBass = Math.max(0, n.D - 26);
    const belowBass = Math.max(0, 18 - n.D);
    return Math.max(max, aboveTreble, belowTreble, aboveBass, belowBass);
  }, 0);
  if (maxLedger >= 4) w += 8;
  return w;
}

/**
 * Calcule la géométrie verticale optimale d'un système (une ligne) en fonction
 * de l'ambitus réel des notes présentes sur cette ligne.
 * Garantit que TOUTES les notes (même très aiguës ou très graves), leurs hampes,
 * leurs lignes supplémentaires et les indications de tempo sont 100% visibles sans coupure.
 */
function computeLineGeometry(items, { params, showTreble, showBass }) {
  const grand = showTreble && showBass;
  const hasTempo = items.some((it) => it.m.index === 0) && !!params.bpm;

  let lineMinTrebleD = Infinity;
  let lineMaxTrebleD = -Infinity;
  let lineMinBassD = Infinity;
  let lineMaxBassD = -Infinity;

  items.forEach((it) => {
    if (it.m.treble) {
      it.m.treble.forEach((ev) => {
        if (!ev.rest && ev.notes) {
          ev.notes.forEach((n) => {
            if (n.D < lineMinTrebleD) lineMinTrebleD = n.D;
            if (n.D > lineMaxTrebleD) lineMaxTrebleD = n.D;
          });
        }
      });
    }
    if (it.m.bass) {
      it.m.bass.forEach((ev) => {
        if (!ev.rest && ev.notes) {
          ev.notes.forEach((n) => {
            if (n.D < lineMinBassD) lineMinBassD = n.D;
            if (n.D > lineMaxBassD) lineMaxBassD = n.D;
          });
        }
      });
    }
  });

  // 1. Marge supérieure au-dessus de Line 0 (F5 pour treble = 38, A3 pour bass = 26)
  // Rappel VexFlow : Stave(x, y, w) positionne Line 0 à (y + 40)
  let topExcessPx = 0;
  if (showTreble && lineMaxTrebleD !== -Infinity && lineMaxTrebleD > 38) {
    topExcessPx = (lineMaxTrebleD - 38) * 5.2;
  } else if (showBass && !showTreble && lineMaxBassD !== -Infinity && lineMaxBassD > 26) {
    topExcessPx = (lineMaxBassD - 26) * 5.2;
  }

  // Espace nécessaire au-dessus de Line 0 :
  // - Si tempo présent : au moins 54px au-dessus de la note la plus haute
  // - Numéros de mesure et hampes montantes : au moins 32px
  const tempoRoom = hasTempo ? 54 : 32;
  const requiredAboveLine0 = topExcessPx + tempoRoom;
  // Pour que le sommet reste dans le canvas SVG avec au moins 18px de marge haute :
  // (trebleY + 40) - requiredAboveLine0 >= 18  =>  trebleY >= requiredAboveLine0 - 22
  const trebleY = Math.max(16, Math.round(requiredAboveLine0 - 22));

  // 2. Écartement inter-portées (gap entre Line 4 de Sol et Line 0 de Fa)
  // Line 4 de Sol est à trebleY + 80
  // Line 0 de Fa est à bassY + 40
  // gap = (bassY + 40) - (trebleY + 80) = bassY - trebleY - 40
  let trebleLowExcess = 0;
  if (showTreble && lineMinTrebleD !== Infinity && lineMinTrebleD < 30) { // E4 = 30
    trebleLowExcess = (30 - lineMinTrebleD) * 5.2;
  }
  let bassHighExcess = 0;
  if (showBass && lineMaxBassD !== -Infinity && lineMaxBassD > 26) { // A3 = 26
    bassHighExcess = (lineMaxBassD - 26) * 5.2;
  }
  // Espace inter-lignes minimum 68px + excédents des deux mains + 24px marge hampes
  const interStaveGap = grand
    ? Math.max(68, Math.round(58 + trebleLowExcess + bassHighExcess + 24))
    : 0;
  const bassY = grand ? (trebleY + 40 + interStaveGap) : trebleY;

  // 3. Marge inférieure sous Line 4 de la portée du bas
  // Line 4 est à bottomStave.y + 80
  const bottomStaveY = grand || showBass ? bassY : trebleY;
  let bottomExcessPx = 0;
  if (showBass && lineMinBassD !== Infinity && lineMinBassD < 18) { // G2 = 18
    bottomExcessPx = (18 - lineMinBassD) * 5.2;
  } else if (!showBass && showTreble && lineMinTrebleD !== Infinity && lineMinTrebleD < 30) {
    bottomExcessPx = (30 - lineMinTrebleD) * 5.2;
  }
  // Hampes descendantes (30px) + marge de sécurité inférieure (25px)
  const requiredBelowLine4 = bottomExcessPx + 55;
  const systemH = Math.round((bottomStaveY + 80) + requiredBelowLine4);

  // Décalage vertical du tempo pour qu'il soit TOUJOURS au-dessus de la note la plus haute
  // StaveTempo est dessiné à Line 0 - 20 + shift_y
  // Pour placer le tempo à Line 0 - topExcessPx - 30 : shift_y = -topExcessPx - 10
  const tempoYOffset = hasTempo && topExcessPx > 0 ? -Math.round(topExcessPx + 10) : 0;

  return { trebleY, bassY, systemH, tempoYOffset };
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

    // Pré-calcul des altérations et largeurs de chaque mesure
    const prepared = measures.map((m) => {
      const tAcc = m.treble ? computeAccidentals(m.treble, key) : null;
      const bAcc = m.bass ? computeAccidentals(m.bass, key) : null;
      const wT = m.treble ? m.treble.reduce((s, ev, i) => s + eventWidth(ev, tAcc[i]), 0) : 0;
      const wB = m.bass ? m.bass.reduce((s, ev, i) => s + eventWidth(ev, bAcc[i]), 0) : 0;
      return { m, tAcc, bAcc, content: Math.max(wT, wB, 64) + 24 };
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

      // Géométrie adaptative spécifique à ce système (hauteur, espacement, marges sur mesure)
      const geom = computeLineGeometry(items, { params, showTreble, showBass });

      const div = document.createElement('div');
      div.className = 'system';
      div.dataset.system = String(li);
      this.container.appendChild(div);

      const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
      renderer.resize(W, Math.ceil(geom.systemH * scale));
      const ctx = renderer.getContext();
      ctx.scale(scale, scale);
      const svg = div.querySelector('svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Système ${li + 1}`);
      svg.style.overflow = 'visible';
      svg.style.width = '100%';
      svg.style.height = 'auto';

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
        const tStave = showTreble ? makeStave('treble', geom.trebleY) : null;
        const bStave = showBass ? makeStave('bass', geom.bassY) : null;
        const topStave = tStave ?? bStave;
        if (isFirstOfLine && m.index > 0) topStave.setMeasure(m.index + 1);
        if (m.index === 0 && params.bpm) {
          const itName = tempoItalianName(params.bpm);
          const dur = 'q';
          const dots = meter.compound ? 1 : 0;
          topStave.setTempo({ name: itName, bpm: params.bpm, duration: dur, dots }, geom.tempoYOffset);
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

            // Infobulle native pour visualiser le nom exact de chaque note (très utile sur les notes extrêmes)
            const noteNames = ev.notes.map((n) => `${frNoteLabel(dToNote(n.D))} (${dToNote(n.D)})`).join(', ');
            const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            titleEl.textContent = `${noteNames} • Mesure ${m.index + 1}`;
            el.appendChild(titleEl);

            // Marqueur visuel pour les notes à grand ambitus (très hautes >= C6 ou très basses <= C2)
            const isExtreme = ev.notes.some((n) => n.D >= 42 || n.D <= 14);
            if (isExtreme) el.classList.add('vf-note-extreme');
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
