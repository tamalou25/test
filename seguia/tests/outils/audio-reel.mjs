// Vérifie le moteur sur un AudioContext RÉEL dans Chromium (Playwright global) :
// démarrage, maj par image, effets, suspendre/reprendre (état du contexte), détruire, absence d'erreur.
// Usage : node tests/outils/audio-reel.mjs   (après tests/outils/audio-rendu.mjs, qui produit le bundle)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = path.join(ROOT, 'build', 'audio', 'bundle', 'seguia-audio.js');
if (!fs.existsSync(BUNDLE)) { console.error('bundle absent : lancer tests/outils/audio-rendu.mjs'); process.exit(2); }
const require = createRequire(path.join(ROOT, 'package.json'));
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const nav = await pw.chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await nav.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(m.text()); });
await page.setContent('<!doctype html><title>reel</title>');
await page.addScriptTag({ path: BUNDLE });
const r = await page.evaluate(async () => {
  const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const m = SeguiaAudio.creerMoteurAudio();
  const avant = m.demarre;
  m.maj({}, 0.016); m.jouer('clic'); // avant démarrage : sans effet
  await m.demarrer();
  const ctx = m.diagnostic.contexte;
  const etat = { saison: 0, lumiere: 0.9, tempete: 0, canicule: false, proximite: 0.9, eauProche: 0.8,
    verdureProche: 0.8, vieProche: 0.5, caravane: true, pause: false, vitesse: 1 };
  const t0 = performance.now();
  let images = 0, coutMax = 0, coutTotal = 0;
  while (performance.now() - t0 < 3000) {
    const a = performance.now();
    m.maj(etat, 0.016);
    if (images % 6 === 0) m.jouer('canal');
    const c = performance.now() - a; coutMax = Math.max(coutMax, c); coutTotal += c;
    images++;
    await dormir(16);
  }
  const etatAvant = ctx.state;
  m.suspendre();
  await dormir(400);
  const etatSuspendu = ctx.state;
  m.reprendre();
  await dormir(300);
  const etatRepris = ctx.state;
  m.jouer('victoire');
  m.detruire();
  await dormir(200);
  return { avant, apres: m.demarre, etatAvant, etatSuspendu, etatRepris, etatDetruit: ctx.state,
    images, majMoyMs: +(coutTotal / images).toFixed(3), majMaxMs: +coutMax.toFixed(2),
    noeuds: m.diagnostic.noeudsPermanents, latence: ctx.baseLatency };
});
await nav.close();
console.log(JSON.stringify(r, null, 2));
console.log('erreurs :', erreurs.length ? erreurs : 'aucune');
const ok = r.etatAvant === 'running' && r.etatSuspendu === 'suspended' && r.etatRepris === 'running' && r.etatDetruit === 'closed' && !erreurs.length;
console.log(ok ? 'OK' : 'ÉCHEC');
process.exit(ok ? 0 : 1);
