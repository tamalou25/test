/**
 * Sérialisation de l'état : JSON versionné avec somme de contrôle.
 * Seul l'état de simulation entre dans la somme ; la section `ui` (caméra, vitesse) en est exclue.
 */
import { cacheDe, invalider } from './cache';
import { BATIMENTS } from './balance';
import { calendrier, population, VERSION_ETAT } from './etat';
import { rechaufferCache } from './pas';
import { detailRenommee } from './progression';
import { NN, type GameState } from './types';

export const FORMAT = 'seguia-sauvegarde';

export interface MetaSauvegarde {
  dateIso: string;
  jour: number;
  annee: number;
  saison: number;
  palier: number;
  habitants: number;
  renommee: number;
  carte: string;
  vocation: string | null;
}

export interface UiSauvegarde {
  vitesse: number;
  camera?: { x: number; z: number; distance: number; azimut: number; inclinaison: number };
}

export type Chargement =
  | { ok: true; etat: GameState; ui: UiSauvegarde; meta: MetaSauvegarde }
  | { ok: false; erreur: string };

/* ---------- base64 (sans dépendre de btoa/Buffer) ---------- */

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INV = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHA.length; i++) INV[ALPHA.charCodeAt(i)] = i;

export function versBase64(o: Uint8Array): string {
  let r = '';
  let i = 0;
  for (; i + 2 < o.length; i += 3) {
    const n = (o[i] << 16) | (o[i + 1] << 8) | o[i + 2];
    r += ALPHA[n >> 18] + ALPHA[(n >> 12) & 63] + ALPHA[(n >> 6) & 63] + ALPHA[n & 63];
  }
  if (i + 1 === o.length) {
    const n = o[i] << 16;
    r += ALPHA[n >> 18] + ALPHA[(n >> 12) & 63] + '==';
  } else if (i + 2 === o.length) {
    const n = (o[i] << 16) | (o[i + 1] << 8);
    r += ALPHA[n >> 18] + ALPHA[(n >> 12) & 63] + ALPHA[(n >> 6) & 63] + '=';
  }
  return r;
}

export function depuisBase64(t: string): Uint8Array {
  const propre = t.replace(/=+$/, '');
  const n = Math.floor((propre.length * 3) / 4);
  const o = new Uint8Array(n);
  let acc = 0;
  let bits = 0;
  let k = 0;
  for (let i = 0; i < propre.length; i++) {
    const code = propre.charCodeAt(i);
    const v = code < 128 ? INV[code] : -1;
    if (v < 0) throw new Error('base64 invalide');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      o[k++] = (acc >> bits) & 255;
    }
  }
  return o;
}

const f64 = (a: Float64Array) => versBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const u8 = (a: Uint8Array) => versBase64(a);

function lireF64(t: unknown, nom: string): Float64Array {
  if (typeof t !== 'string') throw new Error(`champ ${nom} manquant`);
  const o = depuisBase64(t);
  if (o.length !== NN * 8) throw new Error(`champ ${nom} de taille inattendue`);
  const r = new Float64Array(NN);
  new Uint8Array(r.buffer).set(o);
  for (let i = 0; i < NN; i++) if (!Number.isFinite(r[i])) throw new Error(`champ ${nom} : valeur non finie`);
  return r;
}

function lireU8(t: unknown, nom: string): Uint8Array {
  if (typeof t !== 'string') throw new Error(`champ ${nom} manquant`);
  const o = depuisBase64(t);
  if (o.length !== NN) throw new Error(`champ ${nom} de taille inattendue`);
  return o;
}

/* ---------- somme de contrôle (deux hachages 32 bits) ---------- */

