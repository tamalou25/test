/**
 * Types FIGÉS de la simulation de Séguia.
 * La simulation est pure et déterministe : aucun accès au DOM, à three.js, à l'horloge ou à Math.random.
 */

/** Taille de la grille (cases). */
export const N = 44;
export const NN = N * N;
/** Heures de jeu par pas de simulation. 1 jour = 480 pas = 48 s à vitesse ×1 (10 pas par seconde). */
export const DT_H = 0.05;
export const PAS_PAR_JOUR = 480;
export const JOURS_PAR_SAISON = 5;
export const JOURS_PAR_AN = 15;
export const PAS_PAR_AN = PAS_PAR_JOUR * JOURS_PAR_AN;

/** Directions : 0 nord (z-1), 1 est (x+1), 2 sud (z+1), 3 ouest (x-1). */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DZ = [-1, 0, 1, 0] as const;
export const NOM_DIR = ['nord', 'est', 'sud', 'ouest'] as const;

export const Sol = { Sable: 0, Reg: 1, Roche: 2, Dune: 3, Piste: 4 } as const;

export type Saison = 0 | 1 | 2; // 0 fraîche, 1 chaude, 2 vents
export const NOM_SAISON = ['Saison fraîche', 'Saison chaude', 'Saison des vents'] as const;

export type BatimentKind =
  | 'source'
  | 'maison'
  | 'fontaine'
  | 'repartiteur'
  | 'jardin'
  | 'palmeraie'
  | 'bassin'
  | 'citerne'
  | 'caravanserail'
  | 'briqueterie'
  | 'puits'
  | 'hammam'
  | 'fanal'
  | 'sechoir'
  | 'noria';

export type Vocation = 'etape' | 'grenier';

export interface Batiment {
  id: number;
  kind: BatimentKind;
  /** coin nord-ouest de l'emprise */
  x: number;
  z: number;
  /** emprise après rotation */
  w: number;
  d: number;
  rot: Dir;
  /** variante visuelle (maisons) */
  variante: number;
  /** avancement du chantier 0..1 (1 = en service) */
  chantier: number;
  /** pas de simulation de la pose (pour l'annulation) */
  posePas: number;
  /** mis en pause / en jachère par le joueur */
  pause: boolean;
  /** stock d'eau (bassin, citerne, noria) */
  stock: number;
  /** citerne : 0 remplir, 1 tenir, 2 vider */
  vanne: 0 | 1 | 2;
  /** répartiteur : poids 0..3 par direction (nord, est, sud, ouest) */
  poids: [number, number, number, number];
  /** jardin : maturité de la récolte 0..1 ; palmeraie : maturité des palmiers 0..1 */
  croissance: number;
  /** santé des plantes 0..1 */
  sante: number;
  /** maison : nombre d'habitants */
  habitants: number;
  /** production fractionnaire en attente (dattes, matériaux) */
  reste: number;
  /** --- valeurs du dernier pas, recalculées à chaque pas (sauvegardées pour un affichage immédiat après chargement) --- */
  /** part du besoin en eau satisfaite 0..1 (1 si aucun besoin) */
  eauRatio: number;
  /** part des postes pourvus 0..1 (1 si aucun poste) */
  personnel: number;
}

export type PhaseCaravane = 'annoncee' | 'approche' | 'abreuvage' | 'commerce' | 'depart' | 'passe';

export interface Caravane {
  id: number;
  chameaux: number;
  /** eau demandée au total */
  besoin: number;
  bu: number;
  phase: PhaseCaravane;
  /** pas d'arrivée prévue à l'entrée de la piste */
  arriveePas: number;
  /** position le long de la piste (indice flottant dans map.piste) */
  pos: number;
  /** indice de piste où la caravane s'arrête (-1 : inconnu) */
  arret: number;
  /** pas auquel la phase en cours se termine au plus tard */
  finPhasePas: number;
  /** résultats, remplis aux changements de phase (affichage) */
  satisfaction: number;
  paiement: number;
  dattesVendues: number;
  materiauxAchetes: number;
  colons: number;
  /** vivres déjà vendus au joueur pendant cet arrêt */
  vivresVendus: number;
  /** l'annonce a déjà été faite au joueur */
  annonceFaite: boolean;
  /** première caravane du tutoriel : pas de pénalité */
  indulgente: boolean;
}

export interface EvenementMeteo {
  type: 'tempete' | 'canicule';
  debutPas: number;
  finPas: number;
  /** direction D'OÙ vient le vent (tempête) */
  dir: Dir;
  intensite: number;
  grande: boolean;
  /** déjà annoncée au joueur */
  annoncee: boolean;
}

export interface ActionAnnulable {
  pas: number;
  type: 'batiment' | 'canal' | 'cloture';
  id: number;
  cases: number[];
  /** valeurs précédentes des cases (canal/clôture) */
  avant: number[];
  pieces: number;
  materiaux: number;
}

export interface EntreeJournal {
  pas: number;
  ton: 'info' | 'bien' | 'alerte';
  texte: string;
}

export interface Ressources {
  pieces: number;
  materiaux: number;
  vivres: number;
  dattes: number;
}

