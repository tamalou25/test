import type { BatimentKind, Cache, Commande, Dir, GameState, Resultat } from '../sim';
import type { Qualite } from '../render/post';
import type { Volumes } from '../audio/types';

export type Outil =
  | { t: 'selection' }
  | { t: 'canal'; type: 1 | 2 }
  | { t: 'cloture'; type: 1 | 2 }
  | { t: 'batiment'; kind: BatimentKind; rot: Dir }
  | { t: 'effacer' };

export type Selection = { t: 'batiment'; id: number } | { t: 'case'; i: number } | null;

export type VueInfo = 'eau' | 'vent' | null;

export interface Reglages {
  volumes: Volumes;
  qualite: Qualite;
  afficherIps: boolean;
  /** le joueur a déjà vu l'aide au premier lancement */
  aideVue: boolean;
}

export const REGLAGES_DEFAUT: Reglages = {
  volumes: { general: 0.8, musique: 0.6, ambiance: 0.8, effets: 0.8 },
  qualite: 'equilibre',
  afficherIps: false,
  aideVue: false,
};

/** Ce que l'interface lit à chaque rafraîchissement. */
export interface EtatJeu {
  s: GameState;
  c: Cache;
  vitesse: number;
  outil: Outil;
  selection: Selection;
  vue: VueInfo;
  ips: number;
  reglages: Reglages;
  /** images miniatures des bâtiments (URL de données), par nom de bâtiment */
  vignettes: Record<string, string>;
}

/** Ce que l'interface peut demander au jeu. */
export interface ActionsJeu {
  commande(cmd: Commande): Resultat;
  outil(o: Outil): void;
  vitesse(v: number): void;
  pause(): void;
  selection(sel: Selection): void;
  vue(v: VueInfo): void;
  ouvrir(ecran: 'menu' | 'aide' | 'journal' | 'reglages' | 'sauvegardes'): void;
  centrer(caseI: number): void;
}
