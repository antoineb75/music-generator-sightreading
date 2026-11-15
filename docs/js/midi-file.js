// Écriture d'un fichier MIDI standard (SMF format 1).

import { buildNoteEvents } from './events.js';

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
  const tempo = Math.round((60000000 / bpm) * (4 / meter.beatLen));
  const conductor = [
    meta(0, 0x03, ascii('Partitio')),
    meta(0, 0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255]),
    meta(0, 0x58, [meter.num, Math.log2(meter.den), 24, 8]),
    meta(0, 0x59, [key.fifths & 255, key.mode === 'minor' ? 1 : 0]),
  ];

  const notes = buildNoteEvents(score);
  const hands = [
    { hand: 'right', name: 'Main droite', channel: 0 },
    { hand: 'left', name: 'Main gauche', channel: 1 },
  ];
  const tracks = hands.map(({ hand, name, channel }) => {
    const evs = [meta(0, 0x03, ascii(name)), { tick: 0, order: 1, bytes: [0xc0 | channel, 0] }];
    for (const n of notes.filter((x) => x.hand === hand)) {
      const on = Math.round(n.u * TICKS_PER_UNIT);
      const off = Math.max(on + 10, Math.round((n.u + n.durU) * TICKS_PER_UNIT) - 10);
      evs.push({ tick: on, order: 3, bytes: [0x90 | channel, n.midi, n.vel] });
      evs.push({ tick: off, order: 2, bytes: [0x80 | channel, n.midi, 0] });
    }
    return encodeTrack(evs);
  });

  const header = [...ascii('MThd'), ...u32(6), ...u16(1), ...u16(1 + tracks.length), ...u16(TICKS_PER_QUARTER)];
  return new Uint8Array([...header, ...encodeTrack(conductor), ...tracks.flat()]);
}
