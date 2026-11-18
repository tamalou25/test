import { bruit, hacher } from './rng';
import { N, NN, Sol, DX, DZ, type Carte, type Dir } from './types';

export interface CarteGeneree {
  carte: Carte;
  /** coin nord-ouest du bâtiment « source » (2×2) */
  sourceX: number;
  sourceZ: number;
  /** coin nord-ouest de la maison du campement de départ (2×2) */
  campX: number;
  campZ: number;
}

/** Les 8 symétries du carré, appliquées aux coordonnées de case. */
function transformer(x: number, z: number, sym: number): [number, number] {
  const m = N - 1;
  switch (sym & 7) {
    case 0: return [x, z];
    case 1: return [m - x, z];
    case 2: return [x, m - z];
    case 3: return [m - x, m - z];
    case 4: return [z, x];
    case 5: return [m - z, x];
    case 6: return [z, m - x];
    default: return [m - z, m - x];
  }
}

function transformerDir(d: Dir, sym: number): Dir {
  const [x0, z0] = transformer(20, 20, sym);
  const [x1, z1] = transformer(20 + DX[d], 20 + DZ[d], sym);
  const dx = x1 - x0;
  const dz = z1 - z0;
  for (let k = 0; k < 4; k++) if (DX[k] === dx && DZ[k] === dz) return k as Dir;
  return d;
}

/**
 * Carte canonique : massif rocheux au nord-ouest, source à son pied (niveau 2),
 * terrasses qui descendent vers le sud-est, piste des caravanes dans la plaine, dunes au sud.
 * Une symétrie tirée de la graine la retourne pour varier les parties.
 */
export function genererCarte(graine: number): CarteGeneree {
  for (let essai = 0; essai < 40; essai++) {
    const g = genererEssai(graine, essai);
    if (g) return g;
  }
  // repli sans bruit : toujours valide
  return genererEssai(graine, -1)!;
}

