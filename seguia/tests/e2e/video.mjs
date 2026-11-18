// Courte séquence de jeu et captures de présentation, image par image (le rendu logiciel est trop lent pour filmer en direct).
// Le jeu tourne dans Chromium sur le serveur de développement ; la partie est celle de la stratégie « étape », rejouée.
// usage : node tests/e2e/video.mjs   (serveur Vite lancé : npm run dev)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirNavigateur, Pilote } from './lib/pilote.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMAGES = path.join(RACINE, 'build/video/images');
const SORTIE = path.join(RACINE, 'release');
fs.rmSync(IMAGES, { recursive: true, force: true });
fs.mkdirSync(IMAGES, { recursive: true });
fs.mkdirSync(path.join(SORTIE, 'captures'), { recursive: true });
const journal = JSON.parse(fs.readFileSync(path.join(RACINE, 'build/recette/journal-etape.json'), 'utf8'));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const L = 1280, H = 720;
const { page, fermer } = await ouvrirNavigateur(process.env.SEGUIA_URL ?? 'http://127.0.0.1:4173/?test=1', L, H);
const p = new Pilote(page);
await p.nouvellePartie({ gele: true });
const PAS_JOUR = 480;
let image = 0;
const vue = (v) => page.evaluate((x) => window.__seguia.vue(x), v);
const figer = (oui) => page.evaluate((o) => window.__seguia.figer(o), oui);
const still = async (nom, attente = 1800) => { await pause(attente); await page.screenshot({ path: path.join(SORTIE, 'captures', nom) }); console.log('capture', nom); };