export function somme(texte: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/* ---------- état → objet simple (ordre des clés fixe) ---------- */

export function versObjet(s: GameState): Record<string, unknown> {
  return {
    version: s.version,
    graine: s.graine,
    options: { secheresse: s.options.secheresse, nomCarte: s.options.nomCarte },
    pas: s.pas,
    rng: { meteo: [...s.rng.meteo], caravanes: [...s.rng.caravanes], divers: [...s.rng.divers] },
    prochainId: s.prochainId,
    carte: {
      elev: u8(s.carte.elev),
      sol: u8(s.carte.sol),
      piste: [...s.carte.piste],
      sourceCase: s.carte.sourceCase,
      ventDominant: s.carte.ventDominant,
    },
    canal: u8(s.canal),
    cloture: u8(s.cloture),
    clotureEtat: f64(s.clotureEtat),
    humidite: f64(s.humidite),
    sable: f64(s.sable),
    batiments: s.batiments.map((b) => ({
      id: b.id,
      kind: b.kind,
      x: b.x,
      z: b.z,
      w: b.w,
      d: b.d,
      rot: b.rot,
      variante: b.variante,
      chantier: b.chantier,
      posePas: b.posePas,
      pause: b.pause,
      stock: b.stock,
      vanne: b.vanne,
      poids: [...b.poids],
      croissance: b.croissance,
      sante: b.sante,
      habitants: b.habitants,
      reste: b.reste,
      eauRatio: b.eauRatio,
      personnel: b.personnel,
    })),
    res: { pieces: s.res.pieces, materiaux: s.res.materiaux, vivres: s.res.vivres, dattes: s.res.dattes },
    renommeeCaravanes: s.renommeeCaravanes,
    stats: { ...s.stats },
    foggaraNiveau: s.foggaraNiveau,
    foggaraChantier: s.foggaraChantier,
    meteo: s.meteo.map((m) => ({ ...m })),
    meteoAnneeProgrammee: s.meteoAnneeProgrammee,
    caravanes: s.caravanes.map((c) => ({ ...c })),
    premiereCaravaneLancee: s.premiereCaravaneLancee,
    commandeMateriaux: s.commandeMateriaux,
    corvee: s.corvee,
    faim: s.faim,
    progression: { ...s.progression, conseilsFaits: [...s.progression.conseilsFaits] },
    annulables: s.annulables.map((a) => ({ ...a, cases: [...a.cases], avant: [...a.avant] })),
    journal: s.journal.map((j) => ({ ...j })),
  };
}

/** Empreinte de l'état de simulation (sert aux tests de déterminisme). */
export function empreinte(s: GameState): string {
  return somme(JSON.stringify(versObjet(s)));
}

export function metaDe(s: GameState, dateIso: string): MetaSauvegarde {
  const cal = calendrier(s.pas);
  return {
    dateIso,
    jour: cal.jour,
    annee: cal.annee,
    saison: cal.saison,
    palier: s.progression.palier,
    habitants: population(s),
    renommee: detailRenommee(s, cacheDe(s)).total,
    carte: s.options.nomCarte,
    vocation: s.progression.vocation,
  };
}

/** Produit le texte du fichier de sauvegarde. `dateIso` est fournie par l'appelant (la simulation ne lit pas l'horloge). */
export function serialiser(s: GameState, ui: UiSauvegarde, dateIso: string): string {
  const etat = versObjet(s);
  const texteEtat = JSON.stringify(etat);
  return JSON.stringify({
    format: FORMAT,
    version: VERSION_ETAT,
    somme: somme(texteEtat),
    meta: metaDe(s, dateIso),
    ui,
    etat,
  });
}

/* ---------- migrations : version n → n+1 ---------- */

const MIGRATIONS: Record<number, (etat: any) => any> = {
  // exemple pour une future version 2 :
  // 1: (e) => ({ ...e, version: 2, nouveauChamp: 0 }),
};

function nombre(v: unknown, nom: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`champ ${nom} invalide`);
  return v;
}

function verifierNombres(o: unknown, chemin: string, nulsPermis: Set<string>) {
  if (o === null) {
    if (!nulsPermis.has(chemin)) throw new Error(`valeur manquante : ${chemin}`);
    return;
  }
  if (typeof o === 'number') {
    if (!Number.isFinite(o)) throw new Error(`nombre invalide : ${chemin}`);
    return;
  }
  if (Array.isArray(o)) {
    for (let i = 0; i < o.length; i++) verifierNombres(o[i], chemin, nulsPermis);
    return;
  }
  if (typeof o === 'object') {
    for (const k of Object.keys(o as object)) verifierNombres((o as any)[k], chemin ? `${chemin}.${k}` : k, nulsPermis);
  }
}