function genererEssai(graine: number, essai: number): CarteGeneree | null {
  const g = (graine + essai * 7919) | 0;
  const amp = essai < 0 ? 0 : 1;
  const elev = new Uint8Array(NN);
  const sol = new Uint8Array(NN);
  const cx = 6.5;
  const cz = 6.5;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const n1 = (bruit(x / 7, z / 7, g) - 0.5) * 6 * amp;
      const n2 = (bruit(x / 3, z / 3, g + 11) - 0.5) * 1.6 * amp;
      const d = Math.hypot(x - cx, z - cz) + n1 + n2;
      if (d < 8.2) {
        elev[i] = 3;
        sol[i] = Sol.Roche;
      } else if (d < 17.5) elev[i] = 2;
      else if (d < 28.5) elev[i] = 1;
      else elev[i] = 0;
      if (sol[i] !== Sol.Roche) {
        const r = bruit(x / 4.5, z / 4.5, g + 23);
        sol[i] = r > 0.62 ? Sol.Reg : Sol.Sable;
      }
    }
  }

  // --- zone de la source : sur la diagonale, premier point de niveau 2 ---
  let px = -1;
  let pz = -1;
  for (let t = 3; t < 16; t++) {
    const x = Math.round(cx + t);
    const z = Math.round(cz + t);
    if (elev[z * N + x] === 2) {
      px = x;
      pz = z;
      break;
    }
  }
  if (px < 0) return null;
  for (let z = pz - 1; z <= pz + 5; z++) {
    for (let x = px - 1; x <= px + 6; x++) {
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const i = z * N + x;
      elev[i] = 2;
      sol[i] = Sol.Sable;
    }
  }
  const sourceX = px;
  const sourceZ = pz;
  const sortieX = px + 1;
  const sortieZ = pz + 2;
  const campX = px + 4;
  const campZ = pz;

  // --- dunes au sud ---
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const bord = N - 1 - z;
      const lim = 2.2 + bruit(x / 5, 0.5, g + 31) * 3.2 * (amp || 0.5);
      if (bord < lim && elev[i] <= 1) sol[i] = Sol.Dune;
    }
  }

  // --- affleurements rocheux isolés ---
  const nbRocs = essai < 0 ? 0 : 7;
  for (let k = 0; k < nbRocs; k++) {
    const rx = 4 + Math.floor(hacher(k, 1, g + 41) * (N - 8));
    const rz = 4 + Math.floor(hacher(k, 2, g + 41) * (N - 10));
    const taille = 1 + Math.floor(hacher(k, 3, g + 41) * 3);
    for (let j = 0; j < taille; j++) {
      const x = rx + Math.floor(hacher(k, 10 + j, g + 43) * 2);
      const z = rz + Math.floor(hacher(k, 20 + j, g + 43) * 2);
      if (Math.abs(x - px) < 9 && Math.abs(z - pz) < 9) continue; // pas près de la source
      const i = z * N + x;
      if (elev[i] < 3 && sol[i] !== Sol.Dune) sol[i] = Sol.Roche;
    }
  }

  // --- piste : de l'ouest à l'est, dans la plaine ---
  const piste: number[] = [];
  const fz = (x: number) => {
    const u = x / (N - 1);
    const ondul = (bruit(x / 9, 3.3, g + 53) - 0.5) * 3 * amp;
    return Math.round(31 + ondul - 4 * u - 2.5 * Math.sin(u * Math.PI));
  };
  let zc = fz(0);
  for (let x = 0; x < N; x++) {
    const zt = Math.max(20, Math.min(N - 8, fz(x)));
    if (x === 0) zc = zt;
    while (zc !== zt) {
      zc += zt > zc ? 1 : -1;
      piste.push(zc * N + (x - 1 >= 0 ? x - 1 : 0));
    }
    piste.push(zc * N + x);
  }
  // dédoublonnage en gardant l'ordre
  const vu = new Set<number>();
  const pisteNette: number[] = [];
  for (const i of piste) {
    if (!vu.has(i)) {
      vu.add(i);
      pisteNette.push(i);
    }
  }
  for (const i of pisteNette) {
    if (elev[i] >= 2) return null; // la piste doit rester en bas
    sol[i] = Sol.Piste;
  }

  // --- validation : l'eau peut descendre de la source jusqu'aux abords de la piste ---
  const sortie = sortieZ * N + sortieX;
  if (!validerDescente(elev, sol, sortie, pisteNette)) return null;

  // --- symétrie ---
  const sym = essai < 0 ? 0 : ((graine % 8) + 8) % 8;
  const elev2 = new Uint8Array(NN);
  const sol2 = new Uint8Array(NN);
  const tr = (i: number) => {
    const [x, z] = transformer(i % N, Math.floor(i / N), sym);
    return z * N + x;
  };
  for (let i = 0; i < NN; i++) {
    const j = tr(i);
    elev2[j] = elev[i];
    sol2[j] = sol[i];
  }
  const coin = (x: number, z: number): [number, number] => {
    let mx = N;
    let mz = N;
    for (let dz = 0; dz < 2; dz++)
      for (let dx = 0; dx < 2; dx++) {
        const [tx, tz] = transformer(x + dx, z + dz, sym);
        mx = Math.min(mx, tx);
        mz = Math.min(mz, tz);
      }
    return [mx, mz];
  };
  const [sx, sz] = coin(sourceX, sourceZ);
  const [kx, kz] = coin(campX, campZ);
  return {
    carte: {
      elev: elev2,
      sol: sol2,
      piste: pisteNette.map(tr),
      sourceCase: tr(sortie),
      ventDominant: transformerDir(2, sym),
    },
    sourceX: sx,
    sourceZ: sz,
    campX: kx,
    campZ: kz,
  };
}

/** Parcours en largeur sur terrain constructible, sans jamais remonter, jusqu'à 3 cases de la piste. */
function validerDescente(elev: Uint8Array, sol: Uint8Array, depart: number, piste: number[]): boolean {
  const pres = new Uint8Array(NN);
  for (const p of piste) {
    const px = p % N;
    const pz = Math.floor(p / N);
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = px + dx;
        const z = pz + dz;
        if (x >= 0 && z >= 0 && x < N && z < N) pres[z * N + x] = 1;
      }
  }
  const vu = new Uint8Array(NN);
  const file = [depart];
  vu[depart] = 1;
  let atteint = 0;
  while (file.length) {
    const i = file.shift()!;
    if (pres[i]) atteint++;
    const x = i % N;
    const z = Math.floor(i / N);
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const nz = z + DZ[k];
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = nz * N + nx;
      if (vu[j]) continue;
      if (sol[j] === Sol.Roche || sol[j] === Sol.Dune) continue;
      if (elev[j] > elev[i]) continue;
      vu[j] = 1;
      file.push(j);
    }
  }
  return atteint >= 40;
}
