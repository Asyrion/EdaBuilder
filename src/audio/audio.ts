/** Procedural WebAudio: tiny sound effects and an ambient bed. No audio files. */
export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  private ambient: { wind: GainNode; hum: GainNode; night: GainNode; water: GainNode; fire: GainNode; chatter: GainNode } | null = null;
  private started = false;

  init(): void {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return;
    }
    this.started = true;
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
    // ambient wind: filtered noise
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const wind = ctx.createGain();
    wind.gain.value = 0.05;
    noise.connect(lp).connect(wind).connect(this.master);
    noise.start();
    // wind gusts
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(wind.gain);
    lfo.start();
    // ley hum: low sine + fifth
    const hum = ctx.createGain();
    hum.gain.value = 0.0;
    for (const f of [55, 82.5, 110]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f === 55 ? 0.5 : 0.2;
      o.connect(g).connect(hum);
      o.start();
    }
    hum.connect(this.master);
    // night crickets: periodic chirps via bandpassed noise pulses
    const night = ctx.createGain();
    night.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    bp.Q.value = 12;
    const cricket = ctx.createBufferSource();
    cricket.buffer = buf;
    cricket.loop = true;
    const pulse = ctx.createGain();
    pulse.gain.value = 0;
    cricket.connect(bp).connect(pulse).connect(night).connect(this.master);
    cricket.start();
    const chirpLfo = ctx.createOscillator();
    chirpLfo.type = 'square';
    chirpLfo.frequency.value = 9;
    const chirpAmt = ctx.createGain();
    chirpAmt.gain.value = 0.5;
    chirpLfo.connect(chirpAmt).connect(pulse.gain);
    chirpLfo.start();
    // river: brown-ish noise with a slow swell
    const water = ctx.createGain();
    water.gain.value = 0;
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = buf;
    wsrc.loop = true;
    wsrc.playbackRate.value = 0.6;
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 900;
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.21;
    const wlfoG = ctx.createGain();
    wlfoG.gain.value = 250;
    wlfo.connect(wlfoG).connect(wlp.frequency);
    wlfo.start();
    wsrc.connect(wlp).connect(water).connect(this.master);
    wsrc.start();
    // fire crackle: highpassed noise chopped by a fast random-ish square LFO
    const fire = ctx.createGain();
    fire.gain.value = 0;
    const fsrc = ctx.createBufferSource();
    fsrc.buffer = buf;
    fsrc.loop = true;
    const fhp = ctx.createBiquadFilter();
    fhp.type = 'bandpass';
    fhp.frequency.value = 2600;
    fhp.Q.value = 0.7;
    const chop = ctx.createGain();
    chop.gain.value = 0.3;
    const chopLfo = ctx.createOscillator();
    chopLfo.type = 'square';
    chopLfo.frequency.value = 13;
    const chopLfo2 = ctx.createOscillator();
    chopLfo2.type = 'square';
    chopLfo2.frequency.value = 3.7;
    const chopG = ctx.createGain();
    chopG.gain.value = 0.35;
    chopLfo.connect(chopG).connect(chop.gain);
    chopLfo2.connect(chopG);
    chopLfo.start();
    chopLfo2.start();
    fsrc.connect(fhp).connect(chop).connect(fire).connect(this.master);
    fsrc.start();
    // market chatter: vowel-ish bandpassed noise murmuring
    const chatter = ctx.createGain();
    chatter.gain.value = 0;
    const csrc = ctx.createBufferSource();
    csrc.buffer = buf;
    csrc.loop = true;
    csrc.playbackRate.value = 0.8;
    const cbp = ctx.createBiquadFilter();
    cbp.type = 'bandpass';
    cbp.frequency.value = 500;
    cbp.Q.value = 3;
    const clfo = ctx.createOscillator();
    clfo.frequency.value = 2.3;
    const clfoG = ctx.createGain();
    clfoG.gain.value = 180;
    clfo.connect(clfoG).connect(cbp.frequency);
    clfo.start();
    const murmur = ctx.createGain();
    murmur.gain.value = 0.5;
    const mlfo = ctx.createOscillator();
    mlfo.frequency.value = 0.9;
    const mlfoG = ctx.createGain();
    mlfoG.gain.value = 0.4;
    mlfo.connect(mlfoG).connect(murmur.gain);
    mlfo.start();
    csrc.connect(cbp).connect(murmur).connect(chatter).connect(this.master);
    csrc.start();
    this.ambient = { wind, hum, night, water, fire, chatter };
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /**
   * Update the ambient mix from what the camera sees. All 0..1:
   * night, ley (spires near the camera), water (water tiles in view), fire (burning buildings in view),
   * market (market buildings in view, daytime).
   */
  ambientMix(night: number, ley: number, water = 0, fire = 0, market = 0): void {
    if (!this.ambient || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambient.night.gain.setTargetAtTime(night * 0.12, t, 0.5);
    this.ambient.hum.gain.setTargetAtTime(0.02 + ley * 0.1, t, 0.5);
    this.ambient.water.gain.setTargetAtTime(water * 0.16, t, 0.8);
    this.ambient.fire.gain.setTargetAtTime(fire * 0.35, t, 0.3);
    this.ambient.chatter.gain.setTargetAtTime(market * (1 - night) * 0.09, t, 0.8);
  }

  /** A short generative phrase from a pentatonic scale; seeded so each milestone has its own tune. */
  melody(seed: number): void {
    if (!this.ctx || this.muted) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    let x = (seed * 2654435761) >>> 0;
    const rnd = () => { x = (x ^ (x << 13)) >>> 0; x = (x ^ (x >>> 17)) >>> 0; x = (x ^ (x << 5)) >>> 0; return x / 4294967296; };
    let deg = 2;
    const n = 7 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      deg = Math.max(0, Math.min(scale.length - 1, deg + (rnd() < 0.5 ? -1 : 1) * (1 + (rnd() < 0.25 ? 1 : 0))));
      if (i === n - 1) deg = 5;
      const f = 392 * Math.pow(2, scale[deg] / 12);
      const dur = i === n - 1 ? 0.9 : rnd() < 0.3 ? 0.36 : 0.18;
      setTimeout(() => { this.tone(f, dur * 1.6, 'triangle', 0.13); this.tone(f / 2, dur * 1.6, 'sine', 0.05); }, i * 190);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }
  private noiseBurst(dur: number, vol: number, freq: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }
  click(): void { this.tone(880, 0.05, 'square', 0.05); }
  place(): void { this.noiseBurst(0.15, 0.35, 900); this.tone(220, 0.12, 'triangle', 0.15, -80); }
  road(): void { this.noiseBurst(0.08, 0.2, 1500); }
  zone(): void { this.tone(520, 0.08, 'sine', 0.08, 120); }
  bulldoze(): void { this.noiseBurst(0.3, 0.4, 600); this.tone(110, 0.25, 'sawtooth', 0.08, -60); }
  error(): void { this.tone(160, 0.18, 'square', 0.08, -40); }
  coin(): void { this.tone(1320, 0.12, 'sine', 0.12); setTimeout(() => this.tone(1760, 0.18, 'sine', 0.1), 60); }
  milestone(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.5, 'triangle', 0.14), i * 130));
  }
  bad(): void {
    this.tone(196, 0.5, 'sawtooth', 0.1, -60);
    setTimeout(() => this.tone(147, 0.7, 'sawtooth', 0.1, -40), 200);
  }
  surge(): void {
    this.noiseBurst(0.8, 0.5, 3000);
    this.tone(70, 0.9, 'sawtooth', 0.2, 900);
  }
  spire(): void { this.tone(440, 0.6, 'sine', 0.12, 220); this.tone(660, 0.6, 'sine', 0.06, 330); }
}
