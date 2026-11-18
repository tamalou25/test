/**
 * Données DÉRIVÉES de l'état (jamais sauvegardées, reconstruites à la demande) :
 * occupation des cases, topologie du réseau d'eau, ombre, exposition au vent, débits du dernier pas.
 */
import { B, BATIMENTS } from './balance';
import { casesDe, pourtourDe, cx, cz, dans, idx } from './etat';
import { DX, DZ, N, NN, Sol, type Batiment, type Dir, type GameState } from './types';

export interface Cache {
  /** id du bâtiment occupant chaque case (0 : aucun) */
  occ: Int32Array;
  topoSale: boolean;
  /** cases du réseau dans l'ordre de traitement (amont avant aval) */
  ordre: Int32Array;
  nbOrdre: number;
  /** rang de traitement de la case, -1 si l'eau ne peut pas l'atteindre */
  rang: Int32Array;
  /** case parente, -1 pour une racine, -2 si non atteinte */
  parent: Int32Array;
  /** enfant[i*4+dir] : case enfant dans cette direction, ou -1 */
  enfant: Int32Array;
  /** bâtiments consommateurs branchés sur chaque case (triés par id) */
  conso: Map<number, Batiment[]>;
  /** case de branchement de chaque bâtiment (id → case), absente si non raccordé */
  branchement: Map<number, number>;
  /** noria : case haute où l'eau est rejetée */
  rejet: Map<number, number>;
  /** répartiteur complet posé sur la case (id → bâtiment) */
  repartiteurs: Map<number, Batiment>;
  /** débit traversant chaque case au dernier pas (u/h) */
  debit: Float32Array;
  /** eau déversée sur la case au dernier pas (u/h) */
  deverse: Float32Array;
  recu: Float64Array;
  inject: Float64Array;
  /** 1 si la case est à l'ombre d'une palmeraie adulte */
  ombre: Uint8Array;
  ombrePas: number;
  /** exposition au vent de la tempête 0..1 */
  expo: Float32Array;
  expoPas: number;
  expoDir: number;
  /** bilan du dernier pas (u/h) */
  bilan: { injecte: number; source: number; evapore: number; consomme: number; deverse: number };
  /** main-d'œuvre du dernier pas */
  ouvriersLibres: number;
  postes: number;
  /** compteurs dérivés rafraîchis périodiquement */
  casesVertes: number;
  renommee: number;
  cibleHumidite: Float32Array;
}

const caches = new WeakMap<GameState, Cache>();

export function cacheDe(s: GameState): Cache {
  let c = caches.get(s);
  if (!c) {
    c = {
      occ: new Int32Array(NN),
      topoSale: true,
      ordre: new Int32Array(NN),
      nbOrdre: 0,
      rang: new Int32Array(NN).fill(-1),
      parent: new Int32Array(NN).fill(-2),
      enfant: new Int32Array(NN * 4).fill(-1),
      conso: new Map(),
      branchement: new Map(),
      rejet: new Map(),
      repartiteurs: new Map(),
      debit: new Float32Array(NN),
      deverse: new Float32Array(NN),
      recu: new Float64Array(NN),
      inject: new Float64Array(NN),
      ombre: new Uint8Array(NN),
      ombrePas: -1000,
      expo: new Float32Array(NN),
      expoPas: -1000,
      expoDir: -1,
      bilan: { injecte: 0, source: 0, evapore: 0, consomme: 0, deverse: 0 },
      ouvriersLibres: 0,
      postes: 0,
      casesVertes: 0,
      renommee: 0,
      cibleHumidite: new Float32Array(NN),
    };
    caches.set(s, c);
    reconstruireOcc(s, c);
  }
  return c;
}

export function invalider(s: GameState) {
  const c = cacheDe(s);
  c.topoSale = true;
  c.ombrePas = -1000;
  c.expoPas = -1000;
  reconstruireOcc(s, c);
}

function reconstruireOcc(s: GameState, c: Cache) {
  c.occ.fill(0);
  for (const b of s.batiments) for (const i of casesDe(b)) c.occ[i] = b.id;
}

