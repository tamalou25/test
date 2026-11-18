'use strict';
/**
 * Service de sauvegarde sur disque (processus principal Electron).
 * Aucune dépendance à Electron : testable directement sous Node.
 *
 * Disposition : <dossier>/<slot>.json et <slot>.json.bak
 * Écriture atomique : fichier temporaire + fsync, copie de l'ancien vers .bak,
 * puis rename (avec nouvelles tentatives si Windows verrouille le fichier :
 * antivirus, indexation, OneDrive…).
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/** Identique à SLOT_REGEX de src/platform/SaveStore.ts (interface figée). */
const SLOT_REGEX = /^[a-z0-9_-]{1,32}$/;
/** Garde-fou : une sauvegarde ne devrait jamais approcher cette taille. */
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRY_DELAYS_MS = [50, 120, 250, 500, 1000]; // jusqu'à 5 nouvelles tentatives

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkSlot(slot) {
  if (typeof slot !== 'string' || !SLOT_REGEX.test(slot)) {
    const shown = typeof slot === 'string' ? `« ${slot.slice(0, 40)} »` : `(${typeof slot})`;
    throw new Error(
      `Nom d'emplacement de sauvegarde invalide ${shown} : 1 à 32 caractères parmi a-z, 0-9, « _ » et « - ».`,
    );
  }
}

/** Traduit une erreur système en message français exploitable par le joueur. */
function describeFsError(err, action, target) {
  const code = err && err.code;
  const where = target;
  switch (code) {
    case 'ENOSPC':
    case 'EDQUOT':
      return `${action} impossible dans ${where} : disque plein. Libérez de l'espace puis réessayez.`;
    case 'EACCES':
    case 'EPERM':
      return `${action} impossible dans ${where} : dossier protégé ou fichier verrouillé (antivirus, OneDrive, droits insuffisants). Fermez les programmes qui l'utilisent puis réessayez.`;
    case 'EBUSY':
      return `${action} impossible dans ${where} : fichier utilisé par un autre programme (antivirus, synchronisation). Réessayez dans un instant.`;
    case 'EROFS':
      return `${action} impossible dans ${where} : le disque est en lecture seule.`;
    case 'ENAMETOOLONG':
      return `${action} impossible dans ${where} : chemin trop long.`;
    case 'EMFILE':
    case 'ENFILE':
      return `${action} impossible dans ${where} : trop de fichiers ouverts. Redémarrez le jeu.`;
    case 'EIO':
      return `${action} impossible dans ${where} : erreur d'entrée-sortie du disque.`;
    default:
      return `${action} impossible dans ${where} : disque plein ou dossier protégé (${code || (err && err.message) || 'erreur inconnue'}).`;
  }
}

