/** Procedural WebAudio: tiny sound effects and an ambient bed. No audio files. */
import type { SoundCue } from '../sim/hazards';

export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  musicOn = true;
  private music: { gain: GainNode; drone: GainNode; droneFilter: BiquadFilterNode; droneOscs: OscillatorNode[]; nextBar: number; bar: number; timer: number; seed: number; deg: number } | null = null;
  private mood = { night: 0, season: 0, danger: 0 };
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
    this.startMusic();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.music && this.ctx) this.music.gain.gain.setTargetAtTime(on ? 0.18 : 0, this.ctx.currentTime, 0.5);
  }

  /** World state the music follows: night 0..1, season 0..3, danger 0..1. */
  setMood(night: number, season: number, danger: number): void {
    this.mood = { night, season, danger };
  }

  // ---------- generative soundtrack ----------
  private static MODES: Record<string, number[]> = {
    day: [0, 2, 4, 7, 9, 11, 12, 14, 16, 19], // major pentatonic with a lydian 4th flavour via 11
    night: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17], // dorian
    hush: [0, 3, 5, 7, 8, 10, 12, 15, 17], // aeolian
  };
  private static CHORDS = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // I vi IV V (relative to root)

  private startMusic(): void {
    if (!this.ctx || !this.master || this.music) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = this.musicOn ? 0.18 : 0;
    gain.connect(this.master);
    // drone pad: two detuned triangles + sub sine through a slow low-pass
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 500;
    droneFilter.Q.value = 0.7;
    const drone = ctx.createGain();
    drone.gain.value = 0.12;
    droneFilter.connect(drone).connect(gain);
    const droneOscs: OscillatorNode[] = [];
    for (const [type, f, g] of [['triangle', 110, 0.5], ['triangle', 110.7, 0.5], ['sine', 55, 0.8]] as [OscillatorType, number, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(droneFilter);
      o.start();
      droneOscs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(droneFilter.frequency);
    lfo.start();
    this.music = { gain, drone, droneFilter, droneOscs, nextBar: ctx.currentTime + 0.3, bar: 0, timer: 0, seed: 12345, deg: 4 };
    this.music.timer = window.setInterval(() => this.scheduleMusic(), 300);
  }

  private mrand(): number {
    const m = this.music!;
    m.seed = (m.seed * 1664525 + 1013904223) >>> 0;
    return m.seed / 4294967296;
  }

  private pluck(freq: number, t: number, dur: number, vol: number, bell = false): void {
    if (!this.ctx || !this.music) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.music.gain);
    o.start(t);
    o.stop(t + dur + 0.05);
    if (bell) {
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * 3;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(vol * 0.25, t + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.6);
      o2.connect(g2).connect(this.music.gain);
      o2.start(t);
      o2.stop(t + dur);
    }
  }

  /** Writes one bar ahead when the look-ahead window reaches the next bar. */
  private scheduleMusic(): void {
    const m = this.music;
    if (!m || !this.ctx || this.muted || !this.musicOn) return;
    const ctx = this.ctx;
    const beat = 60 / 58;
    const barLen = beat * 4;
    while (m.nextBar < ctx.currentTime + 0.6) {
      const t0 = m.nextBar;
      const { night, season, danger } = this.mood;
      const modeName = season === 3 ? 'hush' : night > 0.5 ? 'night' : 'day';
      const mode = Audio.MODES[modeName];
      const root = 220 * (season === 3 ? 0.8909 : 1); // Hush a whole tone lower
      const chord = Audio.CHORDS[m.bar % 4];
      // drone follows the chord root, filter opens by day
      const droneRoot = root / 2 * Math.pow(2, chord[0] / 12);
      m.droneOscs[0].frequency.setTargetAtTime(droneRoot, t0, 0.8);
      m.droneOscs[1].frequency.setTargetAtTime(droneRoot * 1.006, t0, 0.8);
      m.droneOscs[2].frequency.setTargetAtTime(droneRoot / 2, t0, 0.8);
      m.droneFilter.frequency.setTargetAtTime(danger > 0.5 ? 220 : 380 + (1 - night) * 500, t0, 1);
      // bass on the downbeat
      this.pluck(root / 2 * Math.pow(2, chord[0] / 12), t0, beat * 2.5, danger > 0.5 ? 0.05 : 0.08);
      if (danger > 0.5) {
        // slow low pulse, no melody
        this.pluck(root / 4 * Math.pow(2, chord[0] / 12), t0 + beat * 2, beat, 0.07);
      } else {
        // melody: a random walk over the mode, with rests; sparser at night and in the Hush
        const density = modeName === 'hush' ? 0.35 : modeName === 'night' ? 0.5 : 0.7;
        for (let step = 0; step < 8; step++) {
          if (this.mrand() > density) continue;
          const r = this.mrand();
          m.deg = Math.max(0, Math.min(mode.length - 1, m.deg + (r < 0.4 ? -1 : r < 0.8 ? 1 : r < 0.9 ? -2 : 2)));
          const semis = mode[m.deg] + (step === 0 ? chord[2] - chord[2] : 0);
          const freq = root * Math.pow(2, semis / 12);
          const t = t0 + step * (beat / 2);
          const long = this.mrand() < 0.3;
          this.pluck(freq, t, long ? beat * 1.6 : beat * 0.9, modeName === 'day' ? 0.07 : 0.055, modeName !== 'day');
          // Bloom: a high echo a bar later at half volume
          if (season === 1 && this.mrand() < 0.35) this.pluck(freq * 2, t + beat, beat * 0.6, 0.025, true);
        }
        // chord tone shimmer on beat 3 by day
        if (modeName === 'day' && this.mrand() < 0.6) this.pluck(root * Math.pow(2, chord[1] / 12) * 2, t0 + beat * 2, beat * 1.2, 0.03);
      }
      m.nextBar += barLen;
      m.bar++;
    }
  }

  /** Duck the music briefly under an alarm. */
  duck(): void {
    if (!this.music || !this.ctx || !this.musicOn) return;
    const t = this.ctx.currentTime;
    this.music.gain.gain.setTargetAtTime(0.08, t, 0.05);
    this.music.gain.gain.setTargetAtTime(0.18, t + 2, 0.8);
  }

  /**
   * Update the ambient mix from what the camera sees. All 0..1:
   * night, ley (spires near the camera), water (water tiles in view), fire (burning buildings in view),
   * market (market buildings in view, daytime).
   */
  /** A positional one-shot: horn, bell, hammer, rain. */
  cue(kind: SoundCue, pan = 0, vol = 1): void {
    if (!this.ctx || !this.master || this.muted || vol <= 0.02) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = Math.min(1, vol);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p).connect(this.master); } else out.connect(this.master);
    const t = ctx.currentTime;
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, g: number, delay = 0, vib = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.0001, t + delay);
      gg.gain.exponentialRampToValueAtTime(g, t + delay + 0.05);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      if (vib) { const l = ctx.createOscillator(); l.frequency.value = vib; const lg = ctx.createGain(); lg.gain.value = f0 * 0.03; l.connect(lg).connect(o.frequency); l.start(t + delay); l.stop(t + delay + dur); }
      o.connect(gg).connect(out);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.05);
    };
    const noise = (dur: number, g: number, freq: number, delay = 0, type: BiquadFilterType = 'lowpass') => {
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const gg = ctx.createGain();
      gg.gain.value = g;
      src.connect(f).connect(gg).connect(out);
      src.start(t + delay);
    };
    switch (kind) {
      case 'horn': osc('triangle', 196, 196, 0.9, 0.18); osc('triangle', 198, 198, 0.9, 0.12); osc('sine', 98, 98, 1.0, 0.1); osc('triangle', 262, 262, 0.7, 0.14, 0.9); break;
      case 'bell': osc('sine', 1046, 1046, 1.2, 0.14); osc('sine', 2093, 2093, 0.8, 0.05); osc('sine', 1318, 1318, 0.9, 0.04, 0.02); break;
      case 'hammer': osc('square', 820, 540, 0.05, 0.05); noise(0.04, 0.18, 2200, 0, 'highpass'); osc('square', 760, 500, 0.05, 0.04, 0.16); noise(0.04, 0.15, 2000, 0.16, 'highpass'); break;
      case 'rain': noise(2.5, 0.25, 1800, 0, 'bandpass'); noise(2.0, 0.15, 900, 0.3); osc('sine', 392, 392, 0.5, 0.05, 0.2); break;
    }
  }

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
    this.duck();
    this.tone(196, 0.5, 'sawtooth', 0.1, -60);
    setTimeout(() => this.tone(147, 0.7, 'sawtooth', 0.1, -40), 200);
  }
  surge(): void {
    this.duck();
    this.noiseBurst(0.8, 0.5, 3000);
    this.tone(70, 0.9, 'sawtooth', 0.2, 900);
  }
  spire(): void { this.tone(440, 0.6, 'sine', 0.12, 220); this.tone(660, 0.6, 'sine', 0.06, 330); }
}
