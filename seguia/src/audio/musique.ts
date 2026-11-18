/**
 * Musique générative : corde pincée (Karplus–Strong calculé en JS dans des AudioBuffer mis
 * en cache, pas de worklet), bourdon doux, mode de ré dorien, phrases courtes séparées de
 * longs silences. Jamais deux fois la même phrase de suite.
 */
import type { EtatSonore } from './types';
import { alea, choisir, clamp, lisse, Marche, mtof, viser, Voix } from './outils';

/** Ré dorien, de La2 à La4 (MIDI). Indices des appuis : Ré3=3, La3=7, Ré4=10, La4=14. */
export const ECHELLE = [45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69] as const;
const APPUIS = [3, 7, 10, 14];

/**
 * Corde pincée de type oud : excitation de bruit adouci, filtre peigne de position de
 * pincement, boucle de retard avec moyenne (amortissement) et passe-tout fractionnaire
 * (justesse). Durée de résonance plus courte dans l'aigu.
 */
export function cordePincee(sr: number, freq: number, brillance: number, position: number): Float32Array {
  const t60 = clamp(1.5 * Math.pow(196 / freq, 0.6), 0.7, 2.4);
  const duree = Math.min(2.8, t60 + 0.3);
  const n = Math.floor(sr * duree);
  const out = new Float32Array(n);
  const periode = sr / freq;
  const N = Math.max(2, Math.floor(periode - 0.5));
  const frac = periode - N - 0.5;
  const C = (1 - frac) / (1 + frac);
  const anneau = new Float32Array(N);
  let lp = 0;
  const exc = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lp += brillance * (Math.random() * 2 - 1 - lp);
    exc[i] = lp;
  }
  const dp = Math.max(1, Math.round(position * N));
  let m = 0;
  for (let i = 0; i < N; i++) {
    anneau[i] = exc[i]! - exc[(i - dp + N) % N]!;
    m += anneau[i]!;
  }
  m /= N;
  for (let i = 0; i < N; i++) anneau[i]! -= m;
  const perte = Math.pow(0.001, 1 / (freq * t60));
  let idx = 0;
  let prec = 0;
  let ax = 0;
  let ay = 0;
  for (let k = 0; k < n; k++) {
    const x = anneau[idx]!;
    const moy = perte * 0.5 * (x + prec);
    prec = x;
    const y = C * moy + ax - C * ay;
    ax = moy;
    ay = y;
    anneau[idx] = y;
    out[k] = x;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  // fondus d'entrée (1 ms) et de sortie (80 ms), normalisation de crête
  const fi = Math.floor(sr * 0.001);
  const fo = Math.floor(sr * 0.08);
  let crete = 0;
  for (let k = 0; k < n; k++) {
    if (k < fi) out[k]! *= k / fi;
    if (k > n - fo) out[k]! *= (n - k) / fo;
    crete = Math.max(crete, Math.abs(out[k]!));
  }
  const g = crete > 0 ? 0.6 / crete : 0;
  for (let k = 0; k < n; k++) out[k]! *= g;
  return out;
}

interface Note {
  deg: number;
  dur: number; // en temps
  vel: number;
  orne: boolean;
}

export class Musique {
  private cache = new Map<string, AudioBuffer>();
  private aPrechauffer: string[] = [];
  /** entrée des notes (corps de l'instrument) */
  readonly entree: BiquadFilterNode;
  private fondu: GainNode;
  private droneG: GainNode;
  private droneF: BiquadFilterNode;
  private droneOsc: OscillatorNode[] = [];
  private prochainePhrase: number;
  private finPhrase = 0;
  private derniere = '';
  private mDrone = new Marche(0.1, 0.25);
  readonly nbPermanents: number;

