import type { SaveSlotInfo, SaveStore } from './SaveStore';
import { SLOT_REGEX } from './SaveStore';

/** Sous-ensemble de Storage utilisé (permet d'injecter un faux stockage dans les tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

interface Meta {
  modifiedMs: number;
  sizeBytes: number;
}

const PREFIX = 'seguia:save:';
const dataKey = (slot: string) => `${PREFIX}${slot}.json`;
const bakKey = (slot: string) => `${PREFIX}${slot}.json.bak`;
const metaKey = (k: string) => `${k}#meta`;

function checkSlot(slot: string): void {
  if (typeof slot !== 'string' || !SLOT_REGEX.test(slot)) {
    throw new Error(
      `Nom d'emplacement de sauvegarde invalide « ${String(slot).slice(0, 40)} » : 1 à 32 caractères parmi a-z, 0-9, « _ » et « - ».`,
    );
  }
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; code?: number } | null;
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
}

/**
 * Sauvegardes dans le localStorage du navigateur.
 * Mêmes garanties que la version fichiers : l'ancienne version devient <slot>.json.bak avant remplacement,
 * et un échec d'écriture laisse la version précédente intacte.
 */
export class BrowserSaveStore implements SaveStore {
  readonly kind = 'navigateur' as const;

  constructor(private readonly storage: KeyValueStorage | null = BrowserSaveStore.defaultStorage()) {}

  static defaultStorage(): KeyValueStorage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null; // accès refusé (cookies bloqués, navigation privée stricte)
    }
  }

  private get s(): KeyValueStorage {
    if (!this.storage) {
      throw new Error(
        "Stockage du navigateur indisponible : autorisez les données de site (cookies) pour ce jeu afin de pouvoir sauvegarder.",
      );
    }
    return this.storage;
  }

  private readMeta(k: string): Meta | null {
    const raw = this.s.getItem(metaKey(k));
    if (raw == null) return null;
    try {
      const m = JSON.parse(raw) as Meta;
      return { modifiedMs: Number(m.modifiedMs) || 0, sizeBytes: Number(m.sizeBytes) || 0 };
    } catch {
      return null;
    }
  }

  async location(): Promise<string> {
    return 'Stockage local de ce navigateur (localStorage), propre à cette adresse : les sauvegardes disparaissent si vous effacez les données du site.';
  }

  async list(): Promise<SaveSlotInfo[]> {
    const s = this.s;
    const slots = new Set<string>();
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k || !k.startsWith(PREFIX) || k.endsWith('#meta')) continue;
      const m = /^(.+)\.json(\.bak)?$/.exec(k.slice(PREFIX.length));
      if (m && SLOT_REGEX.test(m[1])) slots.add(m[1]);
    }
    return [...slots].sort().map((slot) => {
      const main = s.getItem(dataKey(slot));
      const bak = s.getItem(bakKey(slot));
      const mm = this.readMeta(dataKey(slot));
      const bm = this.readMeta(bakKey(slot));
      return {
        slot,
        exists: main != null,
        modifiedMs: main != null ? (mm?.modifiedMs ?? 0) : 0,
        sizeBytes: main != null ? (mm?.sizeBytes ?? byteLength(main)) : 0,
        hasBackup: bak != null,
        backupModifiedMs: bak != null ? (bm?.modifiedMs ?? 0) : 0,
      };
    });
  }

  async write(slot: string, content: string): Promise<void> {
    checkSlot(slot);
    if (typeof content !== 'string') {
      throw new Error('Contenu de sauvegarde invalide : une chaîne de caractères est attendue.');
    }
    const s = this.s;
    const dk = dataKey(slot);
    const bk = bakKey(slot);
    const previous = s.getItem(dk);
    const previousMeta = s.getItem(metaKey(dk));
    const oldBak = s.getItem(bk);
    const oldBakMeta = s.getItem(metaKey(bk));
    try {
      // un fichier principal illisible ne doit pas écraser la bonne copie de secours
      let lisible = false;
      try {
        lisible = previous != null && JSON.parse(previous) !== undefined;
      } catch {
        lisible = false;
      }
      if (previous != null && lisible) {
        s.setItem(bk, previous);
        s.setItem(
          metaKey(bk),
          previousMeta ?? JSON.stringify({ modifiedMs: Date.now(), sizeBytes: byteLength(previous) }),
        );
      }
      s.setItem(dk, content);
      s.setItem(metaKey(dk), JSON.stringify({ modifiedMs: Date.now(), sizeBytes: byteLength(content) }));
    } catch (err) {
      // Restaure l'état antérieur au mieux : la version précédente doit rester lisible.
      // Chaque étape isolément : un échec ne doit pas empêcher les suivantes.
      const attempt = (f: () => void) => {
        try {
          f();
        } catch {
          /* au mieux */
        }
      };
      const restore = (k: string, v: string | null) => attempt(() => (v != null ? s.setItem(k, v) : s.removeItem(k)));
      restore(bk, oldBak);
      restore(metaKey(bk), oldBakMeta);
      restore(dk, previous);
      restore(metaKey(dk), previousMeta);
      if (isQuotaError(err)) {
        throw new Error(
          "Écriture impossible dans le stockage du navigateur : espace plein. Supprimez d'anciennes sauvegardes ou utilisez la version installable du jeu.",
        );
      }
      throw new Error(
        `Écriture impossible dans le stockage du navigateur : ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  async read(slot: string): Promise<string | null> {
    checkSlot(slot);
    return this.s.getItem(dataKey(slot));
  }

  async readBackup(slot: string): Promise<string | null> {
    checkSlot(slot);
    return this.s.getItem(bakKey(slot));
  }

  async remove(slot: string): Promise<void> {
    checkSlot(slot);
    const s = this.s;
    for (const k of [dataKey(slot), bakKey(slot)]) {
      s.removeItem(k);
      s.removeItem(metaKey(k));
    }
  }

  async openFolder(): Promise<void> {
    /* sans effet dans un navigateur */
  }
}
