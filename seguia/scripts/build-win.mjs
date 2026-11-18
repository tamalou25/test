// npm run build:win → release/Seguia-v<version>-win64.zip (dossier racine Seguia/ contenant Seguia.exe)
import fs from 'node:fs';
import path from 'node:path';
import {
  FIXED_DATE, ROOT, buildStage, copyReadme, humanSize, listTopLevel, log, makeIco, makeZip, pruneLocales, rmrf, runPackager,
} from './lib/build-common.mjs';

const BUILD = path.join(ROOT, 'build');
const STAGE = path.join(BUILD, 'stage-win');
const PKG_OUT = path.join(BUILD, 'win-packager');
const FINAL_PARENT = path.join(BUILD, 'win');
const APP_DIR = path.join(FINAL_PARENT, 'Seguia');

async function main() {
  for (const p of [STAGE, PKG_OUT, FINAL_PARENT, path.join(BUILD, 'icon')]) rmrf(p);

  const { pkg } = buildStage(STAGE);
  const zipPath = path.join(ROOT, 'release', `Seguia-v${pkg.version}-win64.zip`);
  rmrf(zipPath);
  const icon = makeIco(path.join(BUILD, 'icon'));

  const year = FIXED_DATE.getUTCFullYear();
  const out = await runPackager({
    dir: STAGE,
    out: PKG_OUT,
    platform: 'win32',
    arch: 'x64',
    name: 'Seguia',
    executableName: 'Seguia',
    appVersion: pkg.version,
    buildVersion: pkg.version,
    appCopyright: `© ${year} ${pkg.author || 'Séguia'}`,
    ...(icon ? { icon } : {}),
    win32metadata: {
      ProductName: 'Séguia',
      FileDescription: "Séguia — jeu de gestion d'une oasis-relais",
      InternalName: 'Seguia',
      OriginalFilename: 'Seguia.exe',
      CompanyName: pkg.author || 'Séguia',
    },
  });

  fs.mkdirSync(FINAL_PARENT, { recursive: true });
  fs.renameSync(out, APP_DIR);
  rmrf(PKG_OUT);

  if (!fs.existsSync(path.join(APP_DIR, 'Seguia.exe'))) throw new Error('Seguia.exe absent du dossier empaqueté');
  if (!fs.existsSync(path.join(APP_DIR, 'resources', 'app.asar'))) throw new Error('resources/app.asar absent');
  const locales = pruneLocales(APP_DIR);
  log('locales conservées :', locales.join(', '));
  log(copyReadme(APP_DIR) ? 'LISEZMOI.txt copié.' : 'LISEZMOI.txt absent à la racine du projet : ignoré.');

  makeZip(FINAL_PARENT, 'Seguia', zipPath);
  const size = fs.statSync(zipPath).size;
  console.log('\n=== ZIP Windows ===');
  console.log(`Fichier : ${path.relative(ROOT, zipPath)}`);
  console.log(`Taille  : ${humanSize(size)} (${size} octets)`);
  console.log('Contenu de premier niveau (Seguia/) :');
  for (const n of listTopLevel(APP_DIR)) console.log('  ' + n);
}

main().catch((e) => {
  console.error('[build:win] ÉCHEC :', e && e.stack ? e.stack : e);
  process.exit(1);
});
