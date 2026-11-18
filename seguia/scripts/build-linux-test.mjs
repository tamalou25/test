// npm run build:linux-test → build/linux-test/Seguia/ (pour les tests E2E uniquement, jamais livré)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, buildStage, log, pruneLocales, rmrf, runPackager } from './lib/build-common.mjs';

const BUILD = path.join(ROOT, 'build');
const STAGE = path.join(BUILD, 'stage-linux');
const PKG_OUT = path.join(BUILD, 'linux-packager');
const OUT = path.join(BUILD, 'linux-test');
const APP_DIR = path.join(OUT, 'Seguia');

async function main() {
  for (const p of [STAGE, PKG_OUT, OUT]) rmrf(p);
  const { pkg } = buildStage(STAGE);
  const out = await runPackager({
    dir: STAGE,
    out: PKG_OUT,
    platform: 'linux',
    arch: 'x64',
    name: 'Seguia',
    executableName: 'Seguia',
    appVersion: pkg.version,
    buildVersion: pkg.version,
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.renameSync(out, APP_DIR);
  rmrf(PKG_OUT);
  const exe = path.join(APP_DIR, 'Seguia');
  if (!fs.existsSync(exe)) throw new Error('exécutable Seguia absent');
  if (!fs.existsSync(path.join(APP_DIR, 'resources', 'app.asar'))) throw new Error('resources/app.asar absent');
  log('locales conservées :', pruneLocales(APP_DIR).join(', '));
  console.log(`\nExécutable Linux de test : ${path.relative(ROOT, exe)}`);
}

main().catch((e) => {
  console.error('[build:linux-test] ÉCHEC :', e && e.stack ? e.stack : e);
  process.exit(1);
});
