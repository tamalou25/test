import type { SaveSlotInfo, SaveStore } from './SaveStore';
import { SLOT_REGEX } from './SaveStore';
import type { SeguiaBridge } from './bridge';

function checkSlot(slot: string): void {
  if (typeof slot !== 'string' || !SLOT_REGEX.test(slot)) {
    throw new Error(
      `Nom d'emplacement de sauvegarde invalide « ${String(slot).slice(0, 40)} » : 1 à 32 caractères parmi a-z, 0-9, « _ » et « - ».`,
    );
  }
}

/** Sauvegardes sur disque via le pont du preload (<userData>/saves/). */
export class ElectronSaveStore implements SaveStore {
  readonly kind = 'electron' as const;

  constructor(private readonly bridge: SeguiaBridge) {}

  location(): Promise<string> {
    return this.bridge.saves.location();
  }

  list(): Promise<SaveSlotInfo[]> {
    return this.bridge.saves.list();
  }

  async write(slot: string, content: string): Promise<void> {
    checkSlot(slot);
    if (typeof content !== 'string') {
      throw new Error('Contenu de sauvegarde invalide : une chaîne de caractères est attendue.');
    }
    await this.bridge.saves.write(slot, content);
  }

  async read(slot: string): Promise<string | null> {
    checkSlot(slot);
    return this.bridge.saves.read(slot);
  }

  async readBackup(slot: string): Promise<string | null> {
    checkSlot(slot);
    return this.bridge.saves.readBackup(slot);
  }

  async remove(slot: string): Promise<void> {
    checkSlot(slot);
    await this.bridge.saves.remove(slot);
  }

  openFolder(): Promise<void> {
    return this.bridge.saves.openFolder();
  }
}