/** Filme n images en interpolant la caméra de a vers b ; le jeu avance à la vitesse donnée. */
async function plan(n, a, b, vitesse = 2) {
  await page.evaluate((v) => { window.__seguia.jeu.vitesse = v; }, vitesse);
  await figer(true);
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const e = t * t * (3 - 2 * t);
    const v = {};
    for (const c of Object.keys(a)) v[c] = a[c] + (b[c] - a[c]) * e;
    await page.evaluate(([x, dt]) => { window.__seguia.vue(x); window.__seguia.image(dt); }, [v, 1 / 24]);
    await page.screenshot({ path: path.join(IMAGES, `i${String(image++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
  }
  await figer(false);
}
const jusqua = async (pas) => { await p.rejouer(journal, pas); };
/** avance de n pas en continuant d'appliquer les commandes du journal */
const avance = async (n) => { const pas = (await p.resume()).pas; await p.rejouer(journal, pas + n); };
const masquerHud = (oui) => page.evaluate((o) => window.__seguia.jeu.hud.visible(!o), oui);

// --- jour 3 : la première eau (interface visible) ---
await jusqua(140 + PAS_JOUR * 2 + 200);
await plan(66, { x: -6, z: -3, distance: 40, azimut: 0.25, inclinaison: 0 }, { x: -7, z: -5, distance: 20, azimut: 0.55, inclinaison: 0 }, 2);

// --- jour 20, matin : l'oasis en vue large puis plongée vers les cultures ---
await jusqua(PAS_JOUR * 19 + 190);
await vue({ x: -5, z: -1, distance: 62, azimut: 0.35, inclinaison: 0 });
await page.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
await still('vue-generale-jour-20.png', 2500);
await plan(78, { x: -5, z: -1, distance: 64, azimut: 0.2, inclinaison: 0 }, { x: -5, z: -2, distance: 44, azimut: 0.75, inclinaison: 0 }, 2);
await plan(72, { x: -5, z: -2, distance: 44, azimut: 0.75, inclinaison: 0 }, { x: -3.5, z: -6.2, distance: 11, azimut: 1.25, inclinaison: 0 }, 1);
await masquerHud(true);
await still('zoom-palmeraie-et-jardins.png', 1500);
await masquerHud(false);

// --- une caravane au bassin ---
let phase = '';
for (let k = 0; k < 200 && phase !== 'abreuvage'; k++) {
  await avance(20);
  phase = await p.etat(() => window.__seguia.etat().caravanes.find((c) => c.phase === 'abreuvage') ? 'abreuvage' : '');
}
const bassin = await p.etat(() => { const b = window.__seguia.etat().batiments.find((x) => x.kind === 'bassin'); return { x: b.x + 1.5 - 22, z: b.z + 1 - 22 }; });
await plan(72, { x: bassin.x, z: bassin.z, distance: 22, azimut: -0.5, inclinaison: 0 }, { x: bassin.x, z: bassin.z, distance: 12, azimut: 0.1, inclinaison: 0 }, 1);
await masquerHud(true);
await still('caravane-au-bassin.png', 1500);
await masquerHud(false);

// --- la nuit : lanternes et fenêtres ---
const heure = await p.etat(() => (window.__seguia.etat().pas % 480) * 0.05);
await avance(Math.round((((21.2 - heure) + 24) % 24) / 0.05));
await plan(60, { x: bassin.x + 1, z: bassin.z - 3, distance: 30, azimut: 0.9, inclinaison: 0 }, { x: bassin.x + 2, z: bassin.z - 2, distance: 19, azimut: 1.3, inclinaison: 0 }, 1);
await masquerHud(true);
await still('nuit-au-caravanserail.png', 1500);
await masquerHud(false);

// --- la grande tempête de l'an 2 ---
const debut = await p.etat(() => { const s = window.__seguia.etat(); const m = s.meteo.find((x) => x.type === 'tempete' && x.grande); return m ? m.debutPas : -1; });
const cible = debut > 0 ? debut + 50 : PAS_JOUR * 28 + 200;
await jusqua(cible);
await plan(72, { x: -5, z: -2, distance: 40, azimut: 0.4, inclinaison: 0 }, { x: -5, z: -3, distance: 24, azimut: 0.7, inclinaison: 0 }, 1);
await still('grande-tempete.png', 1500);

await fermer();

// --- une décision et son effet, dans une session neuve (cette manipulation fait diverger la partie du journal) ---
{
  const session = await ouvrirNavigateur(process.env.SEGUIA_URL ?? 'http://127.0.0.1:4173/?test=1', L, H);
  const page = session.page;
  const p = new Pilote(page);
  const vue = (v) => page.evaluate((x) => window.__seguia.vue(x), v);
  const still = async (nom, attente = 1800) => { await pause(attente); await page.screenshot({ path: path.join(SORTIE, 'captures', nom) }); console.log('capture', nom); };
  await p.nouvellePartie({ gele: true });
  await p.rejouer(journal, PAS_JOUR * 19 + 190);
  const rep = await p.etat(() => { const b = window.__seguia.etat().batiments.find((x) => x.kind === 'repartiteur'); return b ? { id: b.id, i: b.z * 44 + b.x, poids: b.poids } : null; });
  if (rep) {
    await vue({ x: (rep.i % 44) + 4 - 22, z: Math.floor(rep.i / 44) + 1.5 - 22, distance: 21, azimut: 0.15, inclinaison: 0.3 });
    await page.evaluate((id) => { const j = window.__seguia.jeu; j.selectionner({ t: 'batiment', id }); j.definirVue('eau'); j.vitesse = 0; }, rep.id);
    await still('decision-1-avant.png', 2500);
    await page.evaluate((id) => { const j = window.__seguia.jeu; j.vitesse = 1; j.commande({ t: 'poids', id, poids: [0, 0, 3, 0] }); }, rep.id);
    await p.avancer(100); // cinq heures de jeu : la branche tarit, les jardins ont soif
    await page.evaluate(() => { window.__seguia.jeu.vitesse = 0; });
    await still('decision-2-apres.png', 2500);
    execFileSync('convert', [path.join(SORTIE, 'captures/decision-1-avant.png'), path.join(SORTIE, 'captures/decision-2-apres.png'), '-append', path.join(SORTIE, 'captures/decision-repartiteur-avant-apres.png')]);
    // on rétablit le réglage du bot et on repart du journal (la partie filmée diverge ici de la référence, sans importance pour la vidéo)
    await page.evaluate(([id, poids]) => { const j = window.__seguia.jeu; j.commande({ t: 'poids', id, poids }); j.definirVue(null); j.selectionner(null); j.vitesse = 1; }, [rep.id, rep.poids]);
  }


  await session.fermer();
}
const mp4 = path.join(SORTIE, 'Seguia-sequence-de-jeu.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(IMAGES, 'i%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
console.log(`${image} images, vidéo : ${mp4} (${(fs.statSync(mp4).size / 1048576).toFixed(1)} Mo)`);