/* ---------- vérifications de forme ---------- */

const PHASES = ['annoncee', 'approche', 'abreuvage', 'commerce', 'depart', 'passe'];

function entier(v: unknown, nom: string, min: number, max: number): number {
  const n = nombre(v, nom);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`champ ${nom} hors bornes`);
  return n;
}
function borne(v: unknown, nom: string, min: number, max: number): number {
  const n = nombre(v, nom);
  if (n < min || n > max) throw new Error(`champ ${nom} hors bornes`);
  return n;
}
function bool(v: unknown, nom: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`champ ${nom} invalide`);
  return v;
}
function objet(v: unknown, nom: string): any {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`bloc ${nom} manquant`);
  return v;
}
function liste(v: unknown, nom: string): any[] {
  if (!Array.isArray(v)) throw new Error(`liste ${nom} manquante`);
  return v;
}
function rngLu(v: unknown, nom: string): [number, number, number, number] {
  const l = liste(v, nom);
  if (l.length !== 4) throw new Error('générateur aléatoire incomplet');
  return l.map((x) => entier(x, nom, 0, 4294967295)) as [number, number, number, number];
}
function grilleBornee(a: Uint8Array, max: number, nom: string) {
  for (let i = 0; i < a.length; i++) if (a[i] > max) throw new Error(`champ ${nom} : valeur inconnue`);
}
function grille01(a: Float64Array, nom: string) {
  for (let i = 0; i < a.length; i++) if (a[i] < 0 || a[i] > 1) throw new Error(`champ ${nom} hors bornes`);
}

