// Capture d'écran du jeu servi par Vite dans Chromium (rendu logiciel).
// usage : node scripts/capture.mjs sortie.png [largeur hauteur] [--js "code exécuté dans la page avant la capture"] [--attente ms] [--base url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const args = process.argv.slice(2);
const opt = (nom, def) => { const k = args.indexOf('--' + nom); if (k < 0) return def; const v = args[k + 1]; args.splice(k, 2); return v; };
const js = opt('js', '');
const attente = Number(opt('attente', '2500'));
const base = opt('base', 'http://127.0.0.1:5173/?test=1');
const [sortie = 'capture.png', l = '1366', h = '768'] = args;
const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await nav.newPage({ viewport: { width: Number(l), height: Number(h) }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GPU stall')) erreurs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
await page.goto(base);
await page.waitForFunction(() => window.__seguiaReady === true, null, { timeout: 180000 });
let retour = null;
if (js) retour = await page.evaluate(js);
await page.waitForTimeout(attente);
const infos = await page.evaluate(() => (window.__seguia?.infos ? { ...window.__seguia.infos(), manquants: window.__seguia.manquants } : null));
await page.screenshot({ path: sortie });
console.log(JSON.stringify({ sortie, infos, retour, erreurs: erreurs.slice(0, 8) }));
await nav.close();
