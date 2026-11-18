import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BrowserSaveStore, type KeyValueStorage } from '../../src/platform/browserStore';
import { SLOT_REGEX } from '../../src/platform/SaveStore';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saves: any = require('../../electron/saves.cjs');

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>();
  quota = Infinity;
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (v.length > this.quota) {
      const e = new Error('quota');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe('electron/saves.cjs (fichiers)', () => {
  it('partage la même regex que SaveStore.ts', () => {
    expect(saves.SLOT_REGEX.source).toBe(SLOT_REGEX.source);
  });

  it('écrit, crée la .bak, liste et supprime (chemin à espaces/accents)', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'seguia unit é-'));
    const dir = path.join(base, 'Données à sauver', 'saves');
    const s = saves.createSaveService(dir);
    expect(await s.list()).toEqual([]);
    expect(await s.read('manuel1')).toBeNull();
    await s.write('manuel1', '"A — été"');
    expect(await s.read('manuel1')).toBe('"A — été"');
    expect(await s.readBackup('manuel1')).toBeNull();
    await s.write('manuel1', 'B');
    expect(await s.read('manuel1')).toBe('B');
    expect(await s.readBackup('manuel1')).toBe('"A — été"');
    const [info] = await s.list();
    expect(info).toMatchObject({ slot: 'manuel1', exists: true, sizeBytes: 1, hasBackup: true });
    expect(fs.readdirSync(dir).sort()).toEqual(['manuel1.json', 'manuel1.json.bak']);
    await s.remove('manuel1');
    expect(fs.readdirSync(dir)).toEqual([]);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('refuse les noms invalides avec un message français', async () => {
    const s = saves.createSaveService(path.join(os.tmpdir(), 'seguia-never'));
    for (const bad of ['../x', 'A', '', 'a'.repeat(33), 'a.b', 42]) {
      await expect(s.write(bad, '{}')).rejects.toThrow(/emplacement de sauvegarde invalide/);
    }
    await expect(s.write('ok', 12)).rejects.toThrow(/chaîne de caractères/);
  });

  it('traduit les erreurs disque en français', () => {
    expect(saves.describeFsError({ code: 'ENOSPC' }, 'Écriture', 'C:\\x')).toMatch(/^Écriture impossible dans C:\\x : disque plein/);
    expect(saves.describeFsError({ code: 'EPERM' }, 'Écriture', 'D')).toMatch(/dossier protégé/);
  });
});

describe('BrowserSaveStore (localStorage)', () => {
  it('garantit la copie .bak et la liste', async () => {
    const mem = new MemoryStorage();
    const s = new BrowserSaveStore(mem);
    expect(s.kind).toBe('navigateur');
    expect(await s.location()).toMatch(/navigateur/);
    await s.write('auto', '"v1"');
    await s.write('auto', 'v2');
    expect(await s.read('auto')).toBe('v2');
    expect(await s.readBackup('auto')).toBe('"v1"');
    const [info] = await s.list();
    expect(info).toMatchObject({ slot: 'auto', exists: true, hasBackup: true, sizeBytes: 2 });
    await s.remove('auto');
    expect(await s.list()).toEqual([]);
    await expect(s.write('../x', 'a')).rejects.toThrow(/invalide/);
  });

  it('quota dépassé : message français et version précédente intacte', async () => {
    const mem = new MemoryStorage();
    const s = new BrowserSaveStore(mem);
    await s.write('manuel1', '"ancien"');
    mem.quota = 10;
    await expect(s.write('manuel1', 'x'.repeat(50))).rejects.toThrow(/espace plein/);
    expect(await s.read('manuel1')).toBe('"ancien"');
    expect(await s.readBackup('manuel1')).toBeNull();
  });

  it('stockage indisponible : erreur explicite', async () => {
    const s = new BrowserSaveStore(null);
    await expect(s.read('auto')).rejects.toThrow(/Stockage du navigateur indisponible/);
  });
});
