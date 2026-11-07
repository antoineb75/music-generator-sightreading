// ─────────────────────────────────────────────────────────────
//  Partitio : Composant d'affichage visuel de l'ambitus
//  Réglette & mini-clavier adaptatif montrant la tessiture du morceau
// ─────────────────────────────────────────────────────────────

import { PIANO_NOTES, letterOf, octaveOf, toMidi, dToNote, frNoteLabel } from './theory.js';

/**
 * Génère le SVG interactif du mini-clavier de piano pour l'ambitus (Do1 à Do7).
 */
export function buildAmbitusKeyboardSvg(ambitus, handsMode = 'both') {
  // 43 touches blanches de C1 (D=7) à C7 (D=49)
  const WHITE_KEY_W = 19;
  const WHITE_KEY_H = 46;
  const BLACK_KEY_W = 11;
  const BLACK_KEY_H = 28;
  const TOTAL_WHITE = 43;
  const SVG_W = TOTAL_WHITE * WHITE_KEY_W;
  const SVG_H = 68;

  const whiteKeys = [];
  const blackKeys = [];

  let whiteIndex = 0;
  for (let oct = 1; oct <= 7; oct++) {
    const maxL = oct === 7 ? 0 : 6;
    for (let l = 0; l <= maxL; l++) {
      const D = oct * 7 + l;
      const x = whiteIndex * WHITE_KEY_W;
      whiteKeys.push({ D, l, oct, x, w: WHITE_KEY_W, h: WHITE_KEY_H });

      // Touches noires associées (après Do, Ré, Fa, Sol, La)
      if (l !== 2 && l !== 6 && oct < 7) {
        // [0: C, 1: D, 3: F, 4: G, 5: A]
        const bx = x + WHITE_KEY_W - Math.floor(BLACK_KEY_W / 2);
        blackKeys.push({ D, l, oct, x: bx, w: BLACK_KEY_W, h: BLACK_KEY_H });
      }
      whiteIndex++;
    }
  }

  // Détermination de l'appartenance d'une touche aux mains
  function getKeyRole(D) {
    const inTreble = ambitus.treble && D >= ambitus.treble.minD && D <= ambitus.treble.maxD;
    const inBass = ambitus.bass && D >= ambitus.bass.minD && D <= ambitus.bass.maxD;
    const isMin = D === ambitus.minD;
    const isMax = D === ambitus.maxD;

    if (inTreble && inBass) return { role: 'both', isMin, isMax };
    if (inTreble) return { role: 'treble', isMin, isMax };
    if (inBass) return { role: 'bass', isMin, isMax };
    return { role: 'none', isMin, isMax };
  }

  // Styles de remplissage
  const COLORS = {
    whiteDefault: '#ffffff',
    whiteBorder: '#cbd5e1',
    blackDefault: '#334155',
    blackBorder: '#1e293b',
    // Rôles
    bassWhite: '#e0f2fe',
    bassWhiteBorder: '#38bdf8',
    bassBlack: '#0284c7',
    trebleWhite: '#fce7f3',
    trebleWhiteBorder: '#f472b6',
    trebleBlack: '#db2777',
    bothWhite: '#ede9fe',
    bothWhiteBorder: '#a78bfa',
    bothBlack: '#7c3aed',
    // Repères extrêmes
    markerMin: '#0284c7',
    markerMax: '#db2777',
  };

  const svgParts = [];
  svgParts.push(`<svg viewBox="0 0 ${SVG_W} ${SVG_H}" class="ambitus-keyboard-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Clavier d'ambitus du morceau">`);

  // 1. Touches blanches
  whiteKeys.forEach((k) => {
    const { role, isMin, isMax } = getKeyRole(k.D);
    let fill = COLORS.whiteDefault;
    let stroke = COLORS.whiteBorder;
    if (role === 'bass') { fill = COLORS.bassWhite; stroke = COLORS.bassWhiteBorder; }
    else if (role === 'treble') { fill = COLORS.trebleWhite; stroke = COLORS.trebleWhiteBorder; }
    else if (role === 'both') { fill = COLORS.bothWhite; stroke = COLORS.bothWhiteBorder; }

    svgParts.push(`<rect x="${k.x}" y="0" width="${k.w}" height="${k.h}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1" class="key-white ${role !== 'none' ? 'key-active' : ''}"/>`);

    // Marqueurs sur Do (C)
    if (k.l === 0) {
      const isMiddleC = k.oct === 4;
      const textFill = isMiddleC ? '#2563eb' : '#64748b';
      const fontWeight = isMiddleC ? 'bold' : 'normal';
      const label = isMiddleC ? 'Do₄' : `C${k.oct}`;
      svgParts.push(`<text x="${k.x + k.w / 2}" y="${k.h + 12}" font-size="9" font-family="system-ui, sans-serif" font-weight="${fontWeight}" fill="${textFill}" text-anchor="middle">${label}</text>`);
      if (isMiddleC) {
        svgParts.push(`<circle cx="${k.x + k.w / 2}" y="${k.h - 5}" r="2" fill="#2563eb"/>`);
      }
    }

    // Repères des notes extrêmes
    if (isMin) {
      svgParts.push(`<circle cx="${k.x + k.w / 2}" cy="${k.h - 10}" r="3.5" fill="${COLORS.markerMin}" stroke="#ffffff" stroke-width="1.5"/>`);
    }
    if (isMax) {
      svgParts.push(`<circle cx="${k.x + k.w / 2}" cy="${k.h - 10}" r="3.5" fill="${COLORS.markerMax}" stroke="#ffffff" stroke-width="1.5"/>`);
    }
  });

  // 2. Touches noires
  blackKeys.forEach((k) => {
    const { role } = getKeyRole(k.D);
    let fill = COLORS.blackDefault;
    let stroke = COLORS.blackBorder;
    if (role === 'bass') { fill = COLORS.bassBlack; stroke = '#0369a1'; }
    else if (role === 'treble') { fill = COLORS.trebleBlack; stroke = '#be185d'; }
    else if (role === 'both') { fill = COLORS.bothBlack; stroke = '#6d28d9'; }

    svgParts.push(`<rect x="${k.x}" y="0" width="${k.w}" height="${k.h}" rx="1.5" fill="${fill}" stroke="${stroke}" stroke-width="0.8" class="key-black ${role !== 'none' ? 'key-active' : ''}"/>`);
  });

  svgParts.push(`</svg>`);
  return svgParts.join('');
}

