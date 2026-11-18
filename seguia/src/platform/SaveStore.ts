/**
 * Interface FIGÉE du stockage des sauvegardes et des réglages.
 * Deux implémentations : fichiers (Electron, via le pont du preload) et navigateur (localStorage).
 *
 * Un « emplacement » (slot) est un nom court : ^[a-z0-9_-]{1,32}$
 *   auto            sauvegarde automatique
 *   manuel1..3      emplacements du joueur
 *   reglages        réglages (son, rendu, vitesse préférée)
 * Sous Electron : <userData>/saves/<slot>.json et <slot>.json.bak
 */
export interface SaveSlotInfo {
  slot: string;
  exists: boolean;
  /** date de modification en ms epoch (0 si absent) */
  modifiedMs: number;
  sizeBytes: number;
  hasBackup: boolean;
  backupModifiedMs: number;
}

export interface SaveStore {
  readonly kind: 'electron' | 'navigateur';
  /** Emplacement lisible par le joueur (chemin complet sous Electron). */
  location(): Promise<string>;
  list(): Promise<SaveSlotInfo[]>;
  /**
   * Écriture atomique (tmp + fsync + rename, avec nouvelles tentatives).
   * Si un fichier existait déjà et qu'il est lisible (JSON valide), il devient <slot>.json.bak AVANT le
   * remplacement ; un fichier abîmé ne remplace jamais une copie de secours saine.
   * Les écritures d'un même emplacement sont faites une par une, dans l'ordre des appels.
   * Rejette avec une Error dont le message est en français et exploitable.
   */
  write(slot: string, content: string): Promise<void>;
  /** null si absent. */
  read(slot: string): Promise<string | null>;
  /** Copie de secours (version précédente), null si absente. */
  readBackup(slot: string): Promise<string | null>;
  remove(slot: string): Promise<void>;
  /** Ouvre le dossier dans l'explorateur (Electron) ; sans effet dans un navigateur. */
  openFolder(): Promise<void>;
}

export const SLOT_REGEX = /^[a-z0-9_-]{1,32}$/;
