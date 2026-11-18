/**
 * Tous les chiffres d'équilibrage de Séguia, réunis ici.
 * Débits en unités d'eau par heure de jeu (u/h), stocks en unités (u).
 */
import type { BatimentKind, Vocation } from './types';

export type Categorie = 'eau' | 'cultures' | 'habitat' | 'commerce' | 'protection';

export interface DefBatiment {
  kind: BatimentKind;
  nom: string;
  description: string;
  categorie: Categorie;
  /** emprise avant rotation */
  w: number;
  d: number;
  pieces: number;
  materiaux: number;
  /** postes de travail */
  ouvriers: number;
  /** besoin en eau nominal (u/h), 0 si aucun */
  eau: number;
  /** durée du chantier en heures de jeu */
  chantierH: number;
  /** palier à partir duquel le bâtiment est disponible (0 : dès le début) */
  palier: number;
  vocation?: Vocation;
  /** distance maximale à la piste (cases), 0 : sans objet */
  presPiste: number;
  /** doit être posé SUR une case de séguia */
  surCanal: boolean;
  /** le bâtiment se branche sur une séguia voisine */
  branche: boolean;
  constructible: boolean;
}

function def(d: Partial<DefBatiment> & Pick<DefBatiment, 'kind' | 'nom' | 'description' | 'categorie'>): DefBatiment {
  return {
    w: 1,
    d: 1,
    pieces: 0,
    materiaux: 0,
    ouvriers: 0,
    eau: 0,
    chantierH: 4,
    palier: 0,
    presPiste: 0,
    surCanal: false,
    branche: false,
    constructible: true,
    ...d,
  };
}

