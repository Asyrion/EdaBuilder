/** Procedural WebAudio: tiny sound effects and an ambient bed. No audio files. */
export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  private ambient: { wind: GainNode; hum: GainNode; night: GainNode } | null = null;
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
    this.ambient = { wind, hum, night };
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** Update ambient mix: night 0..1, ley 0..1 (how much ley is near the camera). */
  ambientMix(night: number, ley: number): void {
    if (!this.ambient || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambient.night.gain.setTargetAtTime(night * 0.12, t, 0.5);
    this.ambient.hum.gain.setTargetAtTime(0.02 + ley * 0.1, t, 0.5);
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
