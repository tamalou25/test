/**
 * Le jeu : relie la simulation, le rendu, l'interface, le son et les sauvegardes.
 */
import { creerMoteurAudio } from '../audio';
import type { MoteurAudio, NomEffet } from '../audio/types';
import { getSaveStore, isTestMode, type SaveStore } from '../platform';
import { DEMI } from '../render/monde';
import { TEINTE } from '../render/apercu';
import { Rendu } from '../render/rendu';
import {
  aEauPotable,
  appliquer,
  avancer,
  B,
  BATIMENTS,
  batimentParId,
  cacheDe,
  calendrier,
  canicule,
  coutCanal,
  creerPartie,
  deserialiser,
  detailRenommee,
  distancePiste,
  empreinte,
  expositionApercu,
  GRAINE_SCENARIO,
  lireMeta,
  N,
  NN,
  objectifs,
  PAS_DEPART,
  PAS_PAR_JOUR,
  population,
  serialiser,
  Sol,
  tempeteEnCours,
  topologie,
  verifierCanal,
  verifierCloture,
  verifierConstruction,
  type Commande,
  type Dir,
  type Evenement,
  type GameState,
  type MetaSauvegarde,
  type Resultat,
} from '../sim';
import {
  Ecrans,
  htmlAide,
  htmlConfirmer,
  htmlErreur,
  htmlJournal,
  htmlNouvelle,
  htmlPalier,
  htmlPause,
  htmlPrincipal,
  htmlReglages,
  htmlSauvegardes,
  htmlVictoire,
  htmlVocation,
  type LigneEmplacement,
} from '../ui/ecrans';
import { Hud } from '../ui/hud';
import { statutDe } from './statut';
import { REGLAGES_DEFAUT, type ActionsJeu, type EtatJeu, type Outil, type Reglages, type Selection, type VueInfo } from './types';
import { genererVignettes } from './vignettes';

const EMPLACEMENTS: [string, string][] = [
  ['auto', 'Sauvegarde automatique'],
  ['manuel1', 'Emplacement 1'],
  ['manuel2', 'Emplacement 2'],
  ['manuel3', 'Emplacement 3'],
];

interface Geste {
  type: 'gauche' | 'pan' | 'tourne' | 'trace';
  x0: number;
  y0: number;
  bouge: boolean;
}

export class Jeu {
  readonly rendu: Rendu;
  readonly hud: Hud;
  readonly ecrans: Ecrans;
  readonly audio: MoteurAudio;
  readonly store: SaveStore;
  s: GameState;
  vitesse = 1;
  private vitesseAvantPause = 1;
  outil: Outil = { t: 'selection' };
  selection: Selection = null;
  vue: VueInfo = null;
  reglages: Reglages = structuredClone(REGLAGES_DEFAUT);
  /** false : menu principal, le décor tourne en vitrine */
  enJeu = false;
  private acc = 0;
  private vignettes: Record<string, string> = {};
  private canvas: HTMLCanvasElement;
  private px = 0;
  private py = 0;
  private dansCanvas = false;
  private geste: Geste | null = null;
  private trace: number[] = [];
  private touches = new Set<string>();
  private chronoHud = 0;
  private chronoSurcouche = 0;
  private dernierObjectifs = '';
  private irrigues = new Set<number>();
  private dernierTemps = 0;
  private version = '1.0.0';
  private chronoIps = 0;
  private lentDepuis = 0;
  private conseilQualiteDonne = false;
  private elIps: HTMLElement;
  private dernierSon: Record<string, number> = {};

  constructor(canvas: HTMLCanvasElement, racineUi: HTMLElement) {
    this.canvas = canvas;
    this.rendu = new Rendu(canvas);
    this.store = getSaveStore();
    this.audio = creerMoteurAudio();
    this.s = creerPartie(GRAINE_SCENARIO);
    const actions: ActionsJeu = {
      commande: (cmd) => this.commande(cmd),
      outil: (o) => this.definirOutil(o),
      vitesse: (v) => this.definirVitesse(v),
      pause: () => this.basculerPause(),
      selection: (sel) => this.selectionner(sel),
      vue: (v) => this.definirVue(v),
      ouvrir: (e) => this.ouvrir(e),
      centrer: (i) => this.centrer(i),
    };
    this.hud = new Hud(racineUi, actions);
    this.hud.visible(false);
    this.ecrans = new Ecrans(racineUi);
    this.elIps = document.createElement('div');
    this.elIps.className = 'ips';
    racineUi.appendChild(this.elIps);
    this.brancherEntrees();
  }

  /* ================================================================ démarrage */

  async demarrer(surProgres: (p: number) => void) {
    try {
      const txt = await this.store.read('reglages');
      if (txt) {
        const r = JSON.parse(txt);
        this.reglages = { ...structuredClone(REGLAGES_DEFAUT), ...r, volumes: { ...REGLAGES_DEFAUT.volumes, ...(r.volumes ?? {}) } };
      }
    } catch {
      /* réglages par défaut */
    }
    try {
      this.version = (await window.seguiaBridge?.app.version()) ?? this.version;
    } catch {
      /* navigateur */
    }
    await this.rendu.chargerModeles((fait, total) => surProgres(0.1 + (0.8 * fait) / Math.max(1, total)));
    this.vignettes = genererVignettes(this.rendu.modeles);
    surProgres(1);
    this.rendu.definirQualite(this.reglages.qualite);
    this.audio.reglerVolumes(this.reglages.volumes);
    this.installerDecorMenu();
    document.addEventListener('visibilitychange', () => (document.hidden ? this.audio.suspendre() : this.audio.reprendre()));
    window.addEventListener('resize', () => this.rendu.redimensionner());
    // fermer la fenêtre enregistre la partie en cours
    window.seguiaBridge?.app.onAvantFermeture?.(() => {
      const fin = () => window.seguiaBridge?.app.fermetureOk?.();
      if (this.enJeu) void this.sauver('auto', true).then(fin, fin);
      else fin();
    });
    requestAnimationFrame((t) => this.image(t));
    await this.ecranPrincipal();
    this.installerCrochetsDeTest();
  }

