/**
 * Repère du monde 3D : 1 unité = 1 case. Le plateau est centré sur l'origine.
 * La hauteur du terrain est une fonction pure de la carte, partagée par le maillage,
 * les bâtiments et les personnages.
 */
import { bruit } from '../sim/rng';
import { N, Sol, type Carte } from '../sim';

/** hauteur d'un niveau de terrasse */
export const NIVEAU = 0.45;
export const DEMI = N / 2;
/** largeur de la rampe de part et d'autre d'une limite de case */
export const RAMPE = 0.15;
/** profondeur du socle sous le niveau 0 */
export const SOCLE = 2.6;

export const mx = (caseX: number) => caseX - DEMI;
export const mz = (caseZ: number) => caseZ - DEMI;

function borne(v: number) {
  return v < 0 ? 0 : v > N - 1 ? N - 1 : v;
}

/** Hauteur « logique » d'une case (dessus de terrasse). */
export function hauteurCase(carte: Carte, i: number): number {
  return carte.elev[i] * NIVEAU;
}

/** Relief propre à la nature du sol au point (fx, fz), pour la case (tx, tz). */
function relief(carte: Carte, tx: number, tz: number, fx: number, fz: number): number {
  const i = tz * N + tx;
  const s = carte.sol[i];
  if (s === Sol.Roche) {
    if (carte.elev[i] >= 3) {
      // massif : gradins de grès (hauteur quantifiée en bancs, bords adoucis)
      const brut = bruit(fx / 3.4, fz / 3.4, 91) * 2.6 + bruit(fx / 1.3, fz / 1.3, 92) * 0.5;
      const banc = 0.42;
      const k = Math.floor(brut / banc);
      const f = brut / banc - k;
      const marche = f < 0.75 ? 0 : (f - 0.75) / 0.25;
      return 0.35 + (k + marche * marche * (3 - 2 * marche)) * banc;
    }
    // rocher isolé : bosse centrée sur la case
    const dx = fx - (tx + 0.5);
    const dz = fz - (tz + 0.5);
    const d = Math.min(1, Math.hypot(dx, dz) / 0.75);
    return 0.55 * (1 - d * d) * (0.7 + 0.6 * bruit(tx * 3.1, tz * 2.3, 93));
  }
  if (s === Sol.Dune) {
    const crete = Math.sin(fx * 0.55 + bruit(fx / 5, fz / 5, 94) * 4) * 0.5 + 0.5;
    return 0.12 + 0.75 * crete * bruit(fx / 3.5, fz / 3.5, 95) + 0.25 * bruit(fx / 6, fz / 6, 96);
  }
  if (s === Sol.Piste) return -0.025;
  return 0;
}

/** Poids de la case « de droite » le long d'un axe, pour une fraction f dans la case. */
function poidsAxe(f: number): { decal: number; p: number } {
  if (f < RAMPE) return { decal: -1, p: 0.5 - (0.5 * f) / RAMPE };
  if (f > 1 - RAMPE) return { decal: 1, p: (0.5 * (f - (1 - RAMPE))) / RAMPE };
  return { decal: 0, p: 0 };
}

/**
 * Hauteur du terrain au point (fx, fz) en coordonnées de case (réelles).
 * Plat au cœur des cases, rampes courtes aux limites entre terrasses.
 */
export function hauteurTerrain(carte: Carte, fx: number, fz: number): number {
  const tx = borne(Math.floor(fx));
  const tz = borne(Math.floor(fz));
  const ax = poidsAxe(fx - tx);
  const az = poidsAxe(fz - tz);
  const nx = borne(tx + ax.decal);
  const nz = borne(tz + az.decal);
  const h = (x: number, z: number) => carte.elev[z * N + x] * NIVEAU + relief(carte, x, z, fx, fz);
  const h00 = h(tx, tz);
  if (ax.p === 0 && az.p === 0) return h00;
  const h10 = h(nx, tz);
  const h01 = h(tx, nz);
  const h11 = h(nx, nz);
  return (
    h00 * (1 - ax.p) * (1 - az.p) + h10 * ax.p * (1 - az.p) + h01 * (1 - ax.p) * az.p + h11 * ax.p * az.p
  );
}

/** Hauteur du sol au centre d'une emprise (bâtiment posé à plat). */
export function hauteurEmprise(carte: Carte, x: number, z: number): number {
  return carte.elev[z * N + x] * NIVEAU;
}
