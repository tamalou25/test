// Pilote de test : joue au jeu par la souris et le clavier, dans Chromium (serveur Vite) ou dans l'application Electron.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
export const { chromium, _electron: electron } = pw;

export const N = 44;
export const idx = (x, z) => z * N + x;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ouvrirNavigateur(url = 'http://127.0.0.1:5173/?test=1', largeur = 1366, hauteur = 768) {
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await nav.newPage({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1 });
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__seguiaReady === true, null, { timeout: 180000 });
  return { page, erreurs, fermer: () => nav.close() };
}

export class Pilote {
  constructor(page) { this.page = page; }
  /**
   * Réglage graphique. Les tests tournent en « leger » (le rendu logiciel du conteneur met plusieurs secondes
   * par image avec les effets) ; `capture` repasse en « equilibre » le temps de la prise de vue.
   */
  async qualite(q) {
    await this.page.evaluate((x) => window.__seguia.jeu.rendu.definirQualite(x), q);
    this.qualiteCourante = q;
  }
  async resume() { return this.page.evaluate(() => window.__seguia.resume()); }
  async etat(fn) { return this.page.evaluate(fn); }
  /** avance la simulation de n pas par le crochet de test (le rendu logiciel est trop lent pour attendre) */
  async avancer(n) {
    let reste = n;
    while (reste > 0) {
      const lot = Math.min(reste, 240);
      const fait = await this.page.evaluate((k) => window.__seguia.avancer(k), lot);
      reste -= fait;
      if (fait < lot) break; // un écran s'est ouvert
    }
    return n - reste;
  }
  async clicUi(selecteur) {
    await this.page.locator(selecteur).first().click();
    await pause(120);
  }
  async ecranCourant() { return this.page.evaluate(() => window.__seguia.resume().ecran); }
  /** Nouvelle partie par les menus (carte du scénario). */
  async nouvellePartie({ hasard = false, secheresse = false, gele = false } = {}) {
    // gele : le temps de jeu ne s'écoule que par le crochet `avancer` (rejeu exact d'un journal de commandes)
    await this.page.evaluate((g) => window.__seguia.geler(g), gele);
    await this.clicUi('[data-e=nouvelle]');
    if (hasard) await this.clicUi('[data-e="carte:hasard"]');
    if (secheresse) await this.clicUi('[data-e=secheresse]');
    await this.clicUi('[data-e=lancer]');
    await pause(600);
    if ((await this.ecranCourant()) === 'aide') await this.clicUi('[data-e=retour]');
  }
  async pointCase(i) {
    const p = await this.page.evaluate((k) => window.__seguia.ecranCase(k), i);
    return p;
  }
  /** Cadre la caméra pour que toutes les cases données soient visibles, vue plongeante. */
  async cadrer(cases, distance = 34) {
    const xs = cases.map((i) => i % N), zs = cases.map((i) => Math.floor(i / N));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5 - N / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2 + 0.5 - N / 2;
    await this.page.evaluate(([x, z, d]) => window.__seguia.vue({ x, z, distance: d, azimut: 0.35, inclinaison: 0.25 }), [cx, cz, distance]);
    await pause(250);
  }
  async choisirOutil(categorie, cle) {
    if (categorie) await this.clicUi(`[data-a="cat:${categorie}"]`);
    await this.clicUi(`[data-a="outil:${cle}"]`);
  }
  /** Le point de l'écran est-il bien sur la scène (et pas sous un panneau de l'interface) ? */
  async libre(pt) {
    return this.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id === 'scene', [pt.x, pt.y]);
  }
  /** Recadre jusqu'à ce que toutes les cases soient visibles et cliquables. */
  async cadrerVisible(cases, distance = 24) {
    let d = Math.max(distance, 18);
    for (let essai = 0; essai < 6; essai++) {
      await this.cadrer(cases, d);
      let ok = true;
      for (const i of cases) {
        const pt = await this.pointCase(i);
        if (!pt.devant || !(await this.libre(pt))) { ok = false; break; }
      }
      if (ok) return d;
      d *= 1.22;
    }
    throw new Error('impossible de cadrer les cases ' + cases.slice(0, 4).join(','));
  }
  /** Trace en glissant la souris de case en case. */
  async tracer(cases) {
    await this.cadrerVisible(cases, 16 + cases.length * 1.6);
    const p0 = await this.pointCase(cases[0]);
    await this.page.mouse.move(p0.x, p0.y);
    await this.page.mouse.down();
    for (const i of cases.slice(1)) {
      const p = await this.pointCase(i);
      await this.page.mouse.move(p.x, p.y, { steps: 2 });
    }
    await pause(60);
    await this.page.mouse.up();
    await pause(150);
  }
  /** Clique sur une case (pose d'un bâtiment, sélection). */
  async cliquerCase(i, bouton = 'left') {
    await this.cadrerVisible([i], 26);
    const p = await this.pointCase(i);
    await this.page.mouse.move(p.x, p.y);
    await pause(80);
    await this.page.mouse.click(p.x, p.y, { button: bouton });
    await pause(150);
  }