  constructor(
    private ctx: BaseAudioContext,
    sortie: AudioNode,
  ) {
    // corps : bosse grave de caisse de résonance, aigus adoucis
    this.entree = ctx.createBiquadFilter();
    this.entree.type = 'peaking';
    this.entree.frequency.value = 210;
    this.entree.Q.value = 1.1;
    this.entree.gain.value = 4;
    const doux = ctx.createBiquadFilter();
    doux.type = 'lowpass';
    doux.frequency.value = 4800;
    this.fondu = ctx.createGain();
    this.fondu.gain.value = 1;
    this.entree.connect(doux).connect(this.fondu).connect(sortie);
    // bourdon : Ré2, La2, Ré3, filtré très bas
    this.droneF = ctx.createBiquadFilter();
    this.droneF.type = 'lowpass';
    this.droneF.frequency.value = 420;
    this.droneG = ctx.createGain();
    this.droneG.gain.value = 0;
    this.droneF.connect(this.droneG).connect(this.fondu);
    const voix: Array<[number, OscillatorType, number]> = [
      [mtof(38), 'triangle', 1],
      [mtof(45), 'sine', 0.6],
      [mtof(50), 'sine', 0.25],
    ];
    for (const [f, type, a] of voix) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(this.droneF);
      o.start();
      this.droneOsc.push(o);
    }
    this.nbPermanents = 5 + 3 * 2; // corps, doux, fondu, filtre et gain du bourdon + 3 oscillateurs et leurs gains
    this.prochainePhrase = ctx.currentTime + alea(2, 4);
    for (const m of ECHELLE) for (let v = 0; v < 2; v++) this.aPrechauffer.push(`${m}:${v}`);
    for (const m of [74, 38, 43]) this.aPrechauffer.push(`${m}:0`);
  }

  private tampon(midi: number, variante: number): AudioBuffer {
    const cle = `${midi}:${variante}`;
    let b = this.cache.get(cle);
    if (!b) {
      const sr = this.ctx.sampleRate;
      const d = cordePincee(sr, mtof(midi), variante ? 0.55 : 0.75, variante ? 0.18 : 0.13);
      b = this.ctx.createBuffer(1, d.length, sr);
      b.getChannelData(0).set(d);
      this.cache.set(cle, b);
    }
    return b;
  }

  /** Une note pincée. `dest` par défaut : le corps de la musique. Renvoie la Voix. */
  pincer(midi: number, t: number, vel: number, pan: number, dest: AudioNode = this.entree, etouffe = 0): Voix {
    const v = new Voix();
    const s = v.src(this.ctx.createBufferSource());
    s.buffer = this.tampon(midi, Math.random() < 0.5 ? 0 : 1);
    s.detune.value = alea(-4, 4); // justesse humaine
    const g = v.n(this.ctx.createGain());
    g.gain.value = vel;
    const p = v.n(this.ctx.createStereoPanner());
    p.pan.value = pan;
    s.connect(g).connect(p).connect(dest);
    s.start(t);
    if (etouffe > 0) {
      g.gain.setValueAtTime(vel, t + etouffe);
      g.gain.linearRampToValueAtTime(0, t + etouffe + 0.06);
      s.stop(t + etouffe + 0.08);
    }
    return v;
  }

  /** Calcule un tampon manquant (un seul par appel, pour étaler le coût). */
  prechauffer(): void {
    const cle = this.aPrechauffer.pop();
    if (!cle) return;
    const [m, v] = cle.split(':').map(Number);
    this.tampon(m!, v!);
  }

  private composer(): Note[] {
    for (let essai = 0; essai < 8; essai++) {
      const len = choisir([3, 4, 4, 5, 5, 6, 7]);
      let deg = choisir([3, 5, 7, 7, 10]);
      const notes: Note[] = [];
      for (let i = 0; i < len; i++) {
        const arc = Math.sin((Math.PI * (i + 0.5)) / len);
        const dernier = i === len - 1;
        if (dernier) {
          // retombe sur l'appui le plus proche
          deg = APPUIS.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a));
        }
        notes.push({
          deg,
          dur: dernier ? alea(2.5, 4) : choisir([0.5, 0.5, 1, 1, 1, 1.5, 2]),
          vel: 0.45 + 0.3 * arc + alea(-0.05, 0.05),
          orne: i > 0 && !dernier && Math.random() < 0.18,
        });
        const pas = choisir([-2, -1, -1, -1, 1, 1, 1, 2, -3, 3, 4, -4, 0]);
        deg = clamp(deg + pas, 1, ECHELLE.length - 1);
      }
      const contour = notes.map((n) => n.deg).join(',');
      if (contour !== this.derniere) {
        this.derniere = contour;
        return notes;
      }
    }
    // très improbable : transpose la phrase d'un appui
    return [3, 5, 7].map((deg, i) => ({ deg, dur: i === 2 ? 3 : 1, vel: 0.5, orne: false }));
  }

  private jouerPhrase(t0: number, temps: number): number {
    const notes = this.composer();
    let t = t0;
    for (const n of notes) {
      const midi = ECHELLE[n.deg]!;
      const pan = alea(-0.25, 0.25);
      if (n.orne) {
        const haut = ECHELLE[Math.min(ECHELLE.length - 1, n.deg + 1)]!;
        this.pincer(haut, t - 0.07, n.vel * 0.3, pan, this.entree, 0.06);
      }
      this.pincer(midi, t + alea(0, 0.015), n.vel * 0.4, pan);
      t += n.dur * temps;
    }
    // parfois une double corde finale (quinte ou octave grave, plus douce)
    const der = notes[notes.length - 1]!;
    if (Math.random() < 0.4) {
      const bas = ECHELLE[Math.max(0, der.deg - choisir([4, 7]))]!;
      this.pincer(bas, t - der.dur * temps + 0.02, der.vel * 0.22, 0);
    }
    return t;
  }

  maj(e: EtatSonore, t: number, dt: number): void {
    const T = clamp(e.tempete, 0, 1.4);
    const nuit = 1 - lisse(0.1, 0.45, e.lumiere);
    const efface = e.pause ? 0 : 1 - lisse(0.15, 0.7, T);
    viser(this.fondu.gain, efface, t, e.pause ? 0.5 : 1.2);

    // bourdon : respire avec les phrases, presque éteint dans les longs silences
    const md = this.mDrone.pas(dt);
    const actif = t < this.finPhrase + 3;
    viser(this.droneG.gain, (actif ? 0.022 : 0.005) * (0.7 + 0.6 * md) * (1 - 0.4 * nuit), t, actif ? 2 : 4);
    viser(this.droneF.frequency, 300 + 350 * md, t, 2);
    this.droneOsc[1]!.detune.setTargetAtTime((md - 0.5) * 6, t, 3);

    if (e.pause || T > 0.6) {
      // pas de nouvelle phrase ; reprise quelques secondes après
      this.prochainePhrase = Math.max(this.prochainePhrase, t + alea(3, 6));
      return;
    }
    const vit = clamp(e.vitesse, 1, 4);
    const tempo = 1 + 0.08 * Math.log2(vit);
    if (t + 0.15 >= this.prochainePhrase) {
      const temps = alea(0.38, 0.48) / tempo;
      const debut = Math.max(t + 0.1, this.prochainePhrase);
      const fin = this.jouerPhrase(debut, temps);
      this.finPhrase = fin;
      const silence = alea(5, 14) * (1 + 1.4 * nuit) / tempo;
      this.prochainePhrase = fin + silence;
    } else {
      this.prechauffer();
    }
  }

  detruire(): void {
    for (const o of this.droneOsc) {
      try {
        o.stop();
      } catch {
        /* */
      }
    }
  }
}