async function withRetries(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !RETRY_CODES.has(err && err.code)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function writeFileSynced(file, data) {
  const fh = await fsp.open(file, 'w');
  try {
    await fh.writeFile(data, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
}

async function fsyncDir(dir) {
  // Impossible (et inutile) sous Windows ; au mieux ailleurs.
  if (process.platform === 'win32') return;
  try {
    const fh = await fsp.open(dir, 'r');
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
  } catch {
    /* sans importance */
  }
}

async function statOrNull(file) {
  try {
    return await fsp.stat(file);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function readOrNull(file) {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Le fichier contient-il du JSON lisible ? (sinon il ne doit pas remplacer la copie de secours) */
async function lisible(file) {
  try {
    JSON.parse(await fsp.readFile(file, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

let tmpCounter = 0;

/**
 * @param {string} dir dossier des sauvegardes (créé à la demande)
 */
function createSaveService(dir) {
  const fileOf = (slot) => path.join(dir, `${slot}.json`);
  const bakOf = (slot) => path.join(dir, `${slot}.json.bak`);

  async function ensureDir() {
    try {
      await fsp.mkdir(dir, { recursive: true });
    } catch (err) {
      throw new Error(describeFsError(err, 'Création du dossier de sauvegardes', dir));
    }
  }

  async function info(slot) {
    const [m, b] = await Promise.all([statOrNull(fileOf(slot)), statOrNull(bakOf(slot))]);
    return {
      slot,
      exists: !!m,
      modifiedMs: m ? Math.round(m.mtimeMs) : 0,
      sizeBytes: m ? m.size : 0,
      hasBackup: !!b,
      backupModifiedMs: b ? Math.round(b.mtimeMs) : 0,
    };
  }

  // Une seule écriture à la fois par emplacement : la dernière demandée est bien la dernière écrite.
  const files = new Map();
  function enFile(slot, tache) {
    const precedent = files.get(slot) ?? Promise.resolve();
    const suivant = precedent.then(tache, tache);
    files.set(
      slot,
      suivant.catch(() => {}),
    );
    return suivant;
  }

  const service = {
    dir,

    async location() {
      return dir;
    },

    async list() {
      let names;
      try {
        names = await fsp.readdir(dir);
      } catch (err) {
        if (err && err.code === 'ENOENT') return [];
        throw new Error(describeFsError(err, 'Lecture du dossier', dir));
      }
      const slots = new Set();
      for (const n of names) {
        const m = /^(.+)\.json(\.bak)?$/.exec(n);
        if (m && SLOT_REGEX.test(m[1])) slots.add(m[1]);
      }
      const out = [];
      for (const s of [...slots].sort()) out.push(await info(s));
      return out;
    },

    async write(slot, content) {
      checkSlot(slot);
      return enFile(slot, () => service.ecrire(slot, content));
    },

    /** Écriture proprement dite (appelée par `write`, une à la fois par emplacement). */
    async ecrire(slot, content) {
      checkSlot(slot);
      if (typeof content !== 'string') {
        throw new Error('Contenu de sauvegarde invalide : une chaîne de caractères est attendue.');
      }
      if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
        throw new Error('Sauvegarde refusée : contenu trop volumineux (plus de 64 Mo).');
      }
      await ensureDir();
      const target = fileOf(slot);
      const bak = bakOf(slot);
      const tag = `${process.pid}-${Date.now()}-${++tmpCounter}`;
      const tmp = path.join(dir, `${slot}.json.tmp-${tag}`);
      const bakTmp = path.join(dir, `${slot}.json.bak.tmp-${tag}`);
      try {
        // 1. nouveau contenu dans un fichier temporaire, vidé sur disque
        await writeFileSynced(tmp, content);
        // 2. l'ancienne version devient la copie de secours (.bak), elle aussi atomiquement
        if (fs.existsSync(target) && (await lisible(target))) {
          await withRetries(() => fsp.copyFile(target, bakTmp));
          const fh = await fsp.open(bakTmp, 'r+');
          try {
            await fh.sync();
          } finally {
            await fh.close();
          }
          await withRetries(() => fsp.rename(bakTmp, bak));
        }
        // 3. remplacement atomique
        await withRetries(() => fsp.rename(tmp, target));
        await fsyncDir(dir);
      } catch (err) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        await fsp.rm(bakTmp, { force: true }).catch(() => {});
        throw new Error(describeFsError(err, 'Écriture', dir));
      }
    },

    async read(slot) {
      checkSlot(slot);
      try {
        return await readOrNull(fileOf(slot));
      } catch (err) {
        throw new Error(describeFsError(err, 'Lecture', fileOf(slot)));
      }
    },

    async readBackup(slot) {
      checkSlot(slot);
      try {
        return await readOrNull(bakOf(slot));
      } catch (err) {
        throw new Error(describeFsError(err, 'Lecture', bakOf(slot)));
      }
    },

    async remove(slot) {
      checkSlot(slot);
      try {
        await withRetries(() => fsp.rm(fileOf(slot), { force: true }));
        await withRetries(() => fsp.rm(bakOf(slot), { force: true }));
      } catch (err) {
        throw new Error(describeFsError(err, 'Suppression', dir));
      }
    },

    ensureDir,
  };
  return service;
}

module.exports = { createSaveService, SLOT_REGEX, describeFsError };