/** Rejoue un journal de commandes de bot dans l'application, en répondant aux écrans par de vrais clics. */
  async rejouer(journal, jusquA, surPas = null) {
    const p = this;
  const cmds = journal.commandes;
  let k = 0;
  let ecransVus = [];
  // la partie doit partir exactement du même état que le bot
  for (;;) {
    const r = await p.page.evaluate(([liste, depart, fin]) => {
      const S = window.__seguia;
      let i = depart;
      for (;;) {
        const pas = S.etat().pas;
        while (i < liste.length && liste[i].pas <= pas) {
          if (liste[i].pas === pas) {
            if (liste[i].cmd.t === 'vocation') return { i, pas, ecran: S.resume().ecran, vocation: liste[i].cmd.v };
            S.jeu.commande(liste[i].cmd);
          }
          i++;
        }
        if (pas >= fin) return { i, pas, ecran: S.resume().ecran, fini: true };
        const prochain = i < liste.length ? Math.min(liste[i].pas, fin) : fin;
        const n = Math.min(prochain - pas, 400);
        const fait = S.avancer(n);
        if (S.resume().ecran) return { i, pas: S.etat().pas, ecran: S.resume().ecran };
        if (fait < n) return { i, pas: S.etat().pas, ecran: S.resume().ecran };
        if (S.etat().pas % 2400 < n) return { i, pas: S.etat().pas, ecran: '', souffle: true };
      }
    }, [cmds, k, jusquA]);
    k = r.i;
    if (r.vocation) {
      ecransVus.push('vocation');
      await p.clicUi(`[data-e="vocation:${r.vocation}"]`);
      k++;
      continue;
    }
    if (r.ecran === 'vocation') {
      // l'écran de choix vient de s'ouvrir : on clique la carte que la stratégie de référence a choisie à ce même pas
      ecransVus.push('vocation');
      while (k < cmds.length && cmds[k].cmd.t !== 'vocation') k++;
      if (k >= cmds.length || cmds[k].pas !== r.pas) throw new Error(`choix de vocation inattendu au pas ${r.pas}`);
      if (surPas) await surPas(r);
      await p.clicUi(`[data-e="vocation:${cmds[k].cmd.v}"]`);
      k++;
      continue;
    }
    if (r.ecran) {
      ecransVus.push(r.ecran);
      if (surPas) await surPas(r);
      await p.clicUi('[data-e=retour]');
      continue;
    }
    if (surPas) await surPas(r);
    if (r.fini) break;
  }
  return ecransVus;
}

  async touche(t) { await this.page.keyboard.press(t); await pause(100); }
  async capture(chemin, attente = 400) {
    const avant = this.qualiteCourante;
    if (avant === 'leger') { await this.qualite('equilibre'); await pause(2500); }
    await pause(attente);
    await this.page.screenshot({ path: chemin });
    if (avant === 'leger') await this.qualite('leger');
  }
  /** Texte visible des messages (toasts) et de la bulle du curseur. */
  async messages() {
    return this.page.evaluate(() => ({
      toasts: Array.from(document.querySelectorAll('.toast')).map((e) => e.textContent),
      bulle: document.querySelector('.bulle')?.style.display === 'none' ? '' : document.querySelector('.bulle')?.textContent ?? '',
    }));
  }
}

export function ligne(x0, z0, x1, z1) {
  const r = [idx(x0, z0)];
  let x = x0, z = z0;
  while (x !== x1) { x += x1 > x ? 1 : -1; r.push(idx(x, z)); }
  while (z !== z1) { z += z1 > z ? 1 : -1; r.push(idx(x, z)); }
  return r;
}