export const BATIMENTS: Record<BatimentKind, DefBatiment> = {
  source: def({
    kind: 'source',
    nom: 'Source',
    description: "La bouche de la foggara. Toute l'eau de l'oasis en sort.",
    categorie: 'eau',
    w: 2,
    d: 2,
    constructible: false,
  }),
  jardin: def({
    kind: 'jardin',
    nom: 'Jardin',
    description: 'Légumes et céréales : des vivres en 2 jours. Assoiffé, il meurt vite.',
    categorie: 'cultures',
    w: 2,
    d: 2,
    pieces: 8,
    ouvriers: 1,
    eau: 6,
    chantierH: 2,
    branche: true,
  }),
  palmeraie: def({
    kind: 'palmeraie',
    nom: 'Palmeraie',
    description: "Cinq jours pour grandir. Donne des dattes, de l'ombre et arrête le sable.",
    categorie: 'cultures',
    w: 2,
    d: 2,
    pieces: 14,
    ouvriers: 1,
    eau: 4,
    chantierH: 2,
    branche: true,
  }),
  maison: def({
    kind: 'maison',
    nom: 'Maison',
    description: "Loge 4 habitants. Il lui faut une fontaine en eau à proximité.",
    categorie: 'habitat',
    w: 2,
    d: 2,
    pieces: 10,
    materiaux: 4,
    chantierH: 5,
  }),
  fontaine: def({
    kind: 'fontaine',
    nom: 'Fontaine',
    description: "Donne l'eau potable aux maisons dans un rayon de 7 cases.",
    categorie: 'habitat',
    pieces: 12,
    materiaux: 3,
    eau: 2,
    chantierH: 3,
    branche: true,
  }),
  bassin: def({
    kind: 'bassin',
    nom: 'Bassin des caravanes',
    description: 'Abreuvoir au bord de la piste. Une caravane ne s’arrête que s’il contient de l’eau.',
    categorie: 'commerce',
    w: 3,
    d: 2,
    pieces: 18,
    materiaux: 6,
    eau: 24,
    chantierH: 5,
    presPiste: 4,
    branche: true,
  }),
  repartiteur: def({
    kind: 'repartiteur',
    nom: 'Répartiteur',
    description: 'Peigne de pierre posé sur une jonction : règle la part de chaque branche.',
    categorie: 'eau',
    pieces: 12,
    materiaux: 4,
    chantierH: 2,
    palier: 1,
    surCanal: true,
  }),
  citerne: def({
    kind: 'citerne',
    nom: 'Citerne',
    description: 'Réserve de 600 u. Vanne : remplir, tenir ou vider dans la séguia.',
    categorie: 'eau',
    w: 2,
    d: 2,
    pieces: 26,
    materiaux: 12,
    eau: 25,
    chantierH: 6,
    palier: 1,
    branche: true,
  }),
  caravanserail: def({
    kind: 'caravanserail',
    nom: 'Caravansérail',
    description: 'Les caravanes y restent plus longtemps, paient et achètent davantage.',
    categorie: 'commerce',
    w: 3,
    d: 3,
    pieces: 70,
    materiaux: 28,
    ouvriers: 3,
    chantierH: 10,
    palier: 2,
    presPiste: 6,
  }),
  briqueterie: def({
    kind: 'briqueterie',
    nom: 'Briqueterie',
    description: "Fabrique des matériaux avec de la terre, de l'eau et des bras.",
    categorie: 'commerce',
    w: 2,
    d: 2,
    pieces: 30,
    materiaux: 5,
    ouvriers: 2,
    eau: 3,
    chantierH: 5,
    palier: 2,
    branche: true,
  }),
  puits: def({
    kind: 'puits',
    nom: 'Puits',
    description: 'Ajoute 12 u/h dans la séguia voisine, mais chaque puits fait baisser la source de 6 %.',
    categorie: 'eau',
    pieces: 36,
    materiaux: 10,
    ouvriers: 1,
    chantierH: 6,
    palier: 2,
    branche: true,
  }),
  hammam: def({
    kind: 'hammam',
    nom: 'Hammam',
    description: "Les caravaniers paient bien plus cher une étape où l'on se lave.",
    categorie: 'commerce',
    w: 3,
    d: 2,
    pieces: 80,
    materiaux: 30,
    ouvriers: 2,
    eau: 8,
    chantierH: 10,
    palier: 2,
    vocation: 'etape',
    branche: true,
  }),
  fanal: def({
    kind: 'fanal',
    nom: 'Fanal',
    description: 'Un feu visible de loin : les caravanes viennent plus souvent et sont annoncées plus tôt.',
    categorie: 'commerce',
    pieces: 55,
    materiaux: 18,
    ouvriers: 1,
    chantierH: 8,
    palier: 2,
    vocation: 'etape',
  }),
  sechoir: def({
    kind: 'sechoir',
    nom: 'Séchoir à dattes',
    description: 'Les dattes séchées se vendent moitié plus cher et font la réputation de l’oasis.',
    categorie: 'cultures',
    w: 2,
    d: 2,
    pieces: 50,
    materiaux: 15,
    ouvriers: 2,
    chantierH: 6,
    palier: 2,
    vocation: 'grenier',
  }),
  noria: def({
    kind: 'noria',
    nom: 'Noria',
    description: "Roue qui élève l'eau d'un niveau : de quoi irriguer une terrasse.",
    categorie: 'eau',
    pieces: 40,
    materiaux: 14,
    ouvriers: 1,
    eau: 15,
    chantierH: 6,
    palier: 2,
    vocation: 'grenier',
    branche: true,
  }),
};

/** Ordre d'affectation de la main-d'œuvre (les premiers sont servis d'abord). */
export const PRIORITE_PERSONNEL: BatimentKind[] = [
  'jardin',
  'palmeraie',
  'puits',
  'noria',
  'caravanserail',
  'briqueterie',
  'sechoir',
  'hammam',
  'fanal',
];

