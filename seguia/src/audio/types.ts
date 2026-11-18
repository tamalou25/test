/**
 * Interface FIGÉE du moteur audio de Séguia (WebAudio procédural, aucun fichier son).
 * Le jeu appelle `maj` à chaque image avec ce qu'il se passe à l'écran ; le moteur mixe.
 */

export type NomEffet =
  | 'clic' // bouton d'interface
  | 'survol' // survol discret d'un bouton
  | 'poser' // bâtiment posé
  | 'canal' // case de séguia creusée (peut être appelé en rafale pendant un tracé)
  | 'refus' // action refusée
  | 'demolir'
  | 'annuler'
  | 'eau_arrive' // l'eau atteint une parcelle pour la première fois
  | 'recolte'
  | 'pieces' // paiement d'une caravane
  | 'chantier_fini'
  | 'caravane' // clochettes : une caravane entre sur la piste
  | 'habitant' // un habitant s'installe
  | 'alerte' // annonce de tempête, famine, culture perdue
  | 'objectif' // un objectif est rempli
  | 'palier' // palier franchi
  | 'victoire';

export interface Volumes {
  /** tous entre 0 et 1 */
  general: number;
  musique: number;
  ambiance: number;
  effets: number;
}

export interface EtatSonore {
  /** 0 fraîche, 1 chaude, 2 vents */
  saison: 0 | 1 | 2;
  /** 0 nuit … 1 plein jour */
  lumiere: number;
  /** intensité de la tempête de sable en cours, 0 si aucune (jusqu'à ~1,4) */
  tempete: number;
  /** canicule en cours */
  canicule: boolean;
  /** 0 caméra très éloignée … 1 gros plan */
  proximite: number;
  /** quantité d'eau courante près du centre de l'image, 0..1 */
  eauProche: number;
  /** végétation près du centre de l'image, 0..1 (oiseaux, bruissement des palmes) */
  verdureProche: number;
  /** activité humaine près du centre de l'image, 0..1 (rumeur de village, marché) */
  vieProche: number;
  /** une caravane est à l'étape (clochettes, blatèrements lointains) */
  caravane: boolean;
  /** jeu en pause */
  pause: boolean;
  /** vitesse du jeu : 1, 2 ou 4 */
  vitesse: number;
}

export interface MoteurAudio {
  /**
   * À appeler lors du premier geste du joueur (clic, touche) : crée l'AudioContext.
   * Sans effet si déjà démarré. Ne lève jamais (si l'audio est indisponible, le moteur devient muet).
   */
  demarrer(): Promise<void>;
  readonly demarre: boolean;
  /** Met à jour le mixage. `dt` en secondes réelles. Sans effet avant `demarrer`. */
  maj(etat: EtatSonore, dt: number): void;
  /** Joue un effet ponctuel. `intensite` 0..1 (défaut 1). Sans effet avant `demarrer`. */
  jouer(effet: NomEffet, intensite?: number): void;
  reglerVolumes(v: Volumes): void;
  /** Coupe le son (fenêtre masquée, menu) puis le rétablit, avec un fondu court. */
  suspendre(): void;
  reprendre(): void;
  /** Libère tout. */
  detruire(): void;
}
