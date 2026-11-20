// Écriture d'un fichier MIDI standard (SMF format 1).

import { buildNoteEvents, buildPedalEvents, buildTempoEvents } from './events.js';

const TICKS_PER_QUARTER = 480;
const TICKS_PER_UNIT = TICKS_PER_QUARTER / 4; // unité = double-croche

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

const ascii = (s) => Array.from(new TextEncoder().encode(s));
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];

function encodeTrack(events) {
  // events : [{tick, order, bytes}]
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = [];
  let last = 0;
  for (const e of events) {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(0x00, 0xff, 0x2f, 0x00); // fin de piste
  return [...ascii('MTrk'), ...u32(data.length), ...data];
}

const meta = (tick, type, payload) => ({ tick, order: 0, bytes: [0xff, type, ...vlq(payload.length), ...payload] });

export function midiFileBytes(score, bpm) {
  const { meter, key } = score;
  // Étalonnage universel : 1 battement = 60000000 / bpm microsecondes.
  // En MIDI, l'événement 0x51 exprime les microsecondes par noire (quarter note = 4 unités).
  // 1 battement faisant meter.beatLen unités, 1 unité = (60000000 / bpm) / meter.beatLen µs.
  // 1 noire (4 unités) = 4 * ((60000000 / bpm) / meter.beatLen) µs.
  // Tempo Map expressive (rubato de phrase, respiration demi-cadence, ritardando final)
  const tempoEvents = buildTempoEvents(score, bpm);
  const conductor = [
    meta(0, 0x03, ascii('Partitio')),
    meta(0, 0x58, [meter.num, Math.log2(meter.den), 24, 8]),
    meta(0, 0x59, [key.fifths & 255, key.mode === 'minor' ? 1 : 0]),
  ];
  for (const te of tempoEvents) {
    const tempoUs = Math.round((60000000 / Math.max(30, te.bpm)) * (4 / meter.beatLen));
    const tick = Math.max(0, Math.round(te.u * TICKS_PER_UNIT));
    conductor.push(meta(tick, 0x51, [(tempoUs >> 16) & 255, (tempoUs >> 8) & 255, tempoUs & 255]));
  }

  const ticksPerSec = (bpm * meter.beatLen * TICKS_PER_UNIT) / 60;
  const notes = buildNoteEvents(score);
  const pedals = buildPedalEvents(score);
  const hands = [
    { hand: 'right', name: 'Main droite', channel: 0 },
    { hand: 'left', name: 'Main gauche', channel: 1 },
  ];
  const tracks = hands.map(({ hand, name, channel }) => {
    const evs = [meta(0, 0x03, ascii(name)), { tick: 0, order: 1, bytes: [0xc0 | channel, 0] }];
    for (const n of notes.filter((x) => x.hand === hand)) {
      const microTicks = Math.round(((n.humanizeSec ?? 0) + (n.rollSec ?? 0)) * ticksPerSec);
      const on = Math.max(0, Math.round(n.u * TICKS_PER_UNIT) + microTicks);
      const gateRatio = n.gateRatio ?? 0.95;
      const off = Math.max(on + 10, Math.round((n.u + n.durU * gateRatio) * TICKS_PER_UNIT));
      evs.push({ tick: on, order: 3, bytes: [0x90 | channel, n.midi, n.vel] });
      evs.push({ tick: off, order: 2, bytes: [0x80 | channel, n.midi, 0] });
    }
    if (hand === 'left') {
      for (const p of pedals) {
        const tick = Math.max(0, Math.round(p.u * TICKS_PER_UNIT));
        const ccNum = p.cc ?? 64;
        evs.push({ tick, order: p.value === 0 ? 1 : 4, bytes: [0xb0 | channel, ccNum, p.value] });
      }
    }
    return encodeTrack(evs);
  });

  const header = [...ascii('MThd'), ...u32(6), ...u16(1), ...u16(1 + tracks.length), ...u16(TICKS_PER_QUARTER)];
  return new Uint8Array([...header, ...encodeTrack(conductor), ...tracks.flat()]);
}
