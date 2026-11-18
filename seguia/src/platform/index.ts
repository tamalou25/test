import type { SaveStore } from './SaveStore';
import { BrowserSaveStore } from './browserStore';
import { ElectronSaveStore } from './electronStore';

export type { SaveStore, SaveSlotInfo } from './SaveStore';
export { SLOT_REGEX } from './SaveStore';

let instance: SaveStore | null = null;

/** Stockage des sauvegardes adapté à l'environnement (Electron si le pont est présent, sinon navigateur). */
export function getSaveStore(): SaveStore {
  if (!instance) {
    const bridge = typeof window !== 'undefined' ? window.seguiaBridge : undefined;
    instance = bridge ? new ElectronSaveStore(bridge) : new BrowserSaveStore();
  }
  return instance;
}

/** true si le jeu a été lancé par Electron avec SEGUIA_TEST=1. */
export function isTestMode(): boolean {
  return typeof window !== 'undefined' && window.seguiaBridge?.testMode === true;
}
