/**
 * Pont FIGÉ exposé par electron/preload.cjs via contextBridge sous window.seguiaBridge.
 * Absent quand le jeu tourne dans un simple navigateur.
 */
import type { SaveSlotInfo } from './SaveStore';

export interface SeguiaBridge {
  saves: {
    location(): Promise<string>;
    list(): Promise<SaveSlotInfo[]>;
    write(slot: string, content: string): Promise<void>;
    read(slot: string): Promise<string | null>;
    readBackup(slot: string): Promise<string | null>;
    remove(slot: string): Promise<void>;
    openFolder(): Promise<void>;
  };
  app: {
    /** version du jeu (package.json) */
    version(): Promise<string>;
    quit(): Promise<void>;
    setFullscreen(on: boolean): Promise<void>;
    isFullscreen(): Promise<boolean>;
    /** appelé quand la fenêtre va se fermer : enregistrer, puis appeler fermetureOk() */
    onAvantFermeture?(rappel: () => void): void;
    fermetureOk?(): void;
  };
  /** true si l'application a été lancée avec SEGUIA_TEST=1 (active window.__seguia côté jeu) */
  testMode: boolean;
}

declare global {
  interface Window {
    seguiaBridge?: SeguiaBridge;
  }
}
export {};
