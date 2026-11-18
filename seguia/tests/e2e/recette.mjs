// Recette de la version distribuable.
//
// Ce qui est joué :
//  - le ZIP Windows final est extrait dans un dossier neuf dont le chemin contient des espaces ; son contenu est contrôlé ;
//  - faute de Windows ici, c'est le paquet Linux des MÊMES sources (même app.asar, vérifié par empreinte) qui est lancé,
//    lui aussi depuis un chemin à espaces et accents, et piloté à la souris et au clavier par Playwright ;
//  - les gestes de construction passent par la souris ; l'écoulement du temps utilise le crochet de test
//    `__seguia.avancer(n)` (le rendu logiciel du conteneur est trop lent pour attendre en temps réel).
//
// usage : xvfb-run -a -s "-screen 0 2560x1600x24" node tests/e2e/recette.mjs
import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { electron, idx, ligne, N, Pilote } from './lib/pilote.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SORTIE = path.join(RACINE, 'build/recette');
const CAPTURES = path.join(SORTIE, 'captures');
fs.mkdirSync(CAPTURES, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const resultats = [];
let echecs = 0;
function verifier(section, nom, ok, detail = '') {
  resultats.push({ section, nom, ok: !!ok, detail: String(detail) });
  if (!ok) echecs++;
  console.log(`${ok ? '  OK ' : ' ÉCHEC'}  [${section}] ${nom}${detail ? ' — ' + detail : ''}`);
}
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/* ------------------------------------------------------------------ préparation */
const zip = fs.readdirSync(path.join(RACINE, 'release')).filter((f) => f.endsWith('-win64.zip')).map((f) => path.join(RACINE, 'release', f))[0];
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'seguia-recette-'));
const dossierWin = path.join(base, 'Jeux de Gary', 'Séguia version 1');
fs.mkdirSync(dossierWin, { recursive: true });
let asarWin = '';
if (zip) {
  execFileSync('unzip', ['-q', zip, '-d', dossierWin]);
  const racine = path.join(dossierWin, 'Seguia');
  const a = (f) => fs.existsSync(path.join(racine, f));
  verifier('ZIP Windows', 'extraction dans un chemin avec espaces et accents', a('Seguia.exe'), dossierWin);
  verifier('ZIP Windows', 'un seul dossier racine « Seguia »', fs.readdirSync(dossierWin).join(',') === 'Seguia');
  verifier('ZIP Windows', 'point d’entrée Seguia.exe (PE32+ x86-64)', /PE32\+ executable.*x86-64/.test(execFileSync('file', [path.join(racine, 'Seguia.exe')]).toString()));
  for (const f of ['LISEZMOI.txt', 'CREDITS.md', 'LICENSE', 'LICENSES.chromium.html', 'resources/app.asar', 'locales/fr.pak']) verifier('ZIP Windows', `contient ${f}`, a(f));
  asarWin = sha(path.join(racine, 'resources/app.asar'));
  verifier('ZIP Windows', 'taille du ZIP', true, `${(fs.statSync(zip).size / 1048576).toFixed(1)} Mo`);
} else verifier('ZIP Windows', 'ZIP présent dans release/', false);

const srcLinux = path.join(RACINE, 'build/linux-test/Seguia');
const dossierApp = path.join(base, 'Copie extraite à tester', 'Séguia');
fs.mkdirSync(path.dirname(dossierApp), { recursive: true });
fs.cpSync(srcLinux, dossierApp, { recursive: true, verbatimSymlinks: true });
const userData = path.join(base, 'Données du joueur é', 'Seguia');
const asarLinux = sha(path.join(dossierApp, 'resources/app.asar'));
verifier('ZIP Windows', 'même app.asar (code et ressources du jeu) dans le ZIP Windows et dans le paquet testé', asarWin === asarLinux, asarLinux.slice(0, 16));