/** Reconstruit un état à partir de l'objet simple. Lève une Error si la structure est incohérente. */
export function depuisObjet(e: any): GameState {
  objet(e, 'état');
  verifierNombres(e, '', new Set(['progression.vocation']));
  const carte = objet(e.carte, 'carte');
  const piste = liste(carte.piste, 'carte.piste');
  if (piste.length < 10) throw new Error('carte incomplète');
  const rng = objet(e.rng, 'rng');
  const res = objet(e.res, 'res');
  const st = objet(e.stats, 'stats');
  const pr = objet(e.progression, 'progression');
  const options = objet(e.options, 'options');

  let dernier = 0;
  const batiments = liste(e.batiments, 'batiments').map((b: any, k: number) => {
    objet(b, 'bâtiment');
    const nom = `batiments.${k}`;
    if (typeof b.kind !== 'string' || !Object.prototype.hasOwnProperty.call(BATIMENTS, b.kind)) throw new Error('type de bâtiment inconnu');
    const id = entier(b.id, nom + '.id', 1, 1e9);
    if (id <= dernier) throw new Error('liste des bâtiments incohérente');
    dernier = id;
    const w = entier(b.w, nom + '.w', 1, 4);
    const d = entier(b.d, nom + '.d', 1, 4);
    const x = entier(b.x, nom + '.x', 0, 43);
    const z = entier(b.z, nom + '.z', 0, 43);
    if (x + w > 44 || z + d > 44) throw new Error('bâtiment hors du plateau');
    const poids = liste(b.poids, nom + '.poids');
    if (poids.length !== 4) throw new Error('poids de répartiteur incomplets');
    return {
      id,
      kind: b.kind,
      x,
      z,
      w,
      d,
      rot: entier(b.rot, nom + '.rot', 0, 3),
      variante: entier(b.variante, nom + '.variante', 0, 1e9),
      chantier: borne(b.chantier, nom + '.chantier', 0, 1),
      posePas: nombre(b.posePas, nom + '.posePas'),
      pause: bool(b.pause, nom + '.pause'),
      stock: borne(b.stock, nom + '.stock', 0, 1e6),
      vanne: entier(b.vanne, nom + '.vanne', 0, 2),
      poids: poids.map((p: unknown) => entier(p, nom + '.poids', 0, 3)),
      croissance: borne(b.croissance, nom + '.croissance', 0, 1.000001),
      sante: borne(b.sante, nom + '.sante', 0, 1),
      habitants: entier(b.habitants, nom + '.habitants', 0, 4),
      reste: nombre(b.reste, nom + '.reste'),
      eauRatio: borne(b.eauRatio, nom + '.eauRatio', 0, 1.000001),
      personnel: borne(b.personnel, nom + '.personnel', 0, 1),
    } as GameState['batiments'][number];
  });

  const caravanes = liste(e.caravanes, 'caravanes').map((c: any, k: number) => {
    objet(c, 'caravane');
    const nom = `caravanes.${k}`;
    if (!PHASES.includes(c.phase)) throw new Error('phase de caravane inconnue');
    return {
      id: entier(c.id, nom + '.id', 1, 1e9),
      chameaux: entier(c.chameaux, nom + '.chameaux', 1, 200),
      besoin: borne(c.besoin, nom + '.besoin', 0.001, 1e6),
      bu: borne(c.bu, nom + '.bu', 0, 1e6),
      phase: c.phase,
      arriveePas: nombre(c.arriveePas, nom + '.arriveePas'),
      pos: borne(c.pos, nom + '.pos', 0, 1e4),
      arret: entier(c.arret, nom + '.arret', -1, 1e4),
      finPhasePas: nombre(c.finPhasePas, nom + '.finPhasePas'),
      satisfaction: borne(c.satisfaction, nom + '.satisfaction', 0, 1),
      paiement: nombre(c.paiement, nom + '.paiement'),
      dattesVendues: nombre(c.dattesVendues, nom + '.dattesVendues'),
      materiauxAchetes: nombre(c.materiauxAchetes, nom + '.materiauxAchetes'),
      colons: nombre(c.colons, nom + '.colons'),
      vivresVendus: nombre(c.vivresVendus, nom + '.vivresVendus'),
      annonceFaite: bool(c.annonceFaite, nom + '.annonceFaite'),
      indulgente: bool(c.indulgente, nom + '.indulgente'),
    } as GameState['caravanes'][number];
  });

  const meteo = liste(e.meteo, 'meteo').map((m: any, k: number) => {
    objet(m, 'météo');
    const nom = `meteo.${k}`;
    if (m.type !== 'tempete' && m.type !== 'canicule') throw new Error('événement météo inconnu');
    return {
      type: m.type,
      debutPas: nombre(m.debutPas, nom + '.debutPas'),
      finPas: nombre(m.finPas, nom + '.finPas'),
      dir: entier(m.dir, nom + '.dir', 0, 3),
      intensite: borne(m.intensite, nom + '.intensite', 0, 5),
      grande: bool(m.grande, nom + '.grande'),
      annoncee: bool(m.annoncee, nom + '.annoncee'),
    } as GameState['meteo'][number];
  });

  const statsCles = [
    'caravanesServies', 'caravanesPartielles', 'caravanesManquees', 'dattesVendues', 'recoltes', 'jardinsPerdus',
    'palmiersPerdus', 'habitantsPartis', 'eauInjectee', 'eauUtile', 'eauEvaporee', 'eauDeversee', 'jardinsPerdusSaisonChaude',
  ] as const;
  const stats = {} as GameState['stats'];
  for (const k of statsCles) stats[k] = borne(st[k], 'stats.' + k, 0, 1e15);

  if (pr.vocation !== null && pr.vocation !== 'etape' && pr.vocation !== 'grenier') throw new Error('vocation inconnue');

  const s: GameState = {
    version: nombre(e.version, 'version'),
    graine: nombre(e.graine, 'graine'),
    options: { secheresse: !!options.secheresse, nomCarte: String(options.nomCarte ?? 'Oasis').slice(0, 60) },
    pas: entier(e.pas, 'pas', 0, 1e12),
    rng: { meteo: rngLu(rng.meteo, 'rng.meteo'), caravanes: rngLu(rng.caravanes, 'rng.caravanes'), divers: rngLu(rng.divers, 'rng.divers') },
    prochainId: entier(e.prochainId, 'prochainId', 1, 1e9),
    carte: {
      elev: lireU8(carte.elev, 'carte.elev'),
      sol: lireU8(carte.sol, 'carte.sol'),
      piste: piste.map((p: unknown) => entier(p, 'carte.piste', 0, NN - 1)),
      sourceCase: entier(carte.sourceCase, 'carte.sourceCase', 0, NN - 1),
      ventDominant: entier(carte.ventDominant, 'carte.ventDominant', 0, 3) as 0 | 1 | 2 | 3,
    },
    canal: lireU8(e.canal, 'canal'),
    cloture: lireU8(e.cloture, 'cloture'),
    clotureEtat: lireF64(e.clotureEtat, 'clotureEtat'),
    humidite: lireF64(e.humidite, 'humidite'),
    sable: lireF64(e.sable, 'sable'),
    batiments,
    res: {
      pieces: borne(res.pieces, 'res.pieces', -1e-6, 1e12),
      materiaux: borne(res.materiaux, 'res.materiaux', -1e-6, 1e12),
      vivres: borne(res.vivres, 'res.vivres', -1e-6, 1e12),
      dattes: borne(res.dattes, 'res.dattes', -1e-6, 1e12),
    },
    renommeeCaravanes: nombre(e.renommeeCaravanes, 'renommeeCaravanes'),
    stats,
    foggaraNiveau: entier(e.foggaraNiveau, 'foggaraNiveau', 0, 2),
    foggaraChantier: borne(e.foggaraChantier, 'foggaraChantier', -1, 1),
    meteo,
    meteoAnneeProgrammee: entier(e.meteoAnneeProgrammee, 'meteoAnneeProgrammee', -1, 1e6),
    caravanes,
    premiereCaravaneLancee: bool(e.premiereCaravaneLancee, 'premiereCaravaneLancee'),
    commandeMateriaux: borne(e.commandeMateriaux, 'commandeMateriaux', 0, 60),
    corvee: bool(e.corvee, 'corvee'),
    faim: entier(e.faim, 'faim', 0, 1e9),
    progression: {
      palier: entier(pr.palier, 'progression.palier', 0, 3) as 0 | 1 | 2 | 3,
      vocation: pr.vocation,
      choixVocationEnAttente: bool(pr.choixVocationEnAttente, 'progression.choixVocationEnAttente'),
      grandeTempetePassee: bool(pr.grandeTempetePassee, 'progression.grandeTempetePassee'),
      victoirePas: nombre(pr.victoirePas, 'progression.victoirePas'),
      conseilsFaits: liste(pr.conseilsFaits ?? [], 'progression.conseilsFaits').map((x: unknown) => String(x)),
    },
    annulables: liste(e.annulables ?? [], 'annulables').map((a: any) => {
      objet(a, 'action annulable');
      if (a.type !== 'batiment' && a.type !== 'canal' && a.type !== 'cloture') throw new Error('action annulable inconnue');
      const cases = liste(a.cases, 'annulables.cases').map((x: unknown) => entier(x, 'annulables.cases', 0, NN - 1));
      const avant = liste(a.avant, 'annulables.avant').map((x: unknown) => entier(x, 'annulables.avant', 0, 2));
      if (cases.length !== avant.length) throw new Error('action annulable incohérente');
      return { pas: nombre(a.pas, 'annulables.pas'), type: a.type, id: entier(a.id, 'annulables.id', 0, 1e9), cases, avant, pieces: nombre(a.pieces, 'annulables.pieces'), materiaux: nombre(a.materiaux, 'annulables.materiaux') };
    }),
    journal: liste(e.journal ?? [], 'journal').map((j: any) => ({
      pas: nombre(objet(j, 'journal').pas, 'journal.pas'),
      ton: j.ton === 'bien' || j.ton === 'alerte' ? j.ton : 'info',
      texte: String(j.texte ?? '').slice(0, 300),
    })),
  };
  grilleBornee(s.carte.elev, 3, 'carte.elev');
  grilleBornee(s.carte.sol, 4, 'carte.sol');
  grilleBornee(s.canal, 2, 'canal');
  grilleBornee(s.cloture, 2, 'cloture');
  grille01(s.clotureEtat, 'clotureEtat');
  grille01(s.humidite, 'humidite');
  grille01(s.sable, 'sable');
  if (s.prochainId <= dernier) throw new Error('compteur d’identifiants incohérent');
  for (const c of s.caravanes) if (c.id >= s.prochainId) throw new Error('compteur d’identifiants incohérent');
  if (!s.canal[s.carte.sourceCase]) throw new Error('la sortie de la source a disparu');
  if (!s.batiments.some((b) => b.kind === 'source')) throw new Error('la source a disparu');
  invalider(s);
  rechaufferCache(s);
  return s;
}