  /** Une petite oasis qui vit derrière le menu principal. */
  private installerDecorMenu() {
    const s = creerPartie(GRAINE_SCENARIO);
    s.res.pieces = 9999;
    s.res.materiaux = 9999;
    s.res.vivres = 400;
    s.progression.palier = 3;
    s.progression.vocation = 'etape';
    const sx = s.carte.sourceCase % N;
    const sz = Math.floor(s.carte.sourceCase / N);
    const ligne = (x0: number, z0: number, x1: number, z1: number) => {
      const r: number[] = [];
      let x = x0;
      let z = z0;
      r.push(z * N + x);
      while (x !== x1) {
        x += x1 > x ? 1 : -1;
        r.push(z * N + x);
      }
      while (z !== z1) {
        z += z1 > z ? 1 : -1;
        r.push(z * N + x);
      }
      return r;
    };
    let zPiste = 0;
    for (const i of s.carte.piste) if (Math.abs((i % N) - sx) <= 1) zPiste = Math.max(zPiste, Math.floor(i / N));
    const fin = zPiste - 2;
    appliquer(s, { t: 'canal', cases: ligne(sx, sz, sx, fin), type: 2 });
    appliquer(s, { t: 'canal', cases: ligne(sx, sz + 2, sx + 9, sz + 2), type: 1 });
    appliquer(s, { t: 'canal', cases: ligne(sx, sz + 7, sx - 6, sz + 7), type: 1 });
    const poser = (kind: Parameters<typeof verifierConstruction>[1], x: number, z: number, rot: Dir = 0) => {
      for (let r = 0; r < 4; r++) {
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (verifierConstruction(s, kind, x + dx, z + dz, rot).ok) {
              const res = appliquer(s, { t: 'construire', kind, x: x + dx, z: z + dz, rot });
              if (res.ok) {
                const b = batimentParId(s, res.id!)!;
                b.chantier = 1;
                return b;
              }
            }
          }
      }
      return null;
    };
    for (let k = 0; k < 4; k++) {
      const pa = poser(k % 2 ? 'jardin' : 'palmeraie', sx + 1 + k * 2, sz + 3);
      if (pa && pa.kind === 'palmeraie') pa.croissance = 1;
      const pb = poser(k % 2 ? 'palmeraie' : 'jardin', sx + 1 + k * 2, sz);
      if (pb && pb.kind === 'palmeraie') pb.croissance = 0.9;
      if (pa && pa.kind === 'jardin') pa.croissance = 0.6;
      if (pb && pb.kind === 'jardin') pb.croissance = 0.3;
    }
    poser('repartiteur', sx, sz + 2);
    poser('fontaine', sx + 1, sz + 6);
    poser('fontaine', sx - 1, sz + 9);
    for (let k = 0; k < 6; k++) {
      const m = poser('maison', sx + 2 + (k % 3) * 3, sz + 7 + Math.floor(k / 3) * 3);
      if (m) m.habitants = 4;
    }
    for (let k = 0; k < 3; k++) {
      const pj = poser(k === 1 ? 'palmeraie' : 'jardin', sx - 2 - k * 2, sz + 8);
      if (pj && pj.kind === 'palmeraie') pj.croissance = 1;
    }
    poser('bassin', sx + 1, fin - 1);
    poser('caravanserail', sx + 4, fin - 3);
    poser('citerne', sx - 2, fin - 4);
    s.pas = PAS_PAR_JOUR * 2 + 300; // fin d'après-midi
    cacheDe(s).topoSale = true;
    for (let k = 0; k < 500; k++) avancer(s);
    s.journal.length = 0;
    this.s = s;
    this.rendu.installer(s, cacheDe(s));
    this.rendu.rig.definir({ x: sx - DEMI + 2, z: sz - DEMI + 6, distance: 40, azimut: 0.7, inclinaison: -0.02 }, true);
  }

  /* ============================================================ boucle d'image */

  /** boucle figée : seules les images demandées par le crochet de test sont calculées (captures vidéo) */
  private fige = false;
  /** tests seulement : le temps de jeu ne s'écoule que par le crochet `avancer` (rejeu exact d'un journal de commandes) */
  tempsGele = false;

  private image(t: number) {
    const dt = Math.min(0.1, Math.max(0, (t - this.dernierTemps) / 1000));
    this.dernierTemps = t;
    if (!this.fige) this.uneImage(dt);
    requestAnimationFrame((tt) => this.image(tt));
  }

  private uneImage(dt: number) {
    const modal = this.ecrans.ouvert;
    if (this.enJeu) {
      if (!modal && this.vitesse > 0 && !this.tempsGele) {
        this.acc += dt * this.vitesse;
        let n = 0;
        while (this.acc >= 0.1 && n < 40) {
          this.pas();
          this.acc -= 0.1;
          n++;
          if (this.ecrans.ouvert) break; // un palier vient d'ouvrir un écran
        }
        if (n >= 40) this.acc = 0;
      }
      this.clavierCamera(dt);
      this.majApercu();
    } else {
      // vitrine du menu : le temps passe doucement, la caméra tourne
      this.acc += dt;
      let n = 0;
      while (this.acc >= 0.1 && n < 4) {
        avancer(this.s);
        // la vitrine reste en fin de journée
        if (this.s.pas % PAS_PAR_JOUR > 400) this.s.pas -= 140;
        this.acc -= 0.1;
        n++;
      }
      this.rendu.rig.tourner(dt * 0.035, 0);
    }
    const c = cacheDe(this.s);
    this.rendu.vitesseJeu = this.enJeu ? (modal ? 0 : this.vitesse) : 1;
    this.rendu.maj(this.s, c, dt);
    this.rendu.rendre();
    if (this.enJeu) {
      this.chronoHud -= dt;
      if (this.chronoHud <= 0) {
        this.chronoHud = 0.16;
        this.hud.maj(this.etat());
        this.surveillerObjectifs();
      }
      this.majEtiquettes();
      this.chronoSurcouche -= dt;
      if (this.chronoSurcouche <= 0) {
        this.chronoSurcouche = 0.45;
        this.majSurcouche();
      }
    }
    this.majAudio(dt);
    this.surveillerFluidite(dt);
  }

  /** Un pas de simulation et ses conséquences visibles. */
  private pas() {
    const r = avancer(this.s);
    for (const e of r.evenements) this.surEvenement(e);
    if (this.s.pas % PAS_PAR_JOUR === 0) void this.sauver('auto', true);
  }

  private etat(): EtatJeu {
    return {
      s: this.s,
      c: cacheDe(this.s),
      vitesse: this.vitesse,
      outil: this.outil,
      selection: this.selection,
      vue: this.vue,
      ips: this.rendu.ips,
      reglages: this.reglages,
      vignettes: this.vignettes,
    };
  }

  private surveillerFluidite(dt: number) {
    this.chronoIps -= dt;
    if (this.chronoIps <= 0) {
      this.chronoIps = 0.5;
      this.elIps.textContent = this.reglages.afficherIps ? `${Math.round(this.rendu.ips)} images/s` : '';
    }
    // si le jeu rame durablement, proposer une fois le réglage léger
    if (this.enJeu && !this.conseilQualiteDonne && this.reglages.qualite !== 'leger' && !isTestMode()) {
      if (this.rendu.ips < 24) this.lentDepuis += dt;
      else this.lentDepuis = Math.max(0, this.lentDepuis - dt * 2);
      if (this.lentDepuis > 8) {
        this.conseilQualiteDonne = true;
        this.hud.toast('L’affichage est lent sur cet ordinateur.', 'alerte', 'Menu → Réglages → Image → « Léger » le rendra plus fluide.');
      }
    }
  }

  /* ================================================================ événements */

  private son(effet: NomEffet, intensite = 1, intervalleMin = 0) {
    const t = performance.now();
    if (intervalleMin && t - (this.dernierSon[effet] ?? 0) < intervalleMin) return;
    this.dernierSon[effet] = t;
    this.audio.jouer(effet, intensite);
  }

  private flotterCase(caseI: number, texte: string, ton: 'bien' | 'alerte' | '' = '') {
    if (caseI < 0) return;
    const p = this.rendu.ecranCase(caseI, 0.9);
    if (p.devant) this.hud.flotter(p.x, p.y, texte, ton);
  }

  private surEvenement(e: Evenement) {
    switch (e.type) {
      case 'recolte':
        this.flotterCase(e.caseI, e.texte, 'bien');
        this.son('recolte', 0.7, 250);
        break;
      case 'jardin_perdu':
      case 'palmier_perdu':
        this.flotterCase(e.caseI, 'Perdu', 'alerte');
        this.hud.toast(e.texte, 'alerte', 'Sélectionnez la parcelle pour voir la cause et le remède.');
        this.son('alerte', 0.7, 4000);
        break;
      case 'chantier_fini':
        this.flotterCase(e.caseI, e.texte);
        this.son('chantier_fini', 0.8, 300);
        break;
      case 'caravane_annoncee':
        this.hud.toast(e.texte, 'info', 'Regardez le niveau de vos bassins dans le panneau de gauche.');
        break;
      case 'caravane_arrivee':
        this.son('caravane');
        break;
      case 'caravane_passe':
        this.hud.toast(e.texte, 'alerte', 'Il faut au moins un quart de sa soif dans les bassins à son arrivée.');
        this.son('alerte', 0.6);
        break;
      case 'caravane_payee':
        this.flotterCase(e.caseI, `+${e.valeur} pièces`, 'bien');
        this.hud.toast(e.texte, e.texte.includes('mal') ? 'alerte' : 'bien');
        this.son('pieces');
        break;
      case 'caravane_depart':
        this.hud.toast(e.texte, 'info');
        break;
      case 'colons':
        this.hud.toast(e.texte + '.', 'bien');
        this.son('habitant');
        break;
      case 'habitant_arrive':
        this.son('habitant', 0.5, 1500);
        break;
      case 'habitant_parti':
        this.flotterCase(e.caseI, '−1 habitant', 'alerte');
        break;
      case 'famine':
        this.hud.toast(e.texte, 'alerte', 'Plantez des jardins, ou achetez des vivres à une caravane à l’étape.');
        this.son('alerte');
        break;
      case 'tempete_annoncee':
        this.hud.toast(e.texte, 'alerte', 'Plantez des brise-vent du côté du vent (vue du vent : touche B).');
        this.son('alerte');
        break;
      case 'canicule_annoncee':
        this.hud.toast(e.texte, 'alerte', 'Remplissez les citernes et protégez les palmeraies.');
        this.son('alerte');
        break;
      case 'tempete_fin':
        this.hud.toast(e.texte, e.valeur > 0 ? 'alerte' : 'bien', e.valeur > 0 ? 'Les bras libres curent. La corvée générale va plus vite.' : '');
        break;
      case 'canicule_fin':
      case 'foggara_finie':
        this.hud.toast(e.texte, 'bien');
        break;
      case 'cloture_detruite':
        this.hud.toast(e.texte + '.', 'alerte');
        break;
      case 'saison':
        this.hud.toast(e.texte, 'info', e.valeur === 1 ? 'La source baisse, tout a plus soif.' : e.valeur === 2 ? 'Les tempêtes de sable arrivent.' : 'La source retrouve son débit.');
        break;
      case 'palier':
        this.son('palier');
        this.ecrans.afficher('palier', htmlPalier(), { retour: () => this.ecrans.fermer() }, () => this.ecrans.fermer());
        break;
      case 'choix_vocation':
        this.son('palier');
        this.ecranVocation();
        break;
      case 'victoire':
        this.son('victoire');
        void this.sauver('auto', true);
        this.ecrans.afficher(
          'victoire',
          htmlVictoire(this.s, e.valeur),
          { retour: () => this.ecrans.fermer(), principal: () => void this.retourMenu() },
          () => this.ecrans.fermer(),
          false,
          true,
        );
        break;
    }
  }

  /** Choix de la vocation : écran sans échappatoire, la partie ne reprend qu'après le choix. */
  private ecranVocation() {
    this.ecrans.afficher(
      'vocation',
      htmlVocation(),
      {
        vocation: ([v]) => {
          this.commande({ t: 'vocation', v: v as 'etape' | 'grenier' });
          this.ecrans.fermer();
        },
      },
      null,
      false,
      true,
    );
  }

  private surveillerObjectifs() {
    const obj = objectifs(this.s);
    const sig = this.s.progression.palier + ':' + obj.map((o) => (o.fait ? 1 : 0)).join('');
    if (this.dernierObjectifs && sig !== this.dernierObjectifs && sig.split(':')[0] === this.dernierObjectifs.split(':')[0]) {
      const avant = this.dernierObjectifs.split(':')[1];
      obj.forEach((o, k) => {
        if (o.fait && avant[k] === '0') {
          this.hud.toast('Objectif atteint : ' + o.texte, 'bien');
          this.son('objectif', 1, 500);
        }
      });
    }
    this.dernierObjectifs = sig;
    // première arrivée de l'eau sur une parcelle
    for (const b of this.s.batiments) {
      if ((b.kind === 'jardin' || b.kind === 'palmeraie') && b.chantier >= 1 && b.eauRatio >= 0.8 && !this.irrigues.has(b.id)) {
        this.irrigues.add(b.id);
        this.flotterCase(b.z * N + b.x, 'L’eau arrive', 'bien');
        this.son('eau_arrive', 0.8, 600);
      }
    }
  }

  /* ================================================================= commandes */

  commande(cmd: Commande): Resultat {
    const r = appliquer(this.s, cmd);
    if (!r.ok) {
      this.hud.toast(r.cause, 'refus', r.suggestion);
      this.son('refus', 1, 150);
      return r;
    }
    switch (cmd.t) {
      case 'construire':
        this.son('poser');
        if (r.message) this.hud.toast(r.message, 'alerte');
        break;
      case 'canal':
      case 'cloture':
        if (r.message) this.hud.toast(r.message, 'alerte');
        break;
      case 'demolir':
      case 'effacer':
        this.son('demolir', 0.8);
        break;
      case 'annuler':
        this.son('annuler');
        if (r.message) this.hud.toast(r.message, 'info');
        break;
      case 'acheterVivres':
        this.son('pieces', 0.6);
        if (r.message) this.hud.toast(r.message, 'bien');
        break;
      default:
        this.son('clic', 0.8);
    }
    if (this.selection?.t === 'batiment' && !batimentParId(this.s, this.selection.id)) this.selection = null;
    this.chronoHud = 0;
    return r;
  }

  definirOutil(o: Outil) {
    this.outil = o;
    this.trace = [];
    this.chronoSurcouche = 0;
    this.chronoHud = 0;
    if (o.t !== 'selection') this.selection = null;
    this.son('clic', 0.6);
    this.canvas.style.cursor = o.t === 'selection' ? 'default' : 'crosshair';
  }

  definirVitesse(v: number) {
    if (v === 0) {
      this.basculerPause();
      return;
    }
    this.vitesse = v;
    this.vitesseAvantPause = v;
    this.son('clic', 0.6);
    this.chronoHud = 0;
  }

  basculerPause() {
    if (this.vitesse === 0) this.vitesse = this.vitesseAvantPause || 1;
    else {
      this.vitesseAvantPause = this.vitesse;
      this.vitesse = 0;
    }
    this.son('clic', 0.6);
    this.chronoHud = 0;
  }

  selectionner(sel: Selection) {
    this.selection = sel;
    this.chronoHud = 0;
  }

  definirVue(v: VueInfo) {
    this.vue = v;
    this.chronoSurcouche = 0;
    this.chronoHud = 0;
    this.son('clic', 0.6);
  }

  centrer(caseI: number) {
    this.rendu.rig.definir({ x: (caseI % N) + 0.5 - DEMI, z: Math.floor(caseI / N) + 0.5 - DEMI });
  }

  /* ============================================================= entrées joueur */

  private brancherEntrees() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerenter', () => (this.dansCanvas = true));
    cv.addEventListener('pointerleave', () => {
      this.dansCanvas = false;
      this.hud.bulleCurseur(0, 0, '');
    });
    cv.addEventListener('pointerdown', (e) => {
      void this.audio.demarrer();
      if (!this.enJeu || this.ecrans.ouvert) return;
      this.px = e.clientX;
      this.py = e.clientY;
      cv.setPointerCapture(e.pointerId);
      const g: Geste = { type: 'gauche', x0: e.clientX, y0: e.clientY, bouge: false };
      if (e.button === 1) g.type = 'pan';
      else if (e.button === 2) g.type = 'tourne';
      else if (e.button === 0) {
        const o = this.outil;
        if (o.t === 'canal' || o.t === 'cloture' || o.t === 'effacer') {
          g.type = 'trace';
          const i = this.rendu.caseSous(e.clientX, e.clientY);
          this.trace = i >= 0 ? [i] : [];
        } else if (o.t === 'batiment') {
          this.poserBatiment();
          return;
        }
      } else return;
      this.geste = g;
    });
    cv.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this.px;
      const dy = e.clientY - this.py;
      this.px = e.clientX;
      this.py = e.clientY;
      const g = this.geste;
      if (!g) return;
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 5) g.bouge = true;
      const rig = this.rendu.rig;
      if (g.type === 'pan' || (g.type === 'gauche' && g.bouge)) {
        const k = rig.distanceCourante * 0.00135;
        rig.deplacer(-dx * k, dy * k * 1.35);
      } else if (g.type === 'tourne') {
        if (g.bouge) rig.tourner(-dx * 0.0055, dy * 0.0035);
      } else if (g.type === 'trace') {
        this.etendreTrace(this.rendu.caseSous(e.clientX, e.clientY));
      }
    });
    const fin = (e: PointerEvent) => {
      const g = this.geste;
      this.geste = null;
      if (!g) return;
      if (g.type === 'trace') {
        this.validerTrace();
      } else if (g.type === 'gauche' && !g.bouge) {
        this.cliquerSelection(e.clientX, e.clientY);
      } else if (g.type === 'tourne' && !g.bouge) {
        // clic droit : annuler l'outil ou la sélection
        if (this.outil.t !== 'selection') this.definirOutil({ t: 'selection' });
        else this.selectionner(null);
      }
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', () => {
      this.geste = null;
      this.trace = [];
    });
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.ecrans.ouvert) return;
        const f = Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.0014)));
        const p = this.enJeu ? this.rendu.pointSol(e.clientX, e.clientY, this.rendu.rig.pointVise.y) : null;
        this.rendu.rig.zoomer(f, p ?? undefined);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => this.surTouche(e));
    window.addEventListener('keyup', (e) => this.touches.delete(e.code));
    window.addEventListener('blur', () => this.touches.clear());
  }

  private surTouche(e: KeyboardEvent) {
    void this.audio.demarrer();
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.ecrans.echap()) return;
      if (!this.enJeu) return;
      if (this.geste?.type === 'trace') {
        this.geste = null;
        this.trace = [];
        return;
      }
      if (this.outil.t !== 'selection') this.definirOutil({ t: 'selection' });
      else if (this.selection) this.selectionner(null);
      else this.ouvrir('menu');
      return;
    }
    if (!this.enJeu || this.ecrans.ouvert) return;
    this.touches.add(e.code);
    if (e.ctrlKey && e.code === 'KeyW') {
      // Ctrl+Z sur clavier AZERTY (touche physique W) et QWERTY (KeyZ) : on accepte les deux
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      this.commande({ t: 'annuler' });
      return;
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.basculerPause();
        break;
      case 'Digit1':
      case 'Numpad1':
        this.definirVitesse(1);
        break;
      case 'Digit2':
      case 'Numpad2':
        this.definirVitesse(2);
        break;
      case 'Digit3':
      case 'Numpad3':
        this.definirVitesse(4);
        break;
      case 'KeyR':
        if (this.outil.t === 'batiment') {
          this.outil = { ...this.outil, rot: ((this.outil.rot + 1) % 4) as Dir };
          this.son('clic', 0.5);
        }
        break;
      case 'KeyX':
        this.definirOutil({ t: 'effacer' });
        break;
      case 'KeyV':
        this.definirVue(this.vue === 'eau' ? null : 'eau');
        break;
      case 'KeyB':
        this.definirVue(this.vue === 'vent' ? null : 'vent');
        break;
      case 'KeyH':
        this.ouvrir('aide');
        break;
      case 'Delete':
        if (this.selection?.t === 'batiment') {
          this.commande({ t: 'demolir', id: this.selection.id });
          this.selectionner(null);
        } else if (this.selection?.t === 'case') {
          this.commande({ t: 'effacer', cases: [this.selection.i] });
          this.selectionner(null);
        }
        break;
      case 'F5':
        e.preventDefault();
        void this.sauver('manuel1');
        break;
      case 'F9':
        e.preventDefault();
        void this.chargerEmplacement('manuel1');
        break;
      case 'Home':
        this.rendu.rig.definir({ x: 0, z: 0, distance: 58, inclinaison: 0 });
        break;
    }
  }

  private clavierCamera(dt: number) {
    const t = this.touches;
    if (t.size === 0 || this.ecrans.ouvert) return;
    const rig = this.rendu.rig;
    const v = rig.distanceCourante * 0.9 * dt;
    let droite = 0;
    let avant = 0;
    if (t.has('KeyW') || t.has('ArrowUp')) avant += 1;
    if (t.has('KeyS') || t.has('ArrowDown')) avant -= 1;
    if (t.has('KeyD') || t.has('ArrowRight')) droite += 1;
    if (t.has('KeyA') || t.has('ArrowLeft')) droite -= 1;
    if (droite || avant) rig.deplacer(droite * v, avant * v);
    if (t.has('KeyQ')) rig.tourner(dt * 1.4, 0);
    if (t.has('KeyE')) rig.tourner(-dt * 1.4, 0);
    if (t.has('NumpadAdd') || t.has('Equal') || t.has('PageUp')) rig.zoomer(Math.exp(-dt * 1.6));
    if (t.has('NumpadSubtract') || t.has('Minus') || t.has('PageDown')) rig.zoomer(Math.exp(dt * 1.6));
  }

  /* ----------------------------------------------------------- construction */

  /** Coin nord-ouest de l'emprise quand le curseur est sur la case i. */
  private ancrage(i: number, w: number, d: number): { x: number; z: number } {
    const tx = i % N;
    const tz = Math.floor(i / N);
    return {
      x: Math.max(0, Math.min(N - w, tx - Math.floor((w - 1) / 2))),
      z: Math.max(0, Math.min(N - d, tz - Math.floor((d - 1) / 2))),
    };
  }

  private poserBatiment() {
    const o = this.outil;
    if (o.t !== 'batiment') return;
    const i = this.rendu.caseSous(this.px, this.py);
    if (i < 0) return;
    const def = BATIMENTS[o.kind];
    const tourne = o.rot === 1 || o.rot === 3;
    const a = this.ancrage(i, tourne ? def.d : def.w, tourne ? def.w : def.d);
    this.commande({ t: 'construire', kind: o.kind, x: a.x, z: a.z, rot: o.rot });
  }

  private etendreTrace(i: number) {
    if (i < 0 || !this.trace.length) {
      if (i >= 0) this.trace = [i];
      return;
    }
    let dernier = this.trace[this.trace.length - 1];
    if (dernier === i) return;
    // retour en arrière : on raccourcit le tracé
    const deja = this.trace.indexOf(i);
    if (deja >= 0) {
      this.trace.length = deja + 1;
      return;
    }
    let x = dernier % N;
    let z = Math.floor(dernier / N);
    const tx = i % N;
    const tz = Math.floor(i / N);
    let garde = 0;
    while ((x !== tx || z !== tz) && garde++ < 200) {
      // avancer d'abord sur l'axe où l'écart est le plus grand
      if (Math.abs(tx - x) >= Math.abs(tz - z)) x += tx > x ? 1 : -1;
      else z += tz > z ? 1 : -1;
      dernier = z * N + x;
      if (!this.trace.includes(dernier)) {
        this.trace.push(dernier);
        if (this.outil.t === 'canal') this.son('canal', 0.7);
      }
    }
  }

  private validerTrace() {
    const cases = this.trace;
    this.trace = [];
    if (!cases.length) return;
    const o = this.outil;
    if (o.t === 'canal') this.commande({ t: 'canal', cases, type: o.type });
    else if (o.t === 'cloture') this.commande({ t: 'cloture', cases, type: o.type });
    else if (o.t === 'effacer') {
      const utiles = cases.filter((i) => this.s.canal[i] || this.s.cloture[i]);
      if (utiles.length) this.commande({ t: 'effacer', cases: utiles });
      else {
        // un clic sur un bâtiment avec la gomme : le sélectionner plutôt que de ne rien faire
        const id = cacheDe(this.s).occ[cases[0]];
        if (id) {
          this.definirOutil({ t: 'selection' });
          this.selectionner({ t: 'batiment', id });
          this.hud.toast('Pour démolir un bâtiment, utilisez le bouton « Démolir » de sa fiche.', 'info');
        }
      }
    }
  }

  private cliquerSelection(x: number, y: number) {
    const i = this.rendu.caseSous(x, y);
    if (i < 0) {
      this.selectionner(null);
      return;
    }
    const id = cacheDe(this.s).occ[i];
    if (id) {
      this.selectionner({ t: 'batiment', id });
      this.son('clic', 0.6);
    } else if (this.s.canal[i] || this.s.cloture[i]) {
      this.selectionner({ t: 'case', i });
      this.son('clic', 0.6);
    } else this.selectionner(null);
  }

  /** Aperçu de construction sous le curseur : cases colorées, fantôme, message de cause. */
  private majApercu() {
    const ap = this.rendu.apercu;
    const s = this.s;
    const carte = s.carte;
    const o = this.outil;
    const cases: [number, number][] = [];
    let message = '';
    let detail = '';
    let ton: '' | 'refus' | 'alerte' = '';
    let fantome = '';
    let fx = 0;
    let fz = 0;
    let fw = 0;
    let fd = 0;
    let frot = 0;
    let fok = true;
    const camera = this.geste && (this.geste.type === 'pan' || this.geste.type === 'tourne' || (this.geste.type === 'gauche' && this.geste.bouge));
    const i = this.dansCanvas && !camera && !this.ecrans.ouvert ? this.rendu.caseSous(this.px, this.py) : -1;
    if (o.t === 'batiment' && i >= 0) {
      const def = BATIMENTS[o.kind];
      const tourne = o.rot === 1 || o.rot === 3;
      const w = tourne ? def.d : def.w;
      const d = tourne ? def.w : def.d;
      const a = this.ancrage(i, w, d);
      const v = verifierConstruction(s, o.kind, a.x, a.z, o.rot);
      const teinte = !v.ok ? TEINTE.refus : v.avertissement ? TEINTE.alerte : TEINTE.ok;
      for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) cases.push([(a.z + dz) * N + a.x + dx, teinte]);
      if (!v.ok) {
        message = v.cause;
        detail = v.suggestion;
        ton = 'refus';
      } else if (v.avertissement) {
        message = v.avertissement;
        ton = 'alerte';
      } else if (def.w !== def.d) {
        message = 'R : tourner';
      }
      fantome = o.kind === 'maison' ? 'maison_a' : o.kind;
      fx = a.x;
      fz = a.z;
      fw = w;
      fd = d;
      frot = o.rot;
      fok = v.ok;
    } else if (o.t === 'canal' || o.t === 'cloture') {
      const liste = this.trace.length ? this.trace : i >= 0 ? [i] : [];
      let pieces = 0;
      let materiaux = 0;
      let utiles = 0;
      let refus: Resultat | null = null;
      let monte = false;
      let precedent = -1;
      for (const k of liste) {
        const r = o.t === 'canal' ? verifierCanal(s, k, o.type) : verifierCloture(s, k, o.type);
        if (!r.ok) {
          cases.push([k, TEINTE.refus]);
          if (!refus) refus = r;
        } else {
          let teinte = o.t === 'canal' ? TEINTE.eau : TEINTE.ok;
          if (o.t === 'canal') {
            const cout = coutCanal(s, k, o.type);
            if (cout.pieces || cout.materiaux) utiles++;
            pieces += cout.pieces;
            materiaux += cout.materiaux;
            if (precedent >= 0 && carte.elev[k] > carte.elev[precedent]) {
              monte = true;
              teinte = TEINTE.alerte;
            }
          } else if (s.cloture[k] !== o.type || s.clotureEtat[k] < 0.999) {
            utiles++;
            pieces += o.type === 1 ? B.coutCloture : B.coutHaie;
          }
          cases.push([k, teinte]);
        }
        precedent = k;
      }
      if (this.trace.length > 1 || utiles > 0) {
        message = `${utiles} case${utiles > 1 ? 's' : ''} · ${pieces} pièce${pieces > 1 ? 's' : ''}${materiaux ? ` · ${materiaux} matériaux` : ''}`;
        if (pieces > s.res.pieces || materiaux > s.res.materiaux) {
          detail = 'Pas assez de ressources : le tracé s’arrêtera en route.';
          ton = 'alerte';
        }
      }
      if (monte) {
        detail = 'Attention : le tracé remonte une terrasse, l’eau ne suivra pas.';
        ton = 'alerte';
      } else if (o.t === 'canal' && liste.length && !refus) {
        // le tracé touche-t-il une séguia où l'eau arrive ?
        const c = cacheDe(s);
        let relie = false;
        for (const k of liste) {
          if (c.rang[k] >= 0) relie = true;
          const kx = k % N;
          const kz = Math.floor(k / N);
          for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = kx + dx;
            const nz = kz + dz;
            if (nx >= 0 && nz >= 0 && nx < N && nz < N && c.rang[nz * N + nx] >= 0) relie = true;
          }
          if (relie) break;
        }
        if (!relie) {
          if (!message) message = 'Séguia isolée';
          detail = 'Ce tracé ne touche aucune séguia en eau : partez de la sortie de la source ou d’un canal existant.';
          ton = 'alerte';
        }
      }
      if (refus && !refus.ok && (liste.length === 1 || !message)) {
        message = refus.cause;
        detail = refus.suggestion;
        ton = 'refus';
      }
    } else if (o.t === 'effacer') {
      const liste = this.trace.length ? this.trace : i >= 0 ? [i] : [];
      for (const k of liste) cases.push([k, s.canal[k] || s.cloture[k] ? TEINTE.gomme : TEINTE.neutre]);
    }
    if (s.progression.palier === 0 && this.trace.length === 0) {
      let nbCanal = 0;
      for (let k = 0; k < NN && nbCanal < 4; k++) if (s.canal[k]) nbCanal++;
      if (nbCanal < 4 && !cases.some(([k]) => k === carte.sourceCase)) cases.push([carte.sourceCase, TEINTE.eau]);
    }
    ap.cases(cases, carte);
    ap.fantome(fantome, fx, fz, fw, fd, frot, fok, carte);
    // cadre de sélection
    const sel = this.selection;
    if (sel?.t === 'batiment') {
      const b = batimentParId(s, sel.id);
      if (b) ap.selection(b.x, b.z, b.w, b.d, carte);
      else ap.selection(0, 0, 0, 0, null);
    } else if (sel?.t === 'case') ap.selection(sel.i % N, Math.floor(sel.i / N), 1, 1, carte);
    else ap.selection(0, 0, 0, 0, null);
    this.hud.bulleCurseur(this.px, this.py, this.dansCanvas ? message : '', ton, detail);
  }

  /** Surcouche d'information posée sur le sol : vent, eau, eau potable, distance à la piste. */
  private majSurcouche() {
    const terrain = this.rendu.terrain;
    if (!terrain) return;
    const s = this.s;
    const c = cacheDe(s);
    const o = this.outil;
    const v = new Float32Array(NN).fill(-1);
    const { sol } = s.carte;
    const constructible = (i: number) => sol[i] === Sol.Sable || sol[i] === Sol.Reg;
    if (this.vue === 'vent' || o.t === 'cloture') {
      const prochaine = s.meteo.find((m) => m.type === 'tempete' && s.pas < m.finPas);
      const dir = prochaine ? prochaine.dir : s.carte.ventDominant;
      const expo = expositionApercu(s, dir);
      for (let i = 0; i < NN; i++) if (sol[i] !== Sol.Roche && sol[i] !== Sol.Dune) v[i] = expo[i] >= 1 ? 1 : 0;
      terrain.surcouche(v, 0x3f9d5a, 0xd0503a);
    } else if (this.vue === 'eau') {
      for (let i = 0; i < NN; i++) if (s.canal[i]) v[i] = c.rang[i] >= 0 && c.debit[i] > 0.3 ? 0 : 1;
      for (const b of s.batiments) {
        const def = BATIMENTS[b.kind];
        if (!def.branche || b.kind === 'puits' || b.chantier < 1) continue;
        const r = b.pause ? 1 : 1 - Math.min(1, b.eauRatio);
        for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) v[(b.z + dz) * N + b.x + dx] = r;
      }
      terrain.surcouche(v, 0x2f9e8f, 0xd0503a);
    } else if (o.t === 'batiment' && (o.kind === 'maison' || o.kind === 'fontaine')) {
      for (let i = 0; i < NN; i++) {
        if (!constructible(i)) continue;
        if (aEauPotable(s, (i % N) + 0.5, Math.floor(i / N) + 0.5)) v[i] = 0;
      }
      terrain.surcouche(v, 0x3f9d5a, 0xd0503a);
    } else if (o.t === 'batiment' && BATIMENTS[o.kind].presPiste > 0) {
      const max = BATIMENTS[o.kind].presPiste;
      for (let i = 0; i < NN; i++) if (constructible(i) && distancePiste(s, i) <= max) v[i] = 0;
      terrain.surcouche(v, 0x3f9d5a, 0xd0503a);
    } else terrain.surcouche(null);
  }

  /** Pictogrammes au-dessus des bâtiments qui ont un problème. */
  private majEtiquettes() {
    const s = this.s;
    const c = cacheDe(s);
    const points: { id: number; x: number; y: number; niveau: string; icone: string }[] = [];
    const proche = this.rendu.rig.distanceCourante < 70;
    if (proche) {
      for (const b of s.batiments) {
        const st = statutDe(s, c, b);
        if (st.niveau === 'ok' || !st.icone) continue;
        if (st.niveau === 'chantier' && b.kind !== 'jardin' && b.kind !== 'palmeraie' && this.rendu.rig.distanceCourante > 40) continue;
        const p = this.rendu.ecran(b.x + b.w / 2 - DEMI, s.carte.elev[b.z * N + b.x] * 0.45 + (b.kind === 'jardin' || b.kind === 'palmeraie' ? 0.5 : 1.5), b.z + b.d / 2 - DEMI);
        if (!p.devant || p.y < 50) continue;
        points.push({ id: b.id, x: p.x, y: p.y, niveau: st.niveau, icone: st.icone });
      }
    }
    this.hud.majEtiquettes(points);
  }

  private majAudio(dt: number) {
    const s = this.s;
    const c = cacheDe(s);
    const cal = calendrier(s.pas);
    const tp = tempeteEnCours(s);
    const rig = this.rendu.rig;
    const prox = rig.proximite;
    const cx = Math.round(rig.pointVise.x + DEMI);
    const cz = Math.round(rig.pointVise.z + DEMI);
    let eau = 0;
    let vert = 0;
    const r = 5;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const i = z * N + x;
        const poids = 1 - Math.hypot(dx, dz) / (r * 1.5);
        if (poids <= 0) continue;
        if (c.debit[i] > 0.5) eau += poids * Math.min(1, c.debit[i] / 40);
        if (s.humidite[i] > 0.45) vert += poids;
      }
    }
    this.audio.maj(
      {
        saison: cal.saison,
        lumiere: cal.lumiere,
        tempete: tp ? tp.intensite : 0,
        canicule: canicule(s),
        proximite: prox,
        eauProche: Math.min(1, eau / 6),
        verdureProche: Math.min(1, vert / 30),
        vieProche: this.rendu.agents.viePres(rig.pointVise.x, rig.pointVise.z, 7),
        caravane: s.caravanes.some((k) => k.phase === 'abreuvage' || k.phase === 'commerce'),
        pause: this.enJeu && (this.vitesse === 0 || this.ecrans.ouvert),
        vitesse: Math.max(1, this.vitesse),
      },
      dt,
    );
  }

  /* ============================================================== sauvegardes */

  async sauver(slot: string, silencieux = false): Promise<boolean> {
    if (!this.enJeu) return false;
    try {
      const texte = serialiser(this.s, { vitesse: this.vitesse || this.vitesseAvantPause, camera: this.rendu.rig.vue() }, new Date().toISOString());
      await this.store.write(slot, texte);
      if (!silencieux) {
        this.hud.toast('Partie sauvegardée.', 'bien');
        this.son('objectif', 0.5);
      }
      return true;
    } catch (err) {
      this.hud.toast('La sauvegarde a échoué.', 'alerte', (err as Error).message);
      return false;
    }
  }

  /** Charge un emplacement. En cas de fichier illisible : message clair et proposition de la copie de secours. */
  async chargerEmplacement(slot: string, copie = false): Promise<boolean> {
    let texte: string | null = null;
    try {
      texte = copie ? await this.store.readBackup(slot) : await this.store.read(slot);
    } catch (err) {
      texte = null;
      console.warn(err);
    }
    const infos = (await this.store.list().catch(() => [])).find((l) => l.slot === slot);
    const aCopie = !copie && !!infos?.hasBackup;
    const echec = (message: string) => {
      this.ecrans.afficher(
        'erreur',
        htmlErreur('Chargement impossible', message, aCopie),
        {
          retour: () => {
            this.ecrans.fermer();
            if (!this.enJeu) void this.ecranPrincipal();
          },
          copie: () => {
            this.ecrans.fermer();
            void this.chargerEmplacement(slot, true);
          },
        },
        () => {
          this.ecrans.fermer();
          if (!this.enJeu) void this.ecranPrincipal();
        },
      );
      return false;
    };
    if (texte === null) return echec('Cet emplacement est vide ou son fichier a disparu.');
    const r = deserialiser(texte);
    if (!r.ok) return echec(r.erreur);
    this.lancer(r.etat, r.ui.vitesse, r.ui.camera);
    this.hud.toast(copie ? 'Copie de secours chargée.' : 'Partie chargée.', 'bien');
    return true;
  }

  private async sauverReglages() {
    try {
      await this.store.write('reglages', JSON.stringify(this.reglages));
    } catch {
      /* sans gravité */
    }
  }

  /* ================================================================== écrans */

  /** Démarre (ou reprend) une partie avec cet état. */
  lancer(s: GameState, vitesse = 1, camera?: { x: number; z: number; distance: number; azimut: number; inclinaison: number }) {
    this.s = s;
    this.enJeu = true;
    this.vitesse = vitesse > 0 ? vitesse : 1;
    this.vitesseAvantPause = this.vitesse;
    this.acc = 0;
    this.outil = { t: 'selection' };
    this.selection = null;
    this.vue = null;
    this.trace = [];
    this.dernierObjectifs = '';
    this.irrigues = new Set(s.batiments.filter((b) => b.eauRatio >= 0.8 && (b.kind === 'jardin' || b.kind === 'palmeraie')).map((b) => b.id));
    topologie(s);
    this.rendu.installer(s, cacheDe(s));
    if (camera) this.rendu.rig.definir(camera, true);
    this.ecrans.fermer();
    this.hud.visible(true);
    this.chronoHud = 0;
    this.canvas.style.cursor = 'default';
    // une partie enregistrée pendant que le choix de vocation était en attente le repropose aussitôt
    if (s.progression.choixVocationEnAttente) this.ecranVocation();
    if (!this.reglages.aideVue && s.pas <= PAS_DEPART) {
      this.reglages.aideVue = true;
      void this.sauverReglages();
      this.ouvrir('aide');
    }
  }

  private async metaAuto(): Promise<MetaSauvegarde | null> {
    try {
      const t = await this.store.read('auto');
      return t ? lireMeta(t) : null;
    } catch {
      return null;
    }
  }

  async ecranPrincipal() {
    const meta = await this.metaAuto();
    const electron = this.store.kind === 'electron';
    this.ecrans.afficher(
      'principal',
      htmlPrincipal(meta, this.version, electron),
      {
        continuer: () => void this.chargerEmplacement('auto'),
        nouvelle: () => this.ecranNouvelle(false, false),
        charger: () => void this.ecranSauvegardes('charger'),
        reglages: () => this.ecranReglages(),
        aide: () => this.ecranAide(),
        quitter: () => void window.seguiaBridge?.app.quit(),
      },
      null,
      true,
    );
  }

  private ecranNouvelle(hasard: boolean, secheresse: boolean) {
    this.ecrans.afficher(
      'nouvelle',
      htmlNouvelle(hasard, secheresse),
      {
        carte: ([c]) => this.ecranNouvelle(c === 'hasard', secheresse),
        secheresse: () => this.ecranNouvelle(hasard, !secheresse),
        retour: () => this.retourEcran(),
        lancer: () => {
          const graine = hasard ? 1 + Math.floor(Math.random() * 2_000_000_000) : GRAINE_SCENARIO;
          const noms = ['Aïn Zerga', 'Tin Hinane', 'Bir Lahmar', 'Oued Noun', 'Tamezret', 'Aïn Sefra', 'Ksar Tala', 'Hassi Ouarda'];
          this.lancer(creerPartie(graine, { secheresse, nomCarte: hasard ? noms[graine % noms.length] : 'Aïn Tamda' }));
        },
      },
      () => this.retourEcran(),
      !this.enJeu,
    );
  }

  /** Retour depuis un sous-écran : menu principal hors partie, menu de pause en partie. */
  private retourEcran() {
    if (this.enJeu) this.ouvrir('menu');
    else void this.ecranPrincipal();
  }

  ouvrir(ecran: 'menu' | 'aide' | 'journal' | 'reglages' | 'sauvegardes') {
    this.son('clic', 0.6);
    if (ecran === 'aide') this.ecranAide(true);
    else if (ecran === 'journal') {
      this.ecrans.afficher('journal', htmlJournal(this.s), { retour: () => this.ecrans.fermer() }, () => this.ecrans.fermer());
    } else if (ecran === 'reglages') this.ecranReglages();
    else if (ecran === 'sauvegardes') void this.ecranSauvegardes('sauver');
    else {
      void this.sauver('auto', true);
      this.ecrans.afficher(
        'pause',
        htmlPause(),
        {
          reprendre: () => this.ecrans.fermer(),
          sauver: () => void this.ecranSauvegardes('sauver'),
          charger: () => void this.ecranSauvegardes('charger'),
          reglages: () => this.ecranReglages(),
          aide: () => this.ecranAide(),
          principal: () => void this.retourMenu(),
        },
        () => this.ecrans.fermer(),
      );
    }
  }

  private async retourMenu() {
    await this.sauver('auto', true);
    this.enJeu = false;
    this.hud.visible(false);
    this.hud.majEtiquettes([]);
    this.rendu.apercu.cases([], this.s.carte);
    this.rendu.apercu.selection(0, 0, 0, 0, null);
    this.rendu.terrain?.surcouche(null);
    this.installerDecorMenu();
    await this.ecranPrincipal();
  }

  private ecranAide(directe = false) {
    const fermer = () => (directe ? this.ecrans.fermer() : this.retourEcran());
    this.ecrans.afficher('aide', htmlAide(), { retour: fermer }, fermer, !this.enJeu, true);
  }

  private ecranReglages() {
    const electron = this.store.kind === 'electron';
    const fermer = () => {
      void this.sauverReglages();
      this.retourEcran();
    };
    const rafraichir = () => this.ecrans.remplacer(htmlReglages(this.reglages, electron));
    this.ecrans.afficher(
      'reglages',
      htmlReglages(this.reglages, electron),
      {
        volume: ([cle], ev) => {
          const v = Number((ev.target as HTMLInputElement).value) / 100;
          (this.reglages.volumes as unknown as Record<string, number>)[cle] = v;
          this.audio.reglerVolumes(this.reglages.volumes);
          const el = document.getElementById('val-' + cle);
          if (el) el.textContent = String(Math.round(v * 100));
          if (cle === 'effets') this.son('clic', 1, 120);
        },
        qualite: ([q]) => {
          this.reglages.qualite = q as Reglages['qualite'];
          this.rendu.definirQualite(this.reglages.qualite);
          rafraichir();
        },
        ips: () => {
          this.reglages.afficherIps = !this.reglages.afficherIps;
          rafraichir();
        },
        pleinEcran: async () => {
          const app = window.seguiaBridge?.app;
          if (app) await app.setFullscreen(!(await app.isFullscreen()));
        },
        retour: fermer,
      },
      fermer,
      !this.enJeu,
    );
  }

  private async lignesEmplacements(): Promise<LigneEmplacement[]> {
    const infos = await this.store.list().catch(() => []);
    const lignes: LigneEmplacement[] = [];
    for (const [slot, nom] of EMPLACEMENTS) {
      const info = infos.find((l) => l.slot === slot);
      let meta: MetaSauvegarde | null = null;
      let illisible = false;
      if (info?.exists) {
        try {
          const t = await this.store.read(slot);
          const r = t ? deserialiser(t) : null;
          // l'en-tête affiché vient de l'état réellement chargeable, pas du texte libre du fichier
          meta = r && r.ok ? r.meta : null;
          illisible = !meta;
        } catch {
          illisible = true;
        }
      }
      lignes.push({ slot, nom, meta, existe: !!info?.exists, illisible, copie: !!info?.hasBackup });
    }
    return lignes;
  }

  private async ecranSauvegardes(mode: 'sauver' | 'charger', message = '') {
    const electron = this.store.kind === 'electron';
    const chemin = await this.store.location().catch(() => '');
    const html = async (msg: string) => {
      try {
        return htmlSauvegardes(mode, await this.lignesEmplacements(), chemin, electron, msg);
      } catch (err) {
        // l'écran doit toujours s'ouvrir, même si un fichier réserve une surprise
        console.warn(err);
        const vides = EMPLACEMENTS.map(([slot, nom]) => ({ slot, nom, meta: null, existe: false, illisible: false, copie: false }));
        return htmlSauvegardes(mode, vides, chemin, electron, 'La liste des sauvegardes n’a pas pu être lue.');
      }
    };
    this.ecrans.afficher(
      'sauvegardes',
      await html(message),
      {
        ecrire: async ([slot]) => {
          const ok = await this.sauver(slot, true);
          this.ecrans.remplacer(await html(ok ? 'Partie sauvegardée.' : 'La sauvegarde a échoué.'));
        },
        lire: ([slot]) => void this.chargerEmplacement(slot),
        lireCopie: ([slot]) => void this.chargerEmplacement(slot, true),
        supprimer: ([slot]) => {
          this.ecrans.afficher(
            'confirmer',
            htmlConfirmer('Supprimer cette sauvegarde ?', 'Le fichier et sa copie de secours seront effacés.', 'Supprimer'),
            {
              non: () => void this.ecranSauvegardes(mode),
              oui: async () => {
                await this.store.remove(slot).catch(() => undefined);
                void this.ecranSauvegardes(mode);
              },
            },
            () => void this.ecranSauvegardes(mode),
            !this.enJeu,
          );
        },
        dossier: () => void this.store.openFolder(),
        retour: () => this.retourEcran(),
      },
      () => this.retourEcran(),
      !this.enJeu,
      true,
    );
  }

  /* ========================================================= crochets de test */

  private installerCrochetsDeTest() {
    const actif = isTestMode() || import.meta.env.DEV || new URLSearchParams(location.search).has('test');
    if (!actif) return;
    (window as any).__seguia = {
      jeu: this,
      etat: () => this.s,
      /** avance la simulation de n pas, sans attendre le rendu */
      avancer: (n: number) => {
        for (let k = 0; k < n; k++) {
          this.pas();
          if (this.ecrans.ouvert) return k + 1;
        }
        return n;
      },
      empreinte: () => empreinte(this.s),
      commande: (c: Commande) => this.commande(c),
      resume: () => {
        const s = this.s;
        const c = cacheDe(s);
        const cal = calendrier(s.pas);
        return {
          pas: s.pas,
          jour: cal.jour,
          heure: cal.heure,
          palier: s.progression.palier,
          vocation: s.progression.vocation,
          habitants: population(s),
          res: { ...s.res },
          renommee: detailRenommee(s, c).total,
          stats: { ...s.stats },
          caravanes: s.caravanes.map((k) => ({ id: k.id, phase: k.phase, bu: k.bu, besoin: k.besoin, chameaux: k.chameaux })),
          batiments: s.batiments.length,
          ecran: this.ecrans.nom,
          enJeu: this.enJeu,
          vitesse: this.vitesse,
          bilan: { ...c.bilan },
          objectifs: objectifs(s, c).map((o) => `${o.id}:${o.valeur}/${o.cible}`),
        };
      },
      ecranCase: (i: number) => this.rendu.ecranCase(i, 0.05),
      infos: () => this.rendu.infos(),
      vue: (v: Parameters<typeof this.rendu.rig.definir>[0]) => this.rendu.rig.definir(v, true),
      manquants: this.rendu.modeles.manquants,
      /** fige la boucle d'affichage ; `image(dt)` calcule alors une image exactement (captures vidéo) */
      figer: (oui: boolean) => {
        this.fige = oui;
      },
      geler: (oui: boolean) => {
        this.tempsGele = oui;
        this.acc = 0;
      },
      image: (dt: number) => this.uneImage(dt),
    };
  }
}
