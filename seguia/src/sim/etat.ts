import { B, BATIMENTS } from './balance';
import { genererCarte } from './mapgen';
import { rngCreer } from './rng';
import {
  DT_H,
  JOURS_PAR_AN,
  JOURS_PAR_SAISON,
  N,
  NN,
  PAS_PAR_JOUR,
  type Batiment,
  type BatimentKind,
  type Calendrier,
  type Dir,
  type GameState,
  type OptionsPartie,
  type Saison,
} from './types';

export const VERSION_ETAT = 1;
/** Graine de la carte du scénario (multiple de 8 : symétrie identité). */
export const GRAINE_SCENARIO = 20261120;
/** Une partie commence à 7 h du matin du premier jour. */
export const PAS_DEPART = 140;

export function nouveauBatiment(id: number, kind: BatimentKind, x: number, z: number, rot: Dir, pas: number): Batiment {
  const def = BATIMENTS[kind];
  const tourne = rot === 1 || rot === 3;
  return {
    id,
    kind,
    x,
    z,
    w: tourne ? def.d : def.w,
    d: tourne ? def.w : def.d,
    rot,
    variante: id % 3,
    chantier: 0,
    posePas: pas,
    pause: false,
    stock: 0,
    vanne: 0,
    poids: [1, 1, 1, 1],
    croissance: 0,
    sante: 1,
    habitants: 0,
    reste: 0,
    eauRatio: 1,
    personnel: 1,
  };
}

export function creerPartie(graine: number, options?: Partial<OptionsPartie>): GameState {
  const gen = genererCarte(graine);
  const opts: OptionsPartie = { secheresse: false, nomCarte: 'Aïn Tamda', ...options };
  const s: GameState = {
    version: VERSION_ETAT,
    graine,
    options: opts,
    pas: PAS_DEPART,
    rng: {
      meteo: rngCreer(graine, 1),
      caravanes: rngCreer(graine, 2),
      divers: rngCreer(graine, 3),
    },
    prochainId: 1,
    carte: gen.carte,
    canal: new Uint8Array(NN),
    cloture: new Uint8Array(NN),
    clotureEtat: new Float64Array(NN),
    humidite: new Float64Array(NN),
    sable: new Float64Array(NN),
    batiments: [],
    res: {
      pieces: B.departPieces,
      materiaux: B.departMateriaux,
      vivres: B.departVivres,
      dattes: 0,
    },
    renommeeCaravanes: 0,
    stats: {
      caravanesServies: 0,
      caravanesPartielles: 0,
      caravanesManquees: 0,
      dattesVendues: 0,
      recoltes: 0,
      jardinsPerdus: 0,
      palmiersPerdus: 0,
      habitantsPartis: 0,
      eauInjectee: 0,
      eauUtile: 0,
      eauEvaporee: 0,
      eauDeversee: 0,
      jardinsPerdusSaisonChaude: 0,
    },
    foggaraNiveau: 0,
    foggaraChantier: -1,
    meteo: [],
    meteoAnneeProgrammee: -1,
    caravanes: [],
    premiereCaravaneLancee: false,
    commandeMateriaux: 10,
    corvee: false,
    faim: 0,
    progression: {
      palier: 0,
      vocation: null,
      choixVocationEnAttente: false,
      grandeTempetePassee: false,
      victoirePas: -1,
      conseilsFaits: [],
    },
    annulables: [],
    journal: [],
  };
  // source (fixe) et sa case de sortie maçonnée
  const src = nouveauBatiment(s.prochainId++, 'source', gen.sourceX, gen.sourceZ, 0, 0);
  src.posePas = -100000;
  src.chantier = 1;
  s.batiments.push(src);
  s.canal[gen.carte.sourceCase] = 2;
  // campement de départ
  const camp = nouveauBatiment(s.prochainId++, 'maison', gen.campX, gen.campZ, 0, 0);
  camp.chantier = 1;
  camp.habitants = B.departHabitants;
  camp.posePas = -100000;
  s.batiments.push(camp);
  return s;
}

/* ---------- Aides de grille ---------- */

export const idx = (x: number, z: number) => z * N + x;
export const cx = (i: number) => i % N;
export const cz = (i: number) => (i / N) | 0;
export const dans = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N;

/** Cases de l'emprise d'un bâtiment. */
export function casesDe(b: { x: number; z: number; w: number; d: number }): number[] {
  const r: number[] = [];
  for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) r.push(idx(b.x + dx, b.z + dz));
  return r;
}

/** Cases voisines (4-voisinage) du pourtour d'une emprise. */
export function pourtourDe(b: { x: number; z: number; w: number; d: number }): number[] {
  const r: number[] = [];
  for (let dx = 0; dx < b.w; dx++) {
    if (dans(b.x + dx, b.z - 1)) r.push(idx(b.x + dx, b.z - 1));
    if (dans(b.x + dx, b.z + b.d)) r.push(idx(b.x + dx, b.z + b.d));
  }
  for (let dz = 0; dz < b.d; dz++) {
    if (dans(b.x - 1, b.z + dz)) r.push(idx(b.x - 1, b.z + dz));
    if (dans(b.x + b.w, b.z + dz)) r.push(idx(b.x + b.w, b.z + dz));
  }
  return r;
}

export function batimentParId(s: GameState, id: number): Batiment | undefined {
  // tableau trié par id : recherche dichotomique
  let lo = 0;
  let hi = s.batiments.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    const v = s.batiments[m].id;
    if (v === id) return s.batiments[m];
    if (v < id) lo = m + 1;
    else hi = m - 1;
  }
  return undefined;
}

/* ---------- Calendrier ---------- */

export function calendrier(pas: number): Calendrier {
  const jour = Math.floor(pas / PAS_PAR_JOUR);
  const heure = ((pas % PAS_PAR_JOUR) * DT_H) % 24;
  const annee = Math.floor(jour / JOURS_PAR_AN);
  const jourAnnee = jour % JOURS_PAR_AN;
  const saison = Math.floor(jourAnnee / JOURS_PAR_SAISON) as Saison;
  // lumière : lever vers 6 h, coucher vers 19 h, transitions douces d'une heure et demie
  const lever = lisse((heure - 4.4) / 1.5);
  const coucher = 1 - lisse((heure - 19.3) / 1.5);
  return {
    jour,
    heure,
    annee,
    jourAnnee,
    saison,
    jourSaison: jourAnnee % JOURS_PAR_SAISON,
    lumiere: Math.min(lever, coucher),
  };
}

function lisse(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

export function population(s: GameState): number {
  let p = 0;
  for (const b of s.batiments) if (b.kind === 'maison') p += b.habitants;
  return p;
}

export function logements(s: GameState): number {
  let p = 0;
  for (const b of s.batiments) if (b.kind === 'maison' && b.chantier >= 1) p += B.maisonCapacite;
  return p;
}

export function journal(s: GameState, ton: 'info' | 'bien' | 'alerte', texte: string) {
  s.journal.push({ pas: s.pas, ton, texte });
  if (s.journal.length > 40) s.journal.splice(0, s.journal.length - 40);
}

export function canicule(s: GameState): boolean {
  for (const m of s.meteo) if (m.type === 'canicule' && s.pas >= m.debutPas && s.pas < m.finPas) return true;
  return false;
}

export function tempeteEnCours(s: GameState) {
  for (const m of s.meteo) if (m.type === 'tempete' && s.pas >= m.debutPas && s.pas < m.finPas) return m;
  return null;
}
