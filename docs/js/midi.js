// Sortie vers un instrument MIDI externe (Web MIDI API).
// Disponible sur Chrome / Edge / Opera (contexte sécurisé : https ou localhost).

export class MidiOut {
  constructor() {
    this.access = null;
    this.output = null;
    this.onChange = null;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async init() {
    if (this.access) return this.access;
    if (!MidiOut.supported) throw new Error('Web MIDI non pris en charge par ce navigateur.');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.onChange?.(this.outputs());
    return this.access;
  }

  outputs() {
    if (!this.access) return [];
    return [...this.access.outputs.values()].map((o) => ({ id: o.id, name: o.name || o.id, state: o.state }));
  }

  select(id) {
    if (!this.access) return null;
    this.output = this.access.outputs.get(id) ?? [...this.access.outputs.values()][0] ?? null;
    return this.output?.id ?? null;
  }

  get ready() {
    return !!this.output;
  }

  /** tSec : horloge performance.now() en secondes. */
  send(bytes, tSec) {
    if (!this.output) return;
    try { this.output.send(bytes, tSec * 1000); } catch (e) { console.warn('MIDI', e); }
  }

  programChange(channel, program, tSec) {
    this.send([0xc0 | channel, program], tSec);
  }

  noteOn(channel, note, vel, tSec) {
    this.send([0x90 | channel, note, vel], tSec);
  }

  noteOff(channel, note, tSec) {
    this.send([0x80 | channel, note, 0], tSec);
  }

  allNotesOff() {
    if (!this.output) return;
    const now = performance.now() / 1000;
    if (typeof this.output.clear === 'function') { try { this.output.clear(); } catch { /* ignoré */ } }
    for (const t of [now, now + 0.25]) {
      for (const ch of [0, 1, 9]) {
        this.send([0xb0 | ch, 123, 0], t); // All Notes Off
        this.send([0xb0 | ch, 64, 0], t); // pédale relâchée
      }
    }
  }
}