/**
 * Met à jour le composant d'affichage de l'ambitus dans le DOM.
 */
export function updateAmbitusDisplay(container, ambitus, params) {
  if (!container) return;

  const showTreble = params.hands !== 'left';
  const showBass = params.hands !== 'right';

  // Badges explicatifs
  const minBadge = `
    <div class="ambitus-pill ambitus-pill-min">
      <span class="ambitus-pill-dot" style="background:#0284c7;"></span>
      <span>Note la plus basse : <strong>${ambitus.minFr} (${ambitus.minNote})</strong></span>
    </div>
  `;

  const maxBadge = `
    <div class="ambitus-pill ambitus-pill-max">
      <span class="ambitus-pill-dot" style="background:#db2777;"></span>
      <span>Note la plus haute : <strong>${ambitus.maxFr} (${ambitus.maxNote})</strong></span>
    </div>
  `;

  let subdetails = '';
  if (showTreble && showBass && ambitus.treble && ambitus.bass) {
    subdetails = `
      <div class="ambitus-hands-breakdown">
        <span class="hand-tag hand-bass">
          <span class="hand-indicator" style="background:#38bdf8;"></span>
          Main gauche (MG) : <strong>${ambitus.bass.minFr} → ${ambitus.bass.maxFr}</strong> (${ambitus.bass.intervalLabel})
        </span>
        <span class="hand-divider">•</span>
        <span class="hand-tag hand-treble">
          <span class="hand-indicator" style="background:#f472b6;"></span>
          Main droite (MD) : <strong>${ambitus.treble.minFr} → ${ambitus.treble.maxFr}</strong> (${ambitus.treble.intervalLabel})
        </span>
      </div>
    `;
  } else if (showTreble && ambitus.treble) {
    subdetails = `
      <div class="ambitus-hands-breakdown">
        <span class="hand-tag hand-treble">
          Main droite seule : <strong>${ambitus.treble.minFr} → ${ambitus.treble.maxFr}</strong> (${ambitus.treble.intervalLabel})
        </span>
      </div>
    `;
  } else if (showBass && ambitus.bass) {
    subdetails = `
      <div class="ambitus-hands-breakdown">
        <span class="hand-tag hand-bass">
          Main gauche seule : <strong>${ambitus.bass.minFr} → ${ambitus.bass.maxFr}</strong> (${ambitus.bass.intervalLabel})
        </span>
      </div>
    `;
  }

  const svgHtml = buildAmbitusKeyboardSvg(ambitus, params.hands);

  container.innerHTML = `
    <div class="ambitus-panel">
      <div class="ambitus-header-row">
        <div class="ambitus-title-group">
          <span class="ambitus-icon" aria-hidden="true">🎼</span>
          <span class="ambitus-title">Ambitus de la partition :</span>
          <span class="ambitus-interval-badge">${ambitus.intervalLabel} (${ambitus.totalSemitones} demi-tons)</span>
        </div>
        <div class="ambitus-pills-row">
          ${minBadge}
          ${maxBadge}
        </div>
      </div>
      <div class="ambitus-keyboard-container">
        ${svgHtml}
      </div>
      ${subdetails}
    </div>
  `;
}
