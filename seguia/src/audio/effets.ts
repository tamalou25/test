/**
 * Effets ponctuels : matières bois, terre, eau, laiton ; signatures musicales dans le mode
 * de la musique (ré dorien). Polyphonie bornée, nœuds libérés à la fin de chaque son.
 */
import type { NomEffet } from './types';
import { alea, choisir, clamp, enveloppe, Voix } from './outils';
import { bulle, cloche, eclat } from './timbres';
import type { Musique } from './musique';

const MAX_VOIX = 28;
/** voix simultanées max et intervalle minimal entre deux déclenchements, par effet */
const LIMITES: Partial<Record<NomEffet, [number, number]>> = {
  canal: [4, 0.045],
  survol: [2, 0.06],
  clic: [3, 0.03],
  pieces: [2, 0.12],
  refus: [1, 0.25],
  alerte: [1, 0.8],
  palier: [1, 1],
  victoire: [1, 2],
  caravane: [1, 0.8],
};

export class Effets {
  private actives = 0;
  private parEffet = new Map<NomEffet, number>();
  private dernier = new Map<NomEffet, number>();
  private canalPas = 0;
  private recents: number[] = [];

  constructor(
    private ctx: BaseAudioContext,
    private bus: AudioNode,
    private envoi: AudioNode,
    private bruit: AudioBuffer,
    private musique: Musique,
  ) {}

  jouer(nom: NomEffet, intensite: number): void {
    const t = this.ctx.currentTime + 0.01;
    const lim = LIMITES[nom] ?? [3, 0.02];
    const n = this.parEffet.get(nom) ?? 0;
    const dern = this.dernier.get(nom) ?? Number.NEGATIVE_INFINITY;
    if (this.actives >= MAX_VOIX || n >= lim[0] || t - dern < lim[1]) return;
    this.dernier.set(nom, t);
    const I = clamp(intensite, 0, 1);
    const voix: Voix[] = [];
    const v = (x: Voix = new Voix()): Voix => {
      voix.push(x);
      return x;
    };
    this.fabriquer(nom, t, I, v);
    // comptage : l'effet est actif tant qu'une de ses voix vit
    if (!voix.length) return;
    this.actives++;
    this.parEffet.set(nom, n + 1);
    let restantes = voix.length;
    for (const x of voix)
      x.quandFini(() => {
        if (--restantes === 0) {
          this.actives--;
          this.parEffet.set(nom, (this.parEffet.get(nom) ?? 1) - 1);
        }
      });
  }