async function lancer(largeur = 1366, hauteur = 768) {
  const app = await electron.launch({
    executablePath: path.join(dossierApp, 'Seguia'),
    args: ['--no-sandbox'],
    env: { ...process.env, SEGUIA_TEST: '1', SEGUIA_USERDATA: userData },
    timeout: 120000,
  });
  const page = await app.firstWindow({ timeout: 120000 });
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  await taille(app, largeur, hauteur);
  await page.waitForFunction(() => window.__seguiaReady === true && !!window.__seguia, null, { timeout: 180000 });
  const p = new Pilote(page);
  await p.qualite('leger');
  return { app, page, erreurs, p };
}
async function taille(app, l, h) {
  await app.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(w, hh); }, [l, h]);
  await pause(700);
}

const rejouer = (p, journal, jusquA, surPas = null) => p.rejouer(journal, jusquA, surPas);

const journalEtape = JSON.parse(fs.readFileSync(path.join(SORTIE, 'journal-etape.json'), 'utf8'));
const journalGrenier = JSON.parse(fs.readFileSync(path.join(SORTIE, 'journal-grenier.json'), 'utf8'));
const mesures = {};

try {
  /* =============================================== 1. parcours à la souris, premières minutes */
  let { app, page, erreurs, p } = await lancer();
  verifier('Lancement', 'page servie par app://seguia/', page.url().startsWith('app://seguia/'), page.url());
  verifier('Lancement', 'menu principal affiché', (await p.ecranCourant()) === 'principal');
  await p.capture(path.join(CAPTURES, '01-menu-1366x768.png'));
  await p.nouvellePartie();
  let r = await p.resume();
  verifier('Parcours', 'nouvelle partie lancée par le menu', r.enJeu && r.pas === 140 && r.habitants === 4, `pas ${r.pas}, ${r.habitants} habitants`);
  const src = await p.etat(() => window.__seguia.etat().carte.sourceCase);
  const sx = src % N;
  const sz = Math.floor(src / N);
  const finZ = await p.etat(() => {
    const s = window.__seguia.etat();
    const x0 = s.carte.sourceCase % 44;
    let z = 0;
    for (const i of s.carte.piste) if (Math.abs((i % 44) - x0) <= 1) z = Math.max(z, Math.floor(i / 44));
    return z - 2;
  });
  // première action utile : une séguia et un jardin
  const pasDepart = r.pas;
  const canal1 = ligne(sx, sz, sx, sz + 8);
  await p.choisirOutil('eau', 'canal1');
  await p.tracer(canal1);
  r = await p.resume();
  verifier('Parcours', 'séguia tracée à la souris (8 cases payées)', Math.round(r.res.pieces) === 102, `pièces ${r.res.pieces}`);
  await p.choisirOutil('cultures', 'jardin');
  await p.cliquerCase(idx(sx + 1, sz + 2));
  r = await p.resume();
  verifier('Parcours', 'jardin posé à la souris', r.batiments === 3 && Math.round(r.res.pieces) === 94, `bâtiments ${r.batiments}`);
  // un refus doit dire pourquoi : poser un jardin sur la séguia
  await p.cliquerCase(idx(sx, sz + 4));
  let msg = await p.messages();
  verifier('Parcours', 'placement refusé : cause et remède affichés', msg.toasts.some((t) => /séguia passe ici/i.test(t) && /à côté du canal/i.test(t)), msg.toasts.join(' | ').slice(0, 140));
  await p.touche('Escape');
  // moins de deux minutes de jeu à vitesse normale = 1200 pas
  let pasEffet = -1;
  for (let k = 0; k < 12 && pasEffet < 0; k++) {
    await p.avancer(60);
    const ok = await p.etat(() => {
      const s = window.__seguia.etat();
      const j = s.batiments.find((b) => b.kind === 'jardin');
      return j && j.chantier >= 1 && j.eauRatio >= 0.8 && s.humidite[j.z * 44 + j.x] >= 0.45;
    });
    if (ok) pasEffet = (await p.resume()).pas - pasDepart;
  }
  mesures.premierEffetSecondes = pasEffet / 10;
  verifier('Parcours', 'premier effet visible (jardin irrigué, sol qui verdit) en moins de 2 minutes de jeu', pasEffet > 0 && pasEffet <= 1200, `${pasEffet / 10} s à vitesse ×1`);
  await p.cadrer([idx(sx, sz + 1), idx(sx + 3, sz + 5)], 13);
  await p.capture(path.join(CAPTURES, '02-premiere-eau-zoom-proche.png'));

  // suite de l'ouverture, toujours à la souris : fontaine, maisons, canal jusqu'à la piste, bassin
  await p.choisirOutil('habitat', 'fontaine');
  await p.cliquerCase(idx(sx + 1, sz + 5));
  // Le joueur promène le bâtiment jusqu'à voir l'aperçu passer au vert : on essaie des cases voisines
  // jusqu'à ce que le jeu accepte la pose (les refus affichent leur cause, vérifié plus haut).
  const nbBatiments = () => p.etat(() => window.__seguia.etat().batiments.length);
  const poserParmi = async (candidats) => {
    const avantPose = await nbBatiments();
    for (const [dx, dz] of candidats) {
      await p.cliquerCase(idx(sx + dx, sz + dz));
      if ((await nbBatiments()) > avantPose) return true;
    }
    return false;
  };
  await p.choisirOutil('habitat', 'maison');
  const maison1 = await poserParmi([[-3, 5], [-3, 4], [-4, 5], [2, 8]]);
  const maison2 = await poserParmi([[-3, 8], [-3, 9], [-4, 8], [2, 11], [-3, 11]]);
  await p.choisirOutil('eau', 'canal1');
  await p.tracer(ligne(sx, sz + 8, sx, finZ));
  await p.choisirOutil('cultures', 'jardin');
  await p.cliquerCase(idx(sx - 2, sz + 2));
  await p.choisirOutil('commerce', 'bassin');
  // le joueur promène le bâtiment jusqu'à voir l'aperçu passer au vert : on essaie les cases voisines du bout du canal
  await poserParmi([[2, finZ - sz - 1], [2, finZ - sz - 2], [-2, finZ - sz - 1], [-2, finZ - sz - 2], [2, finZ - sz - 3]]);
  await p.touche('Escape');
  r = await p.resume();
  const aBassin = await p.etat(() => window.__seguia.etat().batiments.some((b) => b.kind === 'bassin'));
  verifier('Parcours', 'fontaine, maisons, second jardin et bassin posés à la souris', aBassin && maison1 && maison2 && r.batiments >= 8, `${r.batiments} bâtiments, ${Math.round(r.res.pieces)} pièces`);
  // commande de matériaux à zéro (deux clics sur « − ») pour des comptes lisibles
  // on attend la fin du chantier du bassin : le réglage des commandes apparaît alors dans le panneau de gauche
  for (let k = 0; k < 12; k++) {
    await p.avancer(40);
    if (await p.etat(() => window.__seguia.etat().batiments.some((b) => b.kind === 'bassin' && b.chantier >= 1))) break;
  }
  await p.page.waitForSelector('[data-a="commande:-5"]', { timeout: 20000 });
  await p.clicUi('[data-a="commande:-5"]');
  await p.clicUi('[data-a="commande:-5"]');
  verifier('Parcours', 'réglage par l’interface (commande de matériaux à 0)', (await p.etat(() => window.__seguia.etat().commandeMateriaux)) === 0);

  /* =============================================== 2. sauvegarde pendant qu'une caravane boit */
  let phase = '';
  for (let k = 0; k < 80 && phase !== 'abreuvage'; k++) {
    await p.avancer(40);
    if ((await p.ecranCourant()) === 'palier') await p.clicUi('[data-e=retour]');
    phase = await p.etat(() => window.__seguia.etat().caravanes.find((c) => c.phase !== 'annoncee')?.phase ?? '');
  }
  verifier('Reprise', 'une caravane fait halte et boit au bassin', phase === 'abreuvage', phase);
  await p.avancer(6);
  // le joueur met en pause (Espace) avant de sauvegarder : l'état ne bouge plus entre la mesure et la sauvegarde
  await p.touche('Space');
  await p.cadrer([idx(sx - 2, finZ - 4), idx(sx + 6, finZ + 2)], 17);
  await p.capture(path.join(CAPTURES, '03-caravane-au-bassin.png'));
  const avant = await p.etat(() => {
    const S = window.__seguia;
    const s = S.etat();
    const c = s.caravanes.find((k) => k.phase === 'abreuvage');
    return { empreinte: S.empreinte(), pas: s.pas, pieces: s.res.pieces, bu: c?.bu, besoin: c?.besoin, chameaux: c?.chameaux, servies: s.stats.caravanesServies, batiments: s.batiments.length, habitants: S.resume().habitants };
  });
  verifier('Reprise', 'la caravane est en train de boire au moment de la sauvegarde', avant.bu > 0 && avant.bu < avant.besoin, `${avant.bu.toFixed(1)} / ${avant.besoin} u bues`);
  // sauvegarde par les menus : Échap → Sauvegarder → Emplacement 1
  await p.touche('Escape');
  verifier('Reprise', 'Échap ouvre le menu de pause', (await p.ecranCourant()) === 'pause');
  await p.clicUi('[data-e=sauver]');
  await p.clicUi('[data-e="ecrire:manuel1"]');
  await pause(500);
  const fichier = path.join(userData, 'saves', 'manuel1.json');
  verifier('Reprise', 'fichier de sauvegarde écrit sur disque', fs.existsSync(fichier), fichier);
  const chemin = await page.locator('.chemin').innerText();
  verifier('Reprise', 'l’écran indique où sont les sauvegardes', chemin.includes(path.join(userData, 'saves')), chemin);
  await p.capture(path.join(CAPTURES, '04-ecran-sauvegardes.png'));
  await p.clicUi('[data-e=retour]');
  await p.clicUi('[data-e=reprendre]');
  await p.avancer(20); // la partie avance encore un peu (toujours en pause pour le joueur), sans sauvegarde manuelle
  const pasFermeture = (await p.resume()).pas;
  await app.close();
  let pasAuto = -1;
  try { pasAuto = JSON.parse(fs.readFileSync(path.join(userData, 'saves', 'auto.json'), 'utf8')).etat.pas; } catch {}
  verifier('Reprise', 'fermer la fenêtre enregistre la partie en cours (sauvegarde automatique)', pasAuto === pasFermeture, `pas ${pasAuto} dans auto.json, pas ${pasFermeture} à la fermeture`);

  // relance complète de l'application, puis chargement par les menus
  ({ app, page, erreurs, p } = await lancer());
  verifier('Reprise', 'après relance, « Continuer » est proposé (sauvegarde automatique)', (await page.locator('[data-e=continuer]').count()) === 1);
  await page.evaluate(() => window.__seguia.geler(true)); // après chargement, le temps ne s'écoule que par le crochet
  await p.clicUi('[data-e=charger]');
  await p.clicUi('[data-e="lire:manuel1"]');
  await pause(600);
  const apres = await p.etat(() => {
    const S = window.__seguia;
    const s = S.etat();
    const c = s.caravanes.find((k) => k.phase === 'abreuvage');
    return { empreinte: S.empreinte(), pas: s.pas, pieces: s.res.pieces, bu: c?.bu, servies: s.stats.caravanesServies, batiments: s.batiments.length, habitants: S.resume().habitants, enJeu: S.resume().enJeu };
  });
  verifier('Reprise', 'état identique après fermeture et relance (empreinte)', apres.empreinte === avant.empreinte, `${avant.empreinte} = ${apres.empreinte}`);
  verifier('Reprise', 'caravane reprise au même point', apres.bu === avant.bu && apres.pas === avant.pas && apres.pieces === avant.pieces, `pas ${apres.pas}, ${apres.bu.toFixed(1)} u bues, ${Math.round(apres.pieces)} pièces`);
  // on termine l'action engagée : la caravane finit de boire, paie, commerce et repart
  const palierAvant = (await p.resume()).palier;
  await p.avancer(700);
  if ((await p.ecranCourant()) === 'palier') { await p.clicUi('[data-e=retour]'); await p.avancer(300); }
  r = await p.resume();
  // seuls revenus possibles dans cette fenêtre : le paiement de la caravane (4 pièces par chameau) et la prime du palier 1 (30)
  const paiementAttendu = avant.chameaux * 4 + (r.palier > palierAvant ? 30 : 0);
  verifier('Reprise', 'la caravane est comptée une seule fois', r.stats.caravanesServies === 1 && r.stats.caravanesPartielles === 0, `servies ${r.stats.caravanesServies}`);
  verifier('Reprise', 'le paiement est appliqué une seule fois', Math.round(r.res.pieces - apres.pieces) === paiementAttendu, `+${Math.round(r.res.pieces - apres.pieces)} pièces (attendu +${paiementAttendu} : ${avant.chameaux} chameaux × 4${r.palier > palierAvant ? ' + prime de palier 30' : ''})`);
  mesures.reprise = { piecesAvant: Math.round(avant.pieces), piecesApres: Math.round(r.res.pieces), chameaux: avant.chameaux };

  /* =============================================== 3. fichier abîmé et copie de secours */
  await p.touche('Escape');
  await p.clicUi('[data-e=sauver]');
  await p.clicUi('[data-e="ecrire:manuel2"]');
  await pause(300);
  await p.clicUi('[data-e=retour]');
  await p.clicUi('[data-e=reprendre]');
  const pasCopie = (await p.resume()).pas;
  await p.avancer(100);
  await p.touche('Escape');
  await p.clicUi('[data-e=sauver]');
  await p.clicUi('[data-e="ecrire:manuel2"]'); // la première version devient la copie de secours
  await pause(300);
  const f2 = path.join(userData, 'saves', 'manuel2.json');
  verifier('Fichier abîmé', 'la version précédente est gardée en .bak', fs.existsSync(f2 + '.bak'));
  const texte = fs.readFileSync(f2, 'utf8');
  fs.writeFileSync(f2, texte.slice(0, Math.floor(texte.length * 0.6))); // fichier tronqué
  await p.clicUi('[data-e=retour]');
  await p.clicUi('[data-e=charger]');
  const ligne2 = await page.locator('.emplacement').nth(2).innerText();
  verifier('Fichier abîmé', 'l’emplacement est signalé illisible, avec sa copie', /illisible/i.test(ligne2) && /copie de secours/i.test(ligne2), ligne2.replace(/\n/g, ' '));
  await p.capture(path.join(CAPTURES, '05-fichier-illisible.png'));
  await p.clicUi('[data-e="lireCopie:manuel2"]');
  await pause(500);
  r = await p.resume();
  verifier('Fichier abîmé', 'la copie de secours se charge et la partie reprend', r.enJeu && r.pas === pasCopie && r.ecran === '', `pas ${r.pas}`);
  // chargement direct du fichier tronqué (F9 sur un emplacement abîmé) : message exploitable
  const f1 = path.join(userData, 'saves', 'manuel1.json');
  const t1 = fs.readFileSync(f1, 'utf8');
  fs.writeFileSync(f1, t1.replace('"pieces":', '"pieces":1'));
  await p.touche('F9');
  await pause(400);
  const erreurTexte = (await p.ecranCourant()) === 'erreur' ? await page.locator('.fenetre').innerText() : '';
  verifier('Fichier abîmé', 'fichier modifié refusé avec un message clair', /somme de contrôle|incohérente|illisible/i.test(erreurTexte), erreurTexte.replace(/\n/g, ' ').slice(0, 150));
  await p.clicUi('[data-e=retour]');
  fs.writeFileSync(f1, t1);
  verifier('Parcours', 'aucune erreur JavaScript pendant le parcours', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  /* =============================================== 4. deux stratégies depuis le même état initial */
  const jouerStrategie = async (nom, journal) => {
    await p.touche('Escape');
    if ((await p.ecranCourant()) !== 'pause') await p.touche('Escape');
    await p.clicUi('[data-e=principal]');
    await pause(900);
    await p.nouvellePartie({ gele: true });
    const depart = await p.etat(() => window.__seguia.empreinte());
    let captureTempete = false;
    const ecrans = await rejouer(p, journal, journal.pasFinal, async (etape) => {
      if (etape.ecran === 'victoire') await p.capture(path.join(CAPTURES, `08-victoire-${nom}.png`));
      const tempete = await p.etat(() => {
        const s = window.__seguia.etat();
        return s.meteo.some((m) => m.type === 'tempete' && m.grande && s.pas >= m.debutPas + 60 && s.pas < m.finPas);
      });
      if (tempete && !captureTempete && nom === 'etape') {
        captureTempete = true;
        await p.page.evaluate(() => window.__seguia.vue({ x: -6, z: -1, distance: 30, azimut: 0.6, inclinaison: 0 }));
        await pause(2500);
        await p.capture(path.join(CAPTURES, '07-grande-tempete.png'));
      }
    });
    const fin = await p.etat(() => ({ empreinte: window.__seguia.empreinte(), r: window.__seguia.resume() }));
    verifier('Stratégies', `${nom} : partie rejouée dans l'application, identique à la référence (empreinte)`, fin.empreinte === journal.empreinte, `${fin.empreinte} = ${journal.empreinte}`);
    verifier('Stratégies', `${nom} : écrans de palier, de vocation et de victoire affichés`, ['palier', 'vocation', 'victoire'].every((e) => ecrans.includes(e)), ecrans.join(', '));
    verifier('Stratégies', `${nom} : objectif final atteint (victoire)`, fin.r.palier === 3, `jour ${journal.resume.victoireJour + 1}, renommée ${fin.r.renommee}`);
    return { depart, fin: fin.r };
  };
  const e = await jouerStrategie('etape', journalEtape);
  await p.page.evaluate(() => window.__seguia.vue({ x: -6, z: 1, distance: 36, azimut: 0.55, inclinaison: 0 }));
  await p.capture(path.join(CAPTURES, '09-oasis-etape-jour-40.png'));
  const g = await jouerStrategie('grenier', journalGrenier);
  await p.page.evaluate(() => window.__seguia.vue({ x: -4, z: -3, distance: 36, azimut: 0.55, inclinaison: 0 }));
  await p.capture(path.join(CAPTURES, '10-oasis-grenier-jour-40.png'));
  verifier('Stratégies', 'les deux parties partent du même état initial', e.depart === g.depart, e.depart);
  mesures.strategies = { etape: { ...journalEtape.resume }, grenier: { ...journalGrenier.resume } };
  verifier('Stratégies', 'résultats visiblement différents', e.fin.stats.dattesVendues * 1.8 < g.fin.stats.dattesVendues && e.fin.stats.caravanesServies > g.fin.stats.caravanesServies, `dattes vendues ${e.fin.stats.dattesVendues} / ${g.fin.stats.dattesVendues} ; caravanes bien reçues ${e.fin.stats.caravanesServies} / ${g.fin.stats.caravanesServies}`);

  /* =============================================== 5. caméra, résolutions, fluidité */
  const vues = [
    ['large', { x: -4, z: -2, distance: 62, azimut: 0.6, inclinaison: 0 }],
    ['moyenne', { x: -5, z: -4, distance: 26, azimut: 0.9, inclinaison: 0 }],
    ['proche', { x: -4.5, z: -4.5, distance: 9, azimut: 1.2, inclinaison: 0 }],
  ];
  for (const [l, h] of [[1366, 768], [1920, 1080]]) {
    await taille(app, l, h);
    const dim = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    verifier('Affichage', `fenêtre ${l}×${h}`, dim[0] === l && dim[1] === h, dim.join('×'));
    for (const [nom, vue] of vues) {
      await page.evaluate((v) => window.__seguia.vue(v), vue);
      await pause(1800);
      await p.capture(path.join(CAPTURES, `11-${l}x${h}-${nom}.png`));
    }
    // lisibilité : aucun panneau ne déborde de la fenêtre ni ne recouvre un autre panneau
    const boites = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e || e.style.display === 'none') return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      return { barre: r('.barre'), gauche: r('.panneau.gauche'), construire: r('.panneau.construire'), res: r('.ressources'), outils: r('.outilsHaut'), vitesses: r('.vitesses'), w: innerWidth, h: innerHeight };
    });
    const dedans = ['barre', 'gauche', 'construire'].every((k) => boites[k] && boites[k][0] >= 0 && boites[k][1] >= 0 && boites[k][2] <= boites.w + 0.5 && boites[k][3] <= boites.h + 0.5);
    const sansRecouvrement = boites.gauche[3] <= boites.construire[1] || boites.gauche[2] <= boites.construire[0];
    const barreOk = boites.vitesses[2] <= boites.res[0] + 1 && boites.res[2] <= boites.outils[0] + 1;
    verifier('Affichage', `interface lisible à ${l}×${h} (rien ne déborde, rien ne se recouvre)`, dedans && sansRecouvrement && barreOk, `objectifs ${Math.round(boites.gauche[2] - boites.gauche[0])} px, barre de construction ${Math.round(boites.construire[2] - boites.construire[0])} px`);
  }
  await taille(app, 1366, 768);
  await page.evaluate((v) => window.__seguia.vue(v), vues[1][1]);
  const ips = {};
  for (const q of ['leger', 'equilibre']) {
    await page.evaluate((qq) => window.__seguia.jeu.rendu.definirQualite(qq), q);
    await pause(4000);
    ips[q] = await page.evaluate(() => Math.round(window.__seguia.jeu.rendu.ips));
  }
  const infos = await page.evaluate(() => window.__seguia.infos());
  mesures.fluidite = { ...ips, appelsDeDessin: infos.appels, triangles: infos.triangles, scene: 'oasis du jour 40 (stratégie grenier), vue moyenne, 1366×768', configuration: 'conteneur sans carte graphique, rendu logiciel SwiftShader, 4 cœurs' };
  verifier('Affichage', 'charge de rendu d’une grande oasis sous 250 appels de dessin et 400 000 triangles (visé au départ : 150 et 300 000)', infos.appels < 250 && infos.triangles < 400000, `${infos.appels} appels, ${infos.triangles} triangles`);
  verifier('Affichage', 'aucun modèle 3D manquant', (await page.evaluate(() => window.__seguia.manquants.length)) === 0);
  verifier('Parcours', 'aucune erreur JavaScript pendant la recette', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  await app.close();
} catch (err) {
  verifier('Recette', 'exécution complète', false, err.stack?.split('\n').slice(0, 4).join(' / '));
}

fs.writeFileSync(path.join(SORTIE, 'rapport.json'), JSON.stringify({ date: new Date().toISOString(), echecs, resultats, mesures }, null, 2));
let md = `# Recette de la version distribuable\n\n${resultats.length - echecs} vérifications réussies sur ${resultats.length}.\n\n| Section | Vérification | Résultat | Détail |\n|---|---|---|---|\n`;
for (const r of resultats) md += `| ${r.section} | ${r.nom} | ${r.ok ? 'OK' : 'ÉCHEC'} | ${r.detail.replace(/\|/g, '/').slice(0, 160)} |\n`;
md += `\n## Mesures\n\n\`\`\`json\n${JSON.stringify(mesures, null, 2)}\n\`\`\`\n`;
fs.writeFileSync(path.join(SORTIE, 'rapport.md'), md);
console.log(`\n${resultats.length - echecs}/${resultats.length} vérifications réussies. Rapport : build/recette/rapport.md`);
try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
process.exit(echecs ? 1 : 0);
