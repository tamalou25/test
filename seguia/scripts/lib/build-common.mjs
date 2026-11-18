// Étapes communes aux builds Electron (Windows livrable, Linux de test).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const require = createRequire(path.join(ROOT, 'package.json'));
/** Date fixe appliquée aux fichiers pour un ZIP reproductible (SOURCE_DATE_EPOCH prioritaire). */
export const FIXED_DATE = new Date(
  process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : Date.UTC(2026, 0, 1, 12, 0, 0),
);
export const KEEP_LOCALES = ['fr.pak', 'en-US.pak'];

export const log = (...a) => console.log('[build]', ...a);

export function run(cmd, args, opts = {}) {
  log('$', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} a échoué (code ${r.status})`);
  return r;
}

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

export function readPkg() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

export function electronVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
}

/** vite build puis dossier d'étape minimal : package.json réduit, electron/, dist/. */
export function buildStage(stageDir) {
  const pkg = readPkg();
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    throw new Error('package.json : "dependencies" doit rester vide (Vite embarque tout).');
  }
  run(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('dist/index.html absent après vite build');

  rmrf(stageDir);
  fs.mkdirSync(stageDir, { recursive: true });
  const slim = {
    name: pkg.name,
    productName: pkg.productName,
    version: pkg.version,
    description: pkg.description,
    main: pkg.main,
    author: pkg.author,
    license: pkg.license,
  };
  fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(slim, null, 2) + '\n');
  fs.cpSync(path.join(ROOT, 'electron'), path.join(stageDir, 'electron'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dist'), path.join(stageDir, 'dist'), { recursive: true });
  return { pkg, slim };
}

function sha256(file) {
  const r = spawnSync('sha256sum', [file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sha256sum a échoué sur ${file}`);
  return r.stdout.split(/\s+/)[0];
}

function findInElectronGetCache(name) {
  const cache = path.join(process.env.electron_config_cache || path.join(process.env.HOME || '/root', '.cache', 'electron'));
  if (!fs.existsSync(cache)) return null;
  for (const d of fs.readdirSync(cache)) {
    const p = path.join(cache, d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Fournit le ZIP Electron officiel (vérifié par SHA-256 contre node_modules/electron/checksums.json)
 * dans build/electron-zips/. Téléchargement par curl (proxy + CA du système) : le client undici
 * de @electron/get plante parfois derrière le proxy (assert(!this.paused)).
 */
export function ensureElectronZip(platform, arch) {
  const version = electronVersion();
  const name = `electron-v${version}-${platform}-${arch}.zip`;
  const sums = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'checksums.json'), 'utf8'));
  const expected = sums[name];
  if (!expected) throw new Error(`somme de contrôle inconnue pour ${name}`);
  const dir = path.join(ROOT, 'build', 'electron-zips');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  if (fs.existsSync(dest) && sha256(dest) === expected) return dir;
  const cached = findInElectronGetCache(name);
  if (cached && sha256(cached) === expected) {
    fs.copyFileSync(cached, dest);
    return dir;
  }
  const url = `https://github.com/electron/electron/releases/download/v${version}/${name}`;
  const part = dest + '.part';
  for (let attempt = 1; attempt <= 3; attempt++) {
    rmrf(part);
    log(`téléchargement ${url} (essai ${attempt})`);
    const r = spawnSync('curl', ['-fL', '--retry', '3', '--retry-delay', '2', '-sS', '-o', part, url], { stdio: 'inherit' });
    if (r.status === 0 && sha256(part) === expected) {
      fs.renameSync(part, dest);
      return dir;
    }
    log(`échec (code curl ${r.status}) ou somme de contrôle incorrecte`);
  }
  rmrf(part);
  throw new Error(`impossible d'obtenir ${name}`);
}

export async function runPackager(opts) {
  const { packager } = await import(require.resolve('@electron/packager'));
  const paths = await packager({
    electronVersion: electronVersion(),
    electronZipDir: ensureElectronZip(opts.platform, opts.arch),
    asar: true,
    prune: false, // aucune dépendance d'exécution dans le dossier d'étape
    overwrite: true,
    quiet: false,
    junk: true,
    ...opts,
  });
  if (!paths || paths.length !== 1) throw new Error(`packager : sortie inattendue ${JSON.stringify(paths)}`);
  return paths[0];
}

export function pruneLocales(appDir) {
  const dir = path.join(appDir, 'locales');
  if (!fs.existsSync(dir)) return [];
  for (const f of fs.readdirSync(dir)) {
    if (!KEEP_LOCALES.includes(f)) fs.rmSync(path.join(dir, f), { force: true });
  }
  const kept = fs.readdirSync(dir).sort();
  for (const k of KEEP_LOCALES) if (!kept.includes(k)) throw new Error(`locale manquante : ${k}`);
  return kept;
}

export function copyReadme(appDir) {
  const src = path.join(ROOT, 'LISEZMOI.txt');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(appDir, 'LISEZMOI.txt'));
    // les avis de licence des composants embarqués (three.js, polices) accompagnent le jeu
    const credits = path.join(ROOT, 'CREDITS.md');
    if (fs.existsSync(credits)) fs.copyFileSync(credits, path.join(appDir, 'CREDITS.md'));
    return true;
  }
  return false;
}

/** Icône .ico multi-tailles à partir de assets_src/icon.png, ou null (icône Electron par défaut). */
export function makeIco(outDir) {
  const src = path.join(ROOT, 'assets_src', 'icon.png');
  if (!fs.existsSync(src)) {
    log('assets_src/icon.png absent : icône par défaut conservée.');
    return null;
  }
  const out = path.join(outDir, 'icon.ico');
  fs.mkdirSync(outDir, { recursive: true });
  try {
    run('convert', [
      src,
      '-background', 'none',
      '-define', 'icon:auto-resize=256,128,64,48,32,24,16',
      '+set', 'date:create', '+set', 'date:modify',
      out,
    ]);
    return out;
  } catch (e) {
    log(`AVERTISSEMENT : génération de l'icône impossible (${e.message}) ; icône par défaut conservée.`);
    return null;
  }
}

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    acc.push({ abs: p, rel: path.relative(base, p), isDir: e.isDirectory() });
    if (e.isDirectory()) walk(p, base, acc);
  }
  return acc;
}

/** Fixe les dates de tous les fichiers (reproductibilité du ZIP). */
export function normalizeTimes(dir) {
  for (const { abs } of walk(dir)) fs.utimesSync(abs, FIXED_DATE, FIXED_DATE);
  fs.utimesSync(dir, FIXED_DATE, FIXED_DATE);
}

/**
 * ZIP reproductible : `parentDir/folderName/**` → zipPath, avec folderName comme unique racine.
 * Ordre trié, dates fixes, sans attributs supplémentaires (-X), TZ=UTC.
 */
export function makeZip(parentDir, folderName, zipPath) {
  rmrf(zipPath);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  normalizeTimes(path.join(parentDir, folderName));
  const entries = [folderName + '/', ...walk(path.join(parentDir, folderName)).map((e) =>
    path.posix.join(folderName, e.rel.split(path.sep).join('/')) + (e.isDir ? '/' : ''),
  )].sort();
  const r = spawnSync('zip', ['-X', '-9', '-q', '-y', zipPath, '-@'], {
    cwd: parentDir,
    input: entries.join('\n') + '\n',
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, TZ: 'UTC' },
  });
  if (r.status !== 0) throw new Error(`zip a échoué (code ${r.status})`);
}

export function humanSize(n) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${(n / 1024).toFixed(1)} Ko`;
}

export function listTopLevel(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
    .sort();
}