export const B = {
  /* --- départ --- */
  departPieces: 110,
  departMateriaux: 24,
  departVivres: 30,
  departHabitants: 4,

  /* --- eau --- */
  sourceDebit: 100,
  sourceParNiveau: 0.2, // +20 % par allongement de la foggara
  sourceSaison: [1.0, 0.8, 0.9],
  sourceSecheresse: 0.85,
  puitsDebit: 12,
  puitsBaisse: 0.06,
  puitsPlancher: 0.4,
  perteTerre: 0.025, // part du débit perdue par case
  perteMaconne: 0.005,
  evapSaison: [0.7, 1.6, 1.0],
  evapCanicule: 1.6,
  evapJour: 1.25,
  evapNuit: 0.6,
  ombrePerte: 0.5,
  sableBlocage: 0.85, // part du débit arrêtée par un canal entièrement ensablé
  coutCanalTerre: 1,
  coutCanalMaconnePieces: 1,
  coutCanalMaconneMateriaux: 1,
  bassinCapacite: 220,
  citerneCapacite: 600,
  citerneVidange: 20,
  noriaRendement: 0.9,
  evapBassinParJour: 0.03,
  foggaraPieces: [120, 220],
  foggaraMateriaux: [40, 70],
  foggaraChantierH: 30,

  /* --- cultures --- */
  besoinSaison: [1.0, 1.3, 1.05],
  besoinCanicule: 1.3,
  jardinCycleH: 48,
  jardinRecolte: 10,
  jardinMortH: 30, // heures à sec avant de perdre la récolte
  jardinOmbreBesoin: 0.7,
  jardinOmbreRecolte: 1.25,
  palmeraieCroissanceH: 120,
  palmeraieMortH: 100,
  palmeraieEauJeune: 2,
  palmeraieDattesParJour: 10,
  palmeraieMature: 0.6,
  briquesParJour: 8,

  /* --- population --- */
  /** part des habitants en âge de travailler */
  partOuvriers: 0.5,
  maisonCapacite: 4,
  fontaineRayon: 7,
  sourceRayonPotable: 6,
  vivresParHabitantParJour: 1,
  pasParTourPopulation: 120, // un quart de jour

  /* --- caravanes --- */
  caravaneEauParChameau: 22,
  caravaneDebitParChameau: 6, // u/h bue par chameau
  caravaneVitesse: 4, // cases par heure
  caravanePatienceH: 6,
  caravaneCommerceH: 6,
  caravaneSeuilArret: 0.25,
  caravanePaieParChameau: 4,
  caravaneIntervalleJ: 2.6,
  caravaneAnnonceJ: 1.5,
  caravaneDattesParChameau: 2,
  prixDatte: 1,
  prixMateriau: 2,
  prixVivre: 1.5,
  caravaneMateriauxParChameau: 2,
  caravaneVivresParChameau: 4,
  caravanserailPaie: 1.5,
  caravanserailDattes: 1.2,
  caravanserailDuree: 2,
  hammamPaie: 1.4,
  fanalIntervalle: 0.75,
  fanalAnnonceJ: 1.0,
  sechoirPrix: 1.5,
  etapePaie: 1.25,

  /* --- sable --- */
  sableParHeure: 0.8 / 6, // dépôt par heure sur une case exposée à intensité 1
  sableAbri: 0.12, // part du dépôt reçue par une case abritée
  sableHumide: 0.6,
  curageParOuvrierParHeure: 0.15,
  sableDeclinParHeure: 0.012,
  /** le courant emporte lentement le sable d'une séguia en eau (par heure, à plein débit) */
  sableChasseParHeure: 0.006,
  abriCloture: 3,
  abriHaie: 4,
  abriPalmeraie: 5,
  abriBatiment: 2,
  abriRelief: 3,
  clotureUsure: 0.4,
  coutCloture: 1,
  coutHaie: 3,

  /* --- humidité --- */
  humiditeMonte: 0.18, // par heure
  humiditeDescend: 0.035,
  seuilVert: 0.45,

  /* --- renommée --- */
  renommeeServie: 3,
  renommeePartielle: 1,
  renommeeManquee: -3,
  renommeeHammam: 1,
  renommeeParHabitant: 0.5,
  renommeeParCaseVerte: 0.05,
  renommeeParDatteVendue: 1 / 40,
  renommeeParPalmeraie: 2,
  renommeeSechoirParDatte: 1 / 60,
  vocationBonus: 1.5,
  renommeeVictoire: 120,

  /* --- annulation --- */
  annulerPas: 60, // 3 heures de jeu
  remboursementDemolition: 0.5,
};
