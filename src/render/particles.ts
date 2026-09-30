/** Purely visual particles (world-space native pixels). Not part of the simulation. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  glow: boolean;
  kind: 'smoke' | 'spark' | 'firefly' | 'leaf' | 'ember' | 'mote' | 'surge' | 'ward' | 'restless';
}

export class Particles {
  list: Particle[] = [];
  readonly max = 900;

  emit(p: Omit<Particle, 'life'> & { life?: number }): void {
    if (this.list.length >= this.max) return;
    this.list.push({ ...p, life: p.life ?? p.maxLife });
  }

  update(dt: number, wind: number): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l[i] = l[l.length - 1];
        l.pop();
        continue;
      }
      switch (p.kind) {
        case 'smoke':
          p.vx += wind * dt * 0.4;
          p.vy -= dt * 2;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'firefly':
          p.vx += (Math.random() - 0.5) * 30 * dt;
          p.vy += (Math.random() - 0.5) * 30 * dt;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'leaf':
          p.vx = wind * 6 + Math.sin(p.life * 5) * 6;
          p.vy = 8;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        default:
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.kind === 'ember' || p.kind === 'spark') p.vy -= dt * 6;
          if (p.kind === 'surge') { p.vx *= 0.97; p.vy *= 0.97; }
      }
    }
  }
}