/** Reconstruit la topologie du réseau si nécessaire. */
export function topologie(s: GameState): Cache {
  const c = cacheDe(s);
  if (!c.topoSale) return c;
  c.topoSale = false;
  const { elev } = s.carte;
  const canal = s.canal;
  c.rang.fill(-1);
  c.parent.fill(-2);
  c.enfant.fill(-1);
  c.conso.clear();
  c.branchement.clear();
  c.rejet.clear();
  c.repartiteurs.clear();
  let n = 0;

  const parcours = (racine: number) => {
    if (c.rang[racine] >= 0 || canal[racine] === 0) return;
    let tete = n;
    c.rang[racine] = n;
    c.parent[racine] = -1;
    c.ordre[n++] = racine;
    while (tete < n) {
      const i = c.ordre[tete++];
      const x = cx(i);
      const z = cz(i);
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const nz = z + DZ[k];
        if (!dans(nx, nz)) continue;
        const j = idx(nx, nz);
        if (canal[j] === 0 || c.rang[j] >= 0) continue;
        if (elev[j] > elev[i]) continue; // l'eau ne remonte pas
        c.rang[j] = n;
        c.parent[j] = i;
        c.enfant[i * 4 + k] = j;
        c.ordre[n++] = j;
      }
    }
  };

  // phase 1 : la source
  parcours(s.carte.sourceCase);

  /** meilleure case de séguia atteinte au pourtour (rang minimal), selon une condition d'altitude */
  const meilleure = (b: Batiment, ok: (elevCase: number, elevBat: number) => boolean): number => {
    const eb = elev[idx(b.x, b.z)];
    let best = -1;
    for (const i of pourtourDe(b)) {
      if (canal[i] === 0 || c.rang[i] < 0) continue;
      if (!ok(elev[i], eb)) continue;
      if (best < 0 || c.rang[i] < c.rang[best]) best = i;
    }
    return best;
  };
  const premiereLibre = (b: Batiment, ok: (elevCase: number, elevBat: number) => boolean): number => {
    const eb = elev[idx(b.x, b.z)];
    for (const i of pourtourDe(b)) {
      if (canal[i] !== 0 && c.rang[i] < 0 && ok(elev[i], eb)) return i;
    }
    return -1;
  };

  // phase 2 : puits et norias en service peuvent alimenter des tronçons que la source n'atteint pas
  for (let passe = 0; passe < 2; passe++) {
    for (const b of s.batiments) {
      if (b.chantier < 1) continue;
      if (b.kind === 'puits' && !c.branchement.has(b.id)) {
        let i = meilleure(b, (ec, eb) => ec <= eb);
        if (i < 0) {
          i = premiereLibre(b, (ec, eb) => ec <= eb);
          if (i >= 0) parcours(i);
        }
        if (i >= 0) c.branchement.set(b.id, i);
      } else if (b.kind === 'noria' && !c.rejet.has(b.id)) {
        const bas = meilleure(b, (ec, eb) => ec === eb);
        if (bas < 0) continue;
        let haut = meilleure(b, (ec, eb) => ec === eb + 1);
        if (haut < 0) {
          haut = premiereLibre(b, (ec, eb) => ec === eb + 1);
          if (haut >= 0) parcours(haut);
        }
        if (haut >= 0) {
          c.branchement.set(b.id, bas);
          c.rejet.set(b.id, haut);
        }
      }
    }
  }
  c.nbOrdre = n;

  // branchement des consommateurs
  for (const b of s.batiments) {
    if (b.kind === 'repartiteur') {
      if (b.chantier >= 1) c.repartiteurs.set(idx(b.x, b.z), b);
      continue;
    }
    const def = BATIMENTS[b.kind];
    if (!def.branche || b.kind === 'puits') continue;
    let i = c.branchement.get(b.id) ?? -1;
    if (b.kind !== 'noria') {
      i = meilleure(b, (ec, eb) => ec >= eb);
      if (i >= 0) c.branchement.set(b.id, i);
    }
    if (i < 0) continue;
    let liste = c.conso.get(i);
    if (!liste) {
      liste = [];
      c.conso.set(i, liste);
    }
    liste.push(b); // s.batiments est trié par id : la liste l'est aussi
  }
  return c;
}

/** Ombre des palmeraies adultes : leur emprise et une case autour. */
export function majOmbre(s: GameState, c: Cache) {
  c.ombrePas = s.pas;
  c.ombre.fill(0);
  for (const b of s.batiments) {
    if (b.kind !== 'palmeraie' || b.chantier < 1 || b.croissance < B.palmeraieMature || b.sante <= 0) continue;
    for (let z = b.z - 1; z <= b.z + b.d; z++)
      for (let x = b.x - 1; x <= b.x + b.w; x++) if (dans(x, z)) c.ombre[idx(x, z)] = 1;
  }
}

/** Longueur d'abri (en cases sous le vent) offerte par une case, 0 si aucune. */
function abriDe(s: GameState, c: Cache, i: number): number {
  if (s.cloture[i] === 1) return B.abriCloture;
  if (s.cloture[i] === 2) return s.clotureEtat[i] > 0.3 ? B.abriHaie : 1;
  if (s.carte.sol[i] === Sol.Roche) return B.abriRelief;
  const id = c.occ[i];
  if (id) {
    // recherche linéaire évitée : on retrouve le bâtiment par dichotomie
    let lo = 0;
    let hi = s.batiments.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const b = s.batiments[m];
      if (b.id === id) {
        if (b.kind === 'palmeraie') return b.croissance >= B.palmeraieMature && b.sante > 0 ? B.abriPalmeraie : 1;
        if (b.kind === 'jardin' || b.kind === 'repartiteur') return 0;
        return b.chantier >= 1 ? B.abriBatiment : 0;
      }
      if (b.id < id) lo = m + 1;
      else hi = m - 1;
    }
  }
  return 0;
}

/** Exposition de chaque case à un vent venant de `dir` : 1 exposée, B.sableAbri abritée. */
export function majExposition(s: GameState, c: Cache, dir: Dir) {
  c.expoDir = dir;
  c.expoPas = s.pas;
  const { elev } = s.carte;
  for (let i = 0; i < NN; i++) {
    const x = cx(i);
    const z = cz(i);
    let abritee = false;
    for (let k = 1; k <= 5 && !abritee; k++) {
      const ux = x + DX[dir] * k;
      const uz = z + DZ[dir] * k;
      if (!dans(ux, uz)) break;
      const j = idx(ux, uz);
      if (elev[j] > elev[i]) {
        if (k <= B.abriRelief) abritee = true;
        continue;
      }
      if (abriDe(s, c, j) >= k) abritee = true;
    }
    c.expo[i] = abritee ? B.sableAbri : 1;
  }
}

/** Exposition qu'aurait une case pour un vent donné (aperçu de l'interface), sans toucher au cache. */
export function expositionApercu(s: GameState, dir: Dir): Float32Array {
  const c = cacheDe(s);
  const sauve = { d: c.expoDir, p: c.expoPas, e: c.expo.slice() };
  majExposition(s, c, dir);
  const r = c.expo.slice();
  c.expo.set(sauve.e);
  c.expoDir = sauve.d;
  c.expoPas = sauve.p;
  return r;
}
