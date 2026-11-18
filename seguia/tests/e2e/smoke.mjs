// Test de fumée E2E de l'exécutable Linux empaqueté (build/linux-test/Seguia).
// Lancement : npm run smoke (sous xvfb-run). Code de sortie non nul en cas d'échec.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { looksRendered, pngStats } from './lib/png-stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { _electron } = require('playwright'); // installé globalement (NODE_PATH)

const SRC_APP = path.join(ROOT, 'build', 'linux-test', 'Seguia');
const SHOTS = path.join(ROOT, 'build', 'smoke');
const EXPECTED_URL = 'app://seguia/index.html';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'OUI' : 'NON'}  ${name}${detail ? '  — ' + detail : ''}`);
}

if (!process.env.DISPLAY) {
  console.error('Aucun DISPLAY : lancer via « npm run smoke » (xvfb-run).');
  process.exit(2);
}
if (!fs.existsSync(path.join(SRC_APP, 'Seguia'))) {
  console.error('build/linux-test/Seguia/Seguia absent : lancer « npm run build:linux-test » d\'abord.');
  process.exit(2);
}

// Copie dans un chemin à espaces et accents.
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'seguia-smoke-'));
const appDir = path.join(base, 'Séguia test é', 'Seguia');
const userData = path.join(base, 'Données joueur à tester', 'Seguia');
fs.mkdirSync(path.dirname(appDir), { recursive: true });
fs.cpSync(SRC_APP, appDir, { recursive: true, verbatimSymlinks: true });
const exe = path.join(appDir, 'Seguia');
fs.chmodSync(exe, 0o755);
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
console.log(`Application copiée dans : ${appDir}`);
console.log(`userData de test        : ${userData}\n`);

let logs = '';
async function launch() {
  const app = await _electron.launch({
    executablePath: exe,
    // Conteneur root : le bac à sable SUID de Chromium est inutilisable ici (sans effet sur le rendu).
    args: ['--no-sandbox'],
    cwd: appDir,
    env: { ...process.env, SEGUIA_TEST: '1', SEGUIA_USERDATA: userData },
    timeout: 60000,
  });
  app.process().stdout?.on('data', (d) => (logs += d));
  app.process().stderr?.on('data', (d) => (logs += d));
  const page = await app.firstWindow({ timeout: 60000 });
  await page.waitForFunction(() => window.__seguiaReady === true, null, { timeout: 60000 });
  return { app, page };
}

async function setContentSize(app, page, w, h) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(w, h);
  }, [w, h]);
  await page.waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [w, h], { timeout: 10000 });
  await page.waitForTimeout(400); // quelques images rendues à la nouvelle taille
}

async function canvasShot(page, file) {
  await page.locator('#scene').screenshot({ path: file });
  return pngStats(file);
}

let exitCode = 0;
let app;
try {
  // ---------- Lancement 1 ----------
  let page;
  ({ app, page } = await launch());

  check('URL de la page = app://seguia/index.html', page.url() === EXPECTED_URL, page.url());
  check('window.__seguiaReady === true', await page.evaluate(() => window.__seguiaReady === true));
  check('Titre de fenêtre « Séguia »', (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())) === 'Séguia');
  const bridgeInfo = await page.evaluate(async () => ({
    testMode: window.seguiaBridge?.testMode,
    version: await window.seguiaBridge?.app.version(),
    keys: Object.keys(window.seguiaBridge ?? {}).sort().join(','),
    noNode: typeof window.require === 'undefined' && typeof window.process === 'undefined',
  }));
  check('Pont présent, testMode true, version 1.0.0, pas de Node dans la page',
    bridgeInfo.testMode === true && bridgeInfo.version === '1.0.0' && bridgeInfo.keys === 'app,saves,testMode' && bridgeInfo.noNode,
    JSON.stringify(bridgeInfo));

  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return null;
    const ext = g.getExtension('WEBGL_debug_renderer_info');
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
  });
  check('Contexte WebGL disponible', !!gl, String(gl));

  await page.waitForTimeout(800);
  const s0 = await canvasShot(page, path.join(SHOTS, 'initial-1280x800.png'));
  check('Canvas WebGL ni noir ni uni (capture initiale)', looksRendered(s0), JSON.stringify(s0));

  // Sécurité : protocole, navigation, fenêtres
  const sec = await page.evaluate(async () => {
    const st = async (u) => { try { return (await fetch(u)).status; } catch { return 'erreur'; } };
    const opened = window.open('https://example.com/');
    return {
      traversal: await st('app://seguia/%2e%2e/package.json'),
      traversal2: await st('app://seguia/..%2Fpackage.json'),
      ok: await st('app://seguia/index.html'),
      opened: opened === null,
    };
  });
  check('Protocole app:// refuse la sortie de dist/', sec.ok === 200 && sec.traversal !== 200 && sec.traversal2 !== 200, JSON.stringify(sec));
  check('window.open bloqué', sec.opened);
  await page.evaluate(() => { location.href = 'https://example.com/'; });
  await page.waitForTimeout(800);
  check('Navigation externe bloquée', page.url() === EXPECTED_URL, page.url());

  // Plein écran (F11 et pont)
  // sendInputEvent passe par le même circuit qu'une vraie touche (before-input-event),
  // contrairement à page.keyboard (CDP) qui le contourne.
  const pressF11 = () => app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
  });
  await pressF11();
  await page.waitForTimeout(800);
  const fs1 = await page.evaluate(() => window.seguiaBridge.app.isFullscreen());
  await pressF11();
  await page.waitForTimeout(800);
  const fs2 = await page.evaluate(() => window.seguiaBridge.app.isFullscreen());
  check('F11 bascule le plein écran (aller-retour)', fs1 === true && fs2 === false, `après 1er F11=${fs1}, après 2e=${fs2}`);

  // Sauvegardes : écriture
  const contentA = JSON.stringify({ version: 1, oasis: 'Tafilalt — été', dattes: 1234, note: 'éàç “guillemets” 🐪' });
  const contentB = JSON.stringify({ version: 1, oasis: 'Tafilalt — hiver', dattes: 4321 });
  const w1 = await page.evaluate(async (c) => {
    const s = window.seguiaBridge.saves;
    await s.write('manuel1', c);
    return { loc: await s.location(), back: await s.read('manuel1'), bak: await s.readBackup('manuel1') };
  }, contentA);
  const savesDir = path.join(userData, 'saves');
  check('location() = <userData>/saves', w1.loc === savesDir, w1.loc);
  check('Écriture manuel1 lisible immédiatement, pas encore de .bak', w1.back === contentA && w1.bak === null);
  check('Fichier manuel1.json sur disque (chemin à espaces/accents)', fs.existsSync(path.join(savesDir, 'manuel1.json')));

  // ---------- Relance complète ----------
  await app.close();
  app = null;
  ({ app, page } = await launch());
  check('Relance : page rechargée sur app://seguia/index.html', page.url() === EXPECTED_URL);
  const r2 = await page.evaluate(() => window.seguiaBridge.saves.read('manuel1'));
  check('Après relance, read(manuel1) rend le même contenu', r2 === contentA);

  const r3 = await page.evaluate(async (c) => {
    const s = window.seguiaBridge.saves;
    await s.write('manuel1', c);
    const list = await s.list();
    return { cur: await s.read('manuel1'), bak: await s.readBackup('manuel1'), info: list.find((x) => x.slot === 'manuel1') };
  }, contentB);
  check('Seconde écriture : read = nouveau contenu', r3.cur === contentB);
  check('Seconde écriture : .bak = ancien contenu', r3.bak === contentA &&
    fs.readFileSync(path.join(savesDir, 'manuel1.json.bak'), 'utf8') === contentA);
  check('list() signale manuel1 avec sauvegarde de secours', !!r3.info && r3.info.exists && r3.info.hasBackup && r3.info.sizeBytes === Buffer.byteLength(contentB), JSON.stringify(r3.info));
  const leftovers = fs.readdirSync(savesDir).filter((n) => n.includes('.tmp-'));
  check('Aucun fichier temporaire résiduel', leftovers.length === 0, leftovers.join(','));

  const bad = await page.evaluate(async () => {
    const out = [];
    for (const slot of ['Manuel1', '../evasion', 'a b', '', 'x'.repeat(33), 'con.json']) {
      try {
        await window.seguiaBridge.saves.write(slot, '{}');
        out.push({ slot, refused: false });
      } catch (e) {
        out.push({ slot, refused: true, msg: e.message });
      }
    }
    return out;
  });
  const allRefused = bad.every((b) => b.refused && /invalide/.test(b.msg) && !/Error invoking/.test(b.msg));
  check('Noms d\'emplacement invalides refusés (message français propre)', allRefused, bad[0]?.msg);
  check('Aucun fichier créé hors de saves/', !fs.existsSync(path.join(userData, 'evasion.json')));

  // Redimensionnements
  for (const [w, h] of [[1366, 768], [1920, 1080]]) {
    await setContentSize(app, page, w, h);
    const file = path.join(SHOTS, `fenetre-${w}x${h}.png`);
    const st = await canvasShot(page, file);
    const inner = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    check(`Redimensionnement ${w}×${h} et rendu correct`, inner[0] === w && inner[1] === h && st.width === w && st.height === h && looksRendered(st),
      `${path.relative(ROOT, file)} ${JSON.stringify(st)}`);
  }

  // Taille minimale imposée
  const minSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMinimumSize());
  check('Taille minimale 1024×640', minSize[0] === 1024 && minSize[1] === 640, JSON.stringify(minSize));

  await page.screenshot({ path: path.join(SHOTS, 'page-finale.png') });
  await app.close();
  app = null;
} catch (e) {
  check('Exécution du scénario sans exception', false, e && e.stack ? e.stack : String(e));
} finally {
  if (app) await app.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies. Captures : ${path.relative(ROOT, SHOTS)}/`);
if (failed.length) {
  exitCode = 1;
  console.log('\n--- Journal Electron (fin) ---\n' + logs.slice(-4000));
  console.log(`Dossier de test conservé pour analyse : ${base}`);
} else {
  fs.rmSync(base, { recursive: true, force: true });
}
process.exit(exitCode);