export interface Stats {
  caravanesServies: number;
  caravanesPartielles: number;
  caravanesManquees: number;
  dattesVendues: number;
  recoltes: number;
  jardinsPerdus: number;
  palmiersPerdus: number;
  habitantsPartis: number;
  /** bilans d'eau cumulés (unités) */
  eauInjectee: number;
  eauUtile: number;
  eauEvaporee: number;
  eauDeversee: number;
  /** jardins vivants au début de la saison chaude de l'an 1 / jardins perdus pendant celle-ci */
  jardinsPerdusSaisonChaude: number;
}

export interface Progression {
  /** 0 : La première eau ; 1 : Le relais ; 2 : L'oasis renommée ; 3 : victoire acquise (mode libre) */
  palier: 0 | 1 | 2 | 3;
  vocation: Vocation | null;
  /** le palier 1 est rempli, le joueur doit choisir sa vocation */
  choixVocationEnAttente: boolean;
  grandeTempetePassee: boolean;
  victoirePas: number;
  /** identifiants des conseils du tutoriel déjà validés */
  conseilsFaits: string[];
}

export interface OptionsPartie {
  /** année sèche : source -15 % */
  secheresse: boolean;
  nomCarte: string;
}

export type EtatRng = [number, number, number, number];

export interface Carte {
  elev: Uint8Array;
  sol: Uint8Array;
  /** cases de la piste, dans l'ordre de marche des caravanes */
  piste: number[];
  /** case de sortie de la source (canal maçonné fixe) */
  sourceCase: number;
  /** vent dominant : direction d'où il vient */
  ventDominant: Dir;
}

export interface GameState {
  version: number;
  graine: number;
  options: OptionsPartie;
  pas: number;
  rng: { meteo: EtatRng; caravanes: EtatRng; divers: EtatRng };
  prochainId: number;
  carte: Carte;
  /** 0 rien, 1 séguia de terre, 2 séguia maçonnée */
  canal: Uint8Array;
  /** 0 rien, 1 brise-vent de palmes, 2 haie de tamaris */
  cloture: Uint8Array;
  clotureEtat: Float64Array;
  humidite: Float64Array;
  sable: Float64Array;
  /** triés par id croissant */
  batiments: Batiment[];
  res: Ressources;
  /** points de renommée acquis par les caravanes */
  renommeeCaravanes: number;
  stats: Stats;
  /** niveau d'allongement de la foggara (0..2) et chantier en cours (-1 : aucun, sinon 0..1) */
  foggaraNiveau: number;
  foggaraChantier: number;
  meteo: EvenementMeteo[];
  /** année pour laquelle la météo a déjà été programmée */
  meteoAnneeProgrammee: number;
  caravanes: Caravane[];
  /** la première caravane a-t-elle été déclenchée */
  premiereCaravaneLancee: boolean;
  /** achat maximal de matériaux à chaque caravane */
  commandeMateriaux: number;
  corvee: boolean;
  /** nombre de quarts de jour consécutifs sans nourriture */
  faim: number;
  progression: Progression;
  annulables: ActionAnnulable[];
  journal: EntreeJournal[];
}

/* ---------- Commandes du joueur ---------- */

export type Commande =
  | { t: 'canal'; cases: number[]; type: 1 | 2 }
  | { t: 'cloture'; cases: number[]; type: 1 | 2 }
  | { t: 'construire'; kind: BatimentKind; x: number; z: number; rot: Dir }
  | { t: 'demolir'; id: number }
  | { t: 'effacer'; cases: number[] }
  | { t: 'poids'; id: number; poids: [number, number, number, number] }
  | { t: 'vanne'; id: number; vanne: 0 | 1 | 2 }
  | { t: 'pause'; id: number; pause: boolean }
  | { t: 'corvee'; on: boolean }
  | { t: 'vocation'; v: Vocation }
  | { t: 'acheterVivres'; n: number }
  | { t: 'commande'; n: number }
  | { t: 'foggara' }
  | { t: 'annuler' };

export type Resultat =
  | { ok: true; id?: number; cout?: { pieces: number; materiaux: number }; message?: string }
  | { ok: false; cause: string; suggestion: string };

/* ---------- Événements émis par un pas (non sauvegardés) ---------- */

export interface Evenement {
  type:
    | 'recolte'
    | 'jardin_perdu'
    | 'palmier_perdu'
    | 'chantier_fini'
    | 'caravane_annoncee'
    | 'caravane_arrivee'
    | 'caravane_boit'
    | 'caravane_passe'
    | 'caravane_payee'
    | 'caravane_depart'
    | 'colons'
    | 'habitant_parti'
    | 'habitant_arrive'
    | 'famine'
    | 'tempete_annoncee'
    | 'tempete_debut'
    | 'tempete_fin'
    | 'canicule_annoncee'
    | 'canicule_debut'
    | 'canicule_fin'
    | 'saison'
    | 'cloture_detruite'
    | 'conseil'
    | 'palier'
    | 'choix_vocation'
    | 'victoire'
    | 'foggara_finie';
  /** case concernée (ou -1) */
  caseI: number;
  /** identifiant concerné (bâtiment, caravane) ou 0 */
  id: number;
  valeur: number;
  texte: string;
}

/* ---------- Calendrier ---------- */

export interface Calendrier {
  /** jour depuis le début (0, 1, 2…) */
  jour: number;
  /** heure 0..24 */
  heure: number;
  annee: number;
  /** jour dans l'année 0..14 */
  jourAnnee: number;
  saison: Saison;
  /** jour dans la saison 0..4 */
  jourSaison: number;
  /** 0 nuit … 1 plein jour */
  lumiere: number;
}