/** L'en-tête d'un fichier est-il présentable ? (il n'est pas couvert par la somme de contrôle) */
function metaValide(m: any): m is MetaSauvegarde {
  const n = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  return (
    !!m &&
    typeof m === 'object' &&
    typeof m.dateIso === 'string' &&
    n(m.jour, 0, 1e9) &&
    n(m.annee, 0, 1e8) &&
    Number.isInteger(m.saison) &&
    n(m.saison, 0, 2) &&
    Number.isInteger(m.palier) &&
    n(m.palier, 0, 3) &&
    n(m.habitants, 0, 1e6) &&
    n(m.renommee, -1e6, 1e9) &&
    typeof m.carte === 'string' &&
    (m.vocation === null || m.vocation === 'etape' || m.vocation === 'grenier')
  );
}

/** Lit le texte d'un fichier de sauvegarde. Ne lève jamais : renvoie une erreur lisible par le joueur. */
export function deserialiser(texte: string): Chargement {
  let brut: any;
  try {
    brut = JSON.parse(texte);
  } catch {
    return { ok: false, erreur: 'Le fichier est illisible (il est incomplet ou abîmé).' };
  }
  if (!brut || brut.format !== FORMAT) return { ok: false, erreur: "Ce fichier n'est pas une sauvegarde de Séguia." };
  if (typeof brut.version !== 'number') return { ok: false, erreur: 'La version de la sauvegarde est absente.' };
  if (brut.version > VERSION_ETAT) {
    return { ok: false, erreur: 'Cette sauvegarde vient d’une version plus récente du jeu. Mettez le jeu à jour.' };
  }
  if (!brut.etat || typeof brut.somme !== 'string') return { ok: false, erreur: 'La sauvegarde est incomplète.' };
  if (somme(JSON.stringify(brut.etat)) !== brut.somme) {
    return { ok: false, erreur: 'La sauvegarde a été modifiée ou abîmée (somme de contrôle incorrecte).' };
  }
  try {
    let etat = brut.etat;
    for (let v = brut.version; v < VERSION_ETAT; v++) {
      const m = MIGRATIONS[v];
      if (!m) return { ok: false, erreur: `Impossible de convertir cette ancienne sauvegarde (version ${v}).` };
      etat = m(etat);
    }
    const s = depuisObjet(etat);
    s.version = VERSION_ETAT;
    // la section ui et l'en-tête ne sont pas couverts par la somme de contrôle : on ne garde que ce qui est sain
    const uiBrut = brut.ui && typeof brut.ui === 'object' ? brut.ui : {};
    const ui: UiSauvegarde = { vitesse: uiBrut.vitesse === 2 || uiBrut.vitesse === 4 ? uiBrut.vitesse : 1 };
    const cam = uiBrut.camera;
    if (cam && typeof cam === 'object' && ['x', 'z', 'distance', 'azimut', 'inclinaison'].every((k) => typeof cam[k] === 'number' && Number.isFinite(cam[k]))) {
      ui.camera = { x: cam.x, z: cam.z, distance: cam.distance, azimut: cam.azimut, inclinaison: cam.inclinaison };
    }
    // l'en-tête est recalculé à partir de l'état chargé : il ne peut pas contredire la partie
    const meta: MetaSauvegarde = metaDe(s, typeof brut.meta?.dateIso === 'string' ? brut.meta.dateIso.slice(0, 40) : '');
    return { ok: true, etat: s, ui, meta };
  } catch (err) {
    return { ok: false, erreur: `La sauvegarde est incohérente (${(err as Error).message}).` };
  }
}

/** Lit seulement l'en-tête (pour l'écran des emplacements), sans reconstruire l'état. */
export function lireMeta(texte: string): MetaSauvegarde | null {
  try {
    const brut = JSON.parse(texte);
    if (brut?.format !== FORMAT || !metaValide(brut.meta)) return null;
    return { ...brut.meta, carte: brut.meta.carte.slice(0, 60) };
  } catch {
    return null;
  }
}
