import type { EtatRng } from './types';

/** Générateur sfc32 : rapide, déterministe, état de 4 entiers sauvegardable. */
export function rngCreer(graine: number, flux: number): EtatRng {
  // mélange de la graine et du numéro de flux (splitmix32)
  let h = (graine ^ Math.imul(flux + 1, 0x9e3779b9)) >>> 0;
  const mix = () => {
    h = (h + 0x9e3779b9) >>> 0;
    let t = h ^ (h >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
  const e: EtatRng = [mix(), mix(), mix(), mix()];
  for (let i = 0; i < 12; i++) rngSuivant(e);
  return e;
}

/** Réel dans [0, 1). Modifie l'état. */
export function rngSuivant(e: EtatRng): number {
  let a = e[0] | 0;
  let b = e[1] | 0;
  let c = e[2] | 0;
  let d = e[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  e[0] = a >>> 0;
  e[1] = b >>> 0;
  e[2] = c >>> 0;
  e[3] = d >>> 0;
  return (t >>> 0) / 4294967296;
}

/** Entier dans [min, max] inclus. */
export function rngEntier(e: EtatRng, min: number, max: number): number {
  return min + Math.floor(rngSuivant(e) * (max - min + 1));
}

/** Hachage entier sans état (bruit de carte). */
export function hacher(x: number, z: number, graine: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(graine | 0, 0x9e3779b9)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Bruit de valeur lissé, dans [0, 1). */
export function bruit(x: number, z: number, graine: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hacher(x0, z0, graine);
  const b = hacher(x0 + 1, z0, graine);
  const c = hacher(x0, z0 + 1, graine);
  const d = hacher(x0 + 1, z0 + 1, graine);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
