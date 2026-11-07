// ─────────────────────────────────────────────────────────────
//  Synthèse de piano avec la Web Audio API (aucun échantillon)
// ─────────────────────────────────────────────────────────────
//
// Chaque note = 2 oscillateurs légèrement désaccordés (battements des
// cordes multiples) à forme d'onde « piano » (harmoniques plus riches dans
// le grave), un filtre passe-bas dont la brillance décroît, une enveloppe à
// double décroissance et un léger bruit de marteau. Le tout passe dans une
// réverbération.

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export class PianoSynth {
  constructor() {
    this.ctx = null;
    this.waves = new Map();
    this.voices = new Set();
    this.volume = 0.8;
  }

  /** Doit être appelé depuis un geste utilisateur (clic). */
  async ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.#buildChain();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Latence de sortie estimée (pour synchroniser le surlignage). */
  get outputLatency() {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(0.55 * v, this.now, 0.05);
  }

  #buildChain() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55 * this.volume;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.#impulse(2.4, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.2;

    this.master.connect(comp);
    this.master.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);
    comp.connect(ctx.destination);

    // Canal direct pour le métronome (sec, net, sans réverbération)
    this.metroGain = ctx.createGain();
    this.metroGain.gain.value = 0.85;
    this.metroGain.connect(comp);

    // Bruit pour l'attaque du marteau
    const len = Math.floor(ctx.sampleRate * 0.05);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  #impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ch[i] = (Math.random() * 2 - 1) * (1 - t) ** decay * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  #wave(midi) {
    const key = Math.round(midi);
    if (this.waves.has(key)) return this.waves.get(key);
    const f = mtof(midi);
    const n = Math.max(4, Math.min(32, Math.floor(12000 / f)));
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    const lowness = Math.max(0, Math.min(1, (72 - midi) / 48)); // grave → plus d'harmoniques
    for (let h = 1; h <= n; h++) {
      let a = 1 / h ** (1.55 - 0.45 * lowness);
      if (h === 2) a *= 1.25;
      if (h === 7 || h === 9) a *= 0.5; // point de frappe du marteau
      imag[h] = a;
    }
    const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.waves.set(key, wave);
    return wave;
  }

  /**
   * Joue une note.
   * @param {number} midi  hauteur MIDI
   * @param {number} t     instant de début (horloge AudioContext)
   * @param {number} dur   durée en secondes
   * @param {number} vel   vélocité 0-127
   */
  playNote(midi, t, dur, vel = 80) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const f = mtof(midi);
    const v = Math.max(0.05, Math.min(1, vel / 127));
    const tEnd = t + Math.max(0.05, dur);
    const peak = 0.32 * v ** 1.4 * (midi < 48 ? 0.85 : 1);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.005);
    env.gain.setTargetAtTime(peak * 0.42, t + 0.005, 0.09);
    const decayTau = Math.max(0.5, Math.min(5, 2.6 * 2 ** (-(midi - 54) / 20)));
    if (tEnd > t + 0.3) env.gain.setTargetAtTime(0, t + 0.3, decayTau);
    env.gain.setTargetAtTime(0, tEnd, 0.09); // relâchement (étouffoir)

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    const bright = Math.min(16000, f * (3 + 9 * v) + 900);
    filter.frequency.setValueAtTime(bright, t);
    filter.frequency.setTargetAtTime(Math.max(f * 2.2, 700), t + 0.01, 0.35 + Math.max(0, (60 - midi) / 60));

    const wave = this.#wave(midi);
    const oscs = [0, 1].map((i) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = f;
      o.detune.value = i === 0 ? -1.8 : 2.2;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.6 : 0.4;
      o.connect(g).connect(filter);
      o.start(t);
      o.stop(tEnd + 0.7);
      return o;
    });
    filter.connect(env).connect(this.master);

    // Marteau
    const hammer = ctx.createBufferSource();
    hammer.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(9000, f * 4 + 1500);
    bp.Q.value = 1.2;
    const hg = ctx.createGain();
    hg.gain.value = 0.05 * v;
    hammer.connect(bp).connect(hg).connect(this.master);
    hammer.start(t);

    const voice = {
      stop: (at) => {
        try {
          env.gain.cancelScheduledValues(at);
          env.gain.setTargetAtTime(0, at, 0.025);
          oscs.forEach((o) => o.stop(at + 0.2));
        } catch { /* déjà arrêtée */ }
      },
    };
    this.voices.add(voice);
    oscs[0].onended = () => this.voices.delete(voice);
    return voice;
  }

  /** Coup de métronome (sec, précis, sans réverbération). */
  click(t, accent) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.45 : 0.28, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g).connect(this.metroGain || this.master);
    o.start(t);
    o.stop(t + 0.04);
  }

  stopAll() {
    const at = this.now;
    this.voices.forEach((v) => v.stop(at));
    this.voices.clear();
  }
}
