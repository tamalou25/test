/**
 * Atomes sonores éphémères partagés par l'ambiance et les effets : bulle d'eau, clochette
 * de laiton, éclat de bruit filtré, chant d'oiseau. Chaque appel crée ses nœuds et les
 * libère à la fin (classe Voix).
 */
import { alea, choisir, enveloppe, Voix } from './outils';

/** Bulle : sinus dont la hauteur monte vite pendant que l'amplitude décroît. */
export function bulle(ctx: BaseAudioContext, t: number, f: number, amp: number, duree: number, dest: AudioNode, v = new Voix()): Voix {
  const o = v.src(ctx.createOscillator());
  const g = v.n(ctx.createGain());
  g.gain.value = 0;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * alea(1.6, 2.6), t + duree);
  const fin = enveloppe(g.gain, t, 0.003, amp, duree);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(fin);
  return v;
}

/** Clochette de laiton (partiels inharmoniques, décroissances différentes). */
const PARTIELS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1.4],
  [2.41, 0.45, 0.7],
  [3.93, 0.28, 0.4],
  [5.37, 0.14, 0.22],
];
export function cloche(ctx: BaseAudioContext, t: number, f: number, amp: number, dest: AudioNode, v = new Voix()): Voix {
  for (const [r, a, d] of PARTIELS) {
    const o = v.src(ctx.createOscillator());
    const g = v.n(ctx.createGain());
    g.gain.value = 0;
    o.frequency.value = f * r * (1 + alea(-0.004, 0.004));
    const fin = enveloppe(g.gain, t, 0.002, amp * a, d * alea(0.8, 1.2));
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(fin);
  }
  return v;
}

/** Éclat de bruit filtré (terre, bois, souffle). */
export function eclat(
  ctx: BaseAudioContext,
  bruit: AudioBuffer,
  t: number,
  type: BiquadFilterType,
  f: number,
  q: number,
  attaque: number,
  amp: number,
  duree: number,
  dest: AudioNode,
  v = new Voix(),
): { voix: Voix; filtre: BiquadFilterNode } {
  const s = v.src(ctx.createBufferSource());
  s.buffer = bruit;
  const fl = v.n(ctx.createBiquadFilter());
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = v.n(ctx.createGain());
  g.gain.value = 0;
  const fin = enveloppe(g.gain, t, attaque, amp, duree);
  s.connect(fl).connect(g).connect(dest);
  s.start(t, alea(0, Math.max(0, bruit.duration - duree - 0.5)));
  s.stop(fin);
  return { voix: v, filtre: fl };
}

/** Oiseaux de palmeraie : tourterelle, bulbul, trille, pépiement. Un oscillateur par chant. */
export function oiseau(ctx: BaseAudioContext, t: number, amp: number, dest: AudioNode): { voix: Voix; duree: number } {
  const v = new Voix();
  const o = v.src(ctx.createOscillator());
  const g = v.n(ctx.createGain());
  g.gain.value = 0;
  o.connect(g).connect(dest);
  const f = o.frequency;
  const gg = g.gain;
  let tt = t;
  const note = (f0: number, f1: number, d: number, a: number, att = 0.008) => {
    f.setValueAtTime(f0, tt);
    f.exponentialRampToValueAtTime(f1, tt + d);
    gg.setValueAtTime(0, tt);
    gg.linearRampToValueAtTime(a, tt + att);
    gg.setValueAtTime(a, tt + Math.max(att, d - 0.015));
    gg.linearRampToValueAtTime(0, tt + d);
    tt += d;
  };
  const espece = choisir(['tourterelle', 'bulbul', 'bulbul', 'trille', 'pepiement', 'pepiement'] as const);
  if (espece === 'tourterelle') {
    // roucoulement grave et doux : « hou-hou, hou »
    const b = alea(470, 560);
    const n = choisir([3, 4, 5]);
    for (let i = 0; i < n; i++) {
      const d = i === 1 ? alea(0.35, 0.5) : alea(0.18, 0.28);
      note(b * 1.04, b * alea(0.9, 0.96), d, amp * 1.6, 0.05);
      tt += alea(0.08, 0.22);
    }
  } else if (espece === 'bulbul') {
    // courte phrase flûtée, quelques notes glissées
    const n = choisir([3, 4, 5]);
    let b = alea(1700, 2600);
    for (let i = 0; i < n; i++) {
      const d = alea(0.07, 0.16);
      const fin = b * alea(0.8, 1.3);
      note(b, fin, d, amp * alea(0.7, 1), 0.012);
      tt += alea(0.03, 0.09);
      b = Math.min(3600, Math.max(1500, fin * alea(0.85, 1.2)));
    }
  } else if (espece === 'trille') {
    const n = Math.floor(alea(7, 14));
    let b = alea(3800, 4800);
    for (let i = 0; i < n; i++) {
      note(b, b * 0.82, 0.032, amp * 0.6 * (1 - (0.4 * i) / n), 0.004);
      tt += 0.022;
      b *= 0.985;
    }
  } else {
    const n = choisir([1, 2, 2, 3]);
    for (let i = 0; i < n; i++) {
      const b = alea(4500, 6200);
      note(b, b * 0.6, alea(0.035, 0.06), amp * 0.55, 0.003);
      tt += alea(0.06, 0.16);
    }
  }
  gg.setValueAtTime(0, tt);
  o.start(t);
  o.stop(tt + 0.02);
  return { voix: v, duree: tt - t };
}