  /** Ton simple avec glissando et enveloppe. */
  private ton(v: Voix, type: OscillatorType, f0: number, f1: number, t: number, att: number, amp: number, duree: number, dest: AudioNode): OscillatorNode {
    const o = v.src(this.ctx.createOscillator());
    o.type = type;
    const g = v.n(this.ctx.createGain());
    g.gain.value = 0;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + att + duree);
    const fin = enveloppe(g.gain, t, att, amp, duree);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(fin);
    return o;
  }

  private pincer(v: (x?: Voix) => Voix, midi: number, t: number, vel: number, pan = alea(-0.2, 0.2)): void {
    v(this.musique.pincer(midi, t, vel * 0.7, pan, this.envoiEtBus()));
  }

  private _mix: GainNode | null = null;
  /** petit nœud qui alimente le bus et la réverbération (créé une fois) */
  private envoiEtBus(): AudioNode {
    if (!this._mix) {
      this._mix = this.ctx.createGain();
      const corps = this.ctx.createBiquadFilter();
      corps.type = 'lowpass';
      corps.frequency.value = 5000;
      this._mix.connect(corps);
      corps.connect(this.bus);
      const s = this.ctx.createGain();
      s.gain.value = 0.6;
      corps.connect(s).connect(this.envoi);
    }
    return this._mix;
  }

  private fabriquer(nom: NomEffet, t: number, I: number, v: (x?: Voix) => Voix): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const rev = this.envoi;
    const B = this.bruit;
    switch (nom) {
      case 'clic': {
        const x = v();
        this.ton(x, 'sine', alea(1500, 1700), 900, t, 0.001, 0.16 * I, 0.025, bus);
        eclat(ctx, B, t, 'bandpass', 3200, 2, 0.001, 0.12 * I, 0.012, bus, x);
        break;
      }
      case 'survol': {
        this.ton(v(), 'sine', 2500, 2400, t, 0.005, 0.035 * I, 0.035, bus);
        break;
      }
      case 'poser': {
        const x = v();
        this.ton(x, 'sine', 150, 68, t, 0.003, 0.55 * I, 0.18, bus);
        this.ton(x, 'triangle', 430, 390, t + 0.005, 0.002, 0.12 * I, 0.07, bus);
        eclat(ctx, B, t, 'lowpass', 700, 0.8, 0.002, 0.35 * I, 0.07, bus, x);
        eclat(ctx, B, t + 0.01, 'bandpass', 500, 1, 0.01, 0.08 * I, 0.25, rev, x);
        break;
      }
      case 'canal': {
        // terre grattée + petite eau ; hauteur qui se promène dans une pentatonique
        const x = v();
        const now = t;
        this.recents = this.recents.filter((r) => now - r < 1);
        this.recents.push(now);
        const fatigue = 1 / (1 + 0.06 * this.recents.length);
        const PENTA = [0, 2, 5, 7, 9, 12];
        this.canalPas = (this.canalPas + choisir([1, 1, 2, -1, 3])) % PENTA.length;
        if (this.canalPas < 0) this.canalPas += PENTA.length;
        const r = Math.pow(2, PENTA[this.canalPas]! / 12);
        eclat(ctx, B, t, 'bandpass', alea(650, 1000), 1.4, 0.006, 0.32 * I * fatigue, 0.08, bus, x);
        eclat(ctx, B, t, 'lowpass', 300, 0.7, 0.004, 0.25 * I * fatigue, 0.05, bus, x);
        bulle(ctx, t + alea(0.03, 0.06), 420 * r, 0.12 * I * fatigue, 0.05, bus, x);
        break;
      }
      case 'refus': {
        // deux notes boisées descendantes, étouffées : « hm-hm », sans reproche
        const x = v();
        const lp = x.n(ctx.createBiquadFilter());
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        lp.connect(bus);
        this.ton(x, 'triangle', 220, 216, t, 0.006, 0.3 * I, 0.11, lp);
        this.ton(x, 'triangle', 174.6, 171, t + 0.17, 0.006, 0.3 * I, 0.16, lp);
        break;
      }
      case 'demolir': {
        const x = v();
        this.ton(x, 'sine', 120, 45, t, 0.004, 0.5 * I, 0.3, bus);
        const n = Math.floor(alea(7, 11));
        for (let i = 0; i < n; i++) {
          const tg = t + 0.03 + Math.pow(i / n, 1.4) * 0.55 + alea(0, 0.03);
          eclat(ctx, B, tg, 'bandpass', alea(300, 1600), 1.5, 0.002, 0.25 * I * (1 - (0.6 * i) / n), alea(0.02, 0.06), bus, x);
        }
        eclat(ctx, B, t + 0.02, 'lowpass', 500, 0.7, 0.03, 0.1 * I, 0.6, rev, x);
        break;
      }
      case 'annuler': {
        const x = v();
        const { filtre } = eclat(ctx, B, t, 'bandpass', 2500, 3, 0.03, 0.4 * I, 0.17, bus, x);
        filtre.frequency.setValueAtTime(2500, t);
        filtre.frequency.exponentialRampToValueAtTime(650, t + 0.2);
        break;
      }
      case 'eau_arrive': {
        const x = v();
        eclat(ctx, B, t, 'bandpass', 900, 0.8, 0.12, 0.1 * I, 0.6, bus, x);
        const n = Math.floor(alea(6, 10));
        for (let i = 0; i < n; i++) {
          const f = 380 * Math.pow(1.13, i) * alea(0.92, 1.08);
          bulle(ctx, t + 0.05 + i * alea(0.06, 0.1), f, 0.16 * I * alea(0.6, 1), alea(0.04, 0.08), bus, x);
        }
        eclat(ctx, B, t + 0.1, 'bandpass', 1200, 0.8, 0.1, 0.05 * I, 0.6, rev, x);
        break;
      }
      case 'recolte': {
        const x = v();
        eclat(ctx, B, t, 'highpass', 2600, 0.7, 0.03, 0.1 * I, 0.25, bus, x);
        this.pincer(v, 62, t + 0.05, 0.5 * I);
        this.pincer(v, 69, t + 0.18, 0.45 * I);
        break;
      }
      case 'pieces': {
        const x = v();
        let tc = t;
        const n = Math.floor(alea(3, 6));
        for (let i = 0; i < n; i++) {
          const f = alea(2500, 3300);
          for (const [r, a, d] of [
            [1, 1, 0.22],
            [1.47, 0.55, 0.14],
            [2.09, 0.35, 0.09],
          ] as const) {
            this.ton(x, 'sine', f * r, f * r, tc, 0.001, 0.07 * a * I * alea(0.6, 1), d * alea(0.8, 1.3), bus);
          }
          tc += alea(0.04, 0.11);
        }
        eclat(ctx, B, t, 'highpass', 5000, 0.7, 0.001, 0.04 * I, 0.02, bus, x);
        break;
      }
      case 'chantier_fini': {
        const x = v();
        for (let i = 0; i < 3; i++) {
          const tk = t + i * 0.17;
          this.ton(x, 'sine', 330, 230, tk, 0.002, 0.2 * I, 0.09, bus);
          eclat(ctx, B, tk, 'bandpass', 1800, 1.5, 0.001, 0.12 * I, 0.02, bus, x);
        }
        [50, 57, 62].forEach((m, i) => this.pincer(v, m, t + 0.6 + i * 0.035, 0.45 * I));
        break;
      }
      case 'caravane': {
        const x = v();
        let tc = t;
        const f = choisir([620, 740, 880]);
        for (let i = 0; i < 4; i++) {
          cloche(ctx, tc, f * alea(0.995, 1.005), 0.12 * I * alea(0.7, 1), bus, x);
          if (Math.random() < 0.5) cloche(ctx, tc + alea(0.05, 0.15), f * 1.19, 0.06 * I, bus, x);
          tc += alea(0.3, 0.5);
        }
        break;
      }
      case 'habitant': {
        this.pincer(v, 57, t, 0.45 * I);
        this.pincer(v, 62, t + 0.16, 0.5 * I);
        break;
      }
      case 'alerte': {
        // cor grave bref : Ré2 + quinte légère, filtre qui s'ouvre puis se referme
        const x = v();
        const lp = x.n(ctx.createBiquadFilter());
        lp.type = 'lowpass';
        lp.Q.value = 1.5;
        lp.frequency.setValueAtTime(180, t);
        lp.frequency.linearRampToValueAtTime(950, t + 0.25);
        lp.frequency.linearRampToValueAtTime(400, t + 1.1);
        const g = x.n(ctx.createGain());
        g.gain.value = 0;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25 * I, t + 0.18);
        g.gain.setValueAtTime(0.25 * I, t + 0.75);
        g.gain.linearRampToValueAtTime(0, t + 1.25);
        lp.connect(g);
        g.connect(bus);
        const s = x.n(ctx.createGain());
        s.gain.value = 0.5;
        g.connect(s).connect(rev);
        for (const [f, a] of [
          [73.42, 0.5],
          [73.42 * 1.005, 0.4],
          [110, 0.22],
        ] as const) {
          const o = x.src(ctx.createOscillator());
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f * 0.97, t);
          o.frequency.linearRampToValueAtTime(f, t + 0.12);
          const og = x.n(ctx.createGain());
          og.gain.value = a;
          o.connect(og).connect(lp);
          o.start(t);
          o.stop(t + 1.3);
        }
        break;
      }
      case 'objectif': {
        [57, 62, 69].forEach((m, i) => this.pincer(v, m, t + i * 0.13, 0.5 * I));
        break;
      }
      case 'palier': {
        [50, 57, 62, 64, 69].forEach((m, i) => this.pincer(v, m, t + i * 0.12, (0.4 + 0.04 * i) * I));
        this.pincer(v, 62, t + 0.78, 0.35 * I);
        this.pincer(v, 69, t + 0.8, 0.4 * I);
        cloche(ctx, t + 0.8, 880, 0.04 * I, rev, v());
        break;
      }
      case 'victoire': {
        const motif: Array<[number, number]> = [
          [50, 0],
          [55, 0.18],
          [57, 0.36],
          [62, 0.6],
          [60, 0.78],
          [62, 0.92],
          [64, 1.1],
          [69, 1.38],
        ];
        for (const [m, d] of motif) this.pincer(v, m, t + d, 0.38 * I);
        [38, 50, 57, 62, 69].forEach((m, i) => this.pincer(v, m, t + 1.9 + i * 0.04, 0.3 * I));
        const x = v();
        cloche(ctx, t + 1.9, 740, 0.05 * I, bus, x);
        cloche(ctx, t + 2.4, 880, 0.04 * I, rev, x);
        // bourdon qui gonfle sous l'accord final
        const o = x.src(ctx.createOscillator());
        o.type = 'triangle';
        o.frequency.value = 73.42;
        const g = x.n(ctx.createGain());
        g.gain.value = 0;
        g.gain.setValueAtTime(0, t + 1.2);
        g.gain.linearRampToValueAtTime(0.12 * I, t + 2.2);
        g.gain.linearRampToValueAtTime(0, t + 4);
        o.connect(g).connect(bus);
        o.start(t + 1.2);
        o.stop(t + 4.05);
        break;
      }
    }
  }
}
