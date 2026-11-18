/**
 * Interface en jeu : barre de ressources, objectifs et annonces, barre de construction, inspecteur.
 * Chaque bloc est régénéré en HTML et n'est remplacé dans la page que s'il a changé.
 */
import {
  B,
  BATIMENTS,
  besoinEau,
  batimentParId,
  calendrier,
  canicule,
  conseil,
  debitSource,
  detailRenommee,
  DT_H,
  DX,
  DZ,
  estDebloque,
  facteurEvap,
  JOURS_PAR_SAISON,
  logements,
  N,
  NOM_DIR,
  NOM_PALIER,
  NOM_SAISON,
  objectifs,
  PAS_PAR_JOUR,
  population,
  raisonVerrou,
  tauxPerte,
  tempeteEnCours,
  type Batiment,
  type BatimentKind,
  type Cache,
  type Categorie,
  type GameState,
} from '../sim';
import { statutDe } from '../jeu/statut';
import type { ActionsJeu, EtatJeu, Outil } from '../jeu/types';
import { ico } from './icones';

const ent = (n: number) => Math.floor(n + 1e-9).toLocaleString('fr-FR');
const pct = (r: number) => Math.round(Math.max(0, Math.min(1, r)) * 100);
const ech = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function duree(pas: number): string {
  const h = Math.max(0, pas) * DT_H;
  if (h >= 24) {
    const j = Math.floor(h / 24);
    const r = Math.round(h - j * 24);
    return r ? `${j} j ${r} h` : `${j} j`;
  }
  return h >= 1 ? `${Math.round(h)} h` : 'moins d’une heure';
}

interface ItemBarre {
  cle: string;
  nom: string;
  icone: string;
  outil: Outil;
  kind?: BatimentKind;
  pieces: number;
  materiaux: number;
  parCase?: boolean;
  description: string;
  palier: number;
}

const CATEGORIES: { cle: Categorie; nom: string; icone: string }[] = [
  { cle: 'eau', nom: 'Eau', icone: 'goutte' },
  { cle: 'cultures', nom: 'Cultures', icone: 'jardin' },
  { cle: 'habitat', nom: 'Habitat', icone: 'maison' },
  { cle: 'commerce', nom: 'Commerce', icone: 'caravane' },
  { cle: 'protection', nom: 'Protection', icone: 'vent' },
];

function itemsDe(cat: Categorie): ItemBarre[] {
  const liste: ItemBarre[] = [];
  if (cat === 'eau') {
    liste.push({
      cle: 'canal1',
      nom: 'Séguia',
      icone: 'canal',
      outil: { t: 'canal', type: 1 },
      pieces: B.coutCanalTerre,
      materiaux: 0,
      parCase: true,
      description: 'Canal de terre. Glissez pour tracer. L’eau ne remonte jamais une terrasse et se perd un peu à chaque case.',
      palier: 0,
    });
    liste.push({
      cle: 'canal2',
      nom: 'Séguia maçonnée',
      icone: 'canalMaconne',
      outil: { t: 'canal', type: 2 },
      pieces: B.coutCanalMaconnePieces,
      materiaux: B.coutCanalMaconneMateriaux,
      parCase: true,
      description: 'Quatre fois moins de pertes. Glissez sur une séguia de terre pour la maçonner.',
      palier: 1,
    });
  }
  if (cat === 'protection') {
    liste.push({
      cle: 'cloture1',
      nom: 'Brise-vent',
      icone: 'cloture',
      outil: { t: 'cloture', type: 1 },
      pieces: B.coutCloture,
      materiaux: 0,
      parCase: true,
      description: `Clôture de palmes : abrite ${B.abriCloture} cases sous le vent. Chaque tempête l’abîme.`,
      palier: 1,
    });
    liste.push({
      cle: 'cloture2',
      nom: 'Haie de tamaris',
      icone: 'haie',
      outil: { t: 'cloture', type: 2 },
      pieces: B.coutHaie,
      materiaux: 0,
      parCase: true,
      description: `Haie vivante : abrite ${B.abriHaie} cases et ne s’use pas, mais meurt en sol sec. Plantez-la près de l’eau.`,
      palier: 1,
    });
  }
  for (const def of Object.values(BATIMENTS)) {
    if (!def.constructible || def.categorie !== cat) continue;
    liste.push({
      cle: def.kind,
      nom: def.nom,
      icone: def.kind === 'jardin' ? 'jardin' : def.kind === 'palmeraie' ? 'palmeraie' : 'maison',
      outil: { t: 'batiment', kind: def.kind, rot: 0 },
      kind: def.kind,
      pieces: def.pieces,
      materiaux: def.materiaux,
      description: def.description,
      palier: def.palier,
    });
  }
  liste.sort((a, b) => a.palier - b.palier);
  return liste;
}

function memeOutil(a: Outil, b: Outil): boolean {
  if (a.t !== b.t) return false;
  if (a.t === 'canal' && b.t === 'canal') return a.type === b.type;
  if (a.t === 'cloture' && b.t === 'cloture') return a.type === b.type;
  if (a.t === 'batiment' && b.t === 'batiment') return a.kind === b.kind;
  return true;
}

export class Hud {
  private racine: HTMLElement;
  private blocs = new Map<string, { el: HTMLElement; html: string }>();
  private categorie: Categorie = 'eau';
  private appui = false;
  private astuce: HTMLElement;
  private bulle: HTMLElement;
  private toasts: HTMLElement;
  private etiquettes: HTMLElement;
  private confirmerDemolition = 0;
  private dernierEtat: EtatJeu | null = null;
  private panneauGauche!: HTMLElement;

  constructor(racine: HTMLElement, private actions: ActionsJeu) {
    this.racine = racine;
    this.etiquettes = this.creer('div', 'etiquettes');
    for (const [nom, classe] of [
      ['barre', 'barre'],
      ['gauche', 'panneau gauche'],
      ['droite', 'panneau droite'],
      ['construire', 'panneau construire'],
      ['bandeau', ''],
    ]) {
      const el = this.creer('div', classe);
      if (nom === 'gauche') {
        // le panneau de gauche a deux parties : les annonces changent sans cesse (compte à rebours, niveau des
        // bassins) ; les réglages restent en place pour qu'un bouton ne soit jamais remplacé sous le curseur
        const haut = document.createElement('div');
        const bas = document.createElement('div');
        el.append(haut, bas);
        this.panneauGauche = el;
        this.blocs.set('gauche', { el: haut, html: '' });
        this.blocs.set('gestion', { el: bas, html: '' });
        continue;
      }
      this.blocs.set(nom, { el, html: '' });
    }
    this.toasts = this.creer('div', 'toasts');
    this.bulle = this.creer('div', 'bulle');
    this.bulle.style.display = 'none';
    this.astuce = this.creer('div', 'astuce');
    this.astuce.style.display = 'none';

    racine.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.panneau, .barre')) this.appui = true;
    });
    window.addEventListener('pointerup', () => {
      this.appui = false;
    });
    racine.addEventListener('click', (e) => this.clic(e));
    racine.addEventListener('mouseover', (e) => this.survol(e));
    racine.addEventListener('mouseout', (e) => {
      if ((e.target as HTMLElement).closest('[data-astuce]')) this.astuce.style.display = 'none';
    });
  }

  private creer(tag: string, classe: string): HTMLElement {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    this.racine.appendChild(el);
    return el;
  }

  visible(oui: boolean) {
    for (const b of this.blocs.values()) b.el.style.display = oui ? '' : 'none';
    this.panneauGauche.style.display = oui ? '' : 'none';
    this.etiquettes.style.display = oui ? '' : 'none';
    this.toasts.style.display = oui ? '' : 'none';
    if (!oui) {
      this.bulle.style.display = 'none';
      this.astuce.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------ événements */

  private survol(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest('[data-astuce]') as HTMLElement | null;
    if (!el) return;
    this.astuce.innerHTML = el.dataset.astuce!;
    this.astuce.style.display = '';
    const r = el.getBoundingClientRect();
    const a = this.astuce.getBoundingClientRect();
    let x = r.left + r.width / 2 - a.width / 2;
    x = Math.max(8, Math.min(window.innerWidth - a.width - 8, x));
    let y = r.top - a.height - 8;
    if (y < 8) y = r.bottom + 8;
    this.astuce.style.left = x + 'px';
    this.astuce.style.top = y + 'px';
  }

  private clic(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    const [nom, ...args] = el.dataset.a!.split(':');
    const a = this.actions;
    const etat = this.dernierEtat;
    switch (nom) {
      case 'vitesse':
        a.vitesse(Number(args[0]));
        break;
      case 'pause':
        a.pause();
        break;
      case 'cat':
        this.categorie = args[0] as Categorie;
        break;
      case 'outil': {
        const item = CATEGORIES.flatMap((c) => itemsDe(c.cle)).find((i) => i.cle === args[0]);
        if (item) a.outil(etat && memeOutil(etat.outil, item.outil) ? { t: 'selection' } : item.outil);
        break;
      }
      case 'selection':
        a.outil({ t: 'selection' });
        break;
      case 'effacer':
        a.outil({ t: 'effacer' });
        break;
      case 'annuler':
        a.commande({ t: 'annuler' });
        break;
      case 'vue':
        a.vue(etat && etat.vue === args[0] ? null : (args[0] as 'eau' | 'vent'));
        break;
      case 'ouvrir':
        a.ouvrir(args[0] as 'menu');
        break;
      case 'fermer':
        a.selection(null);
        break;
      case 'poids': {
        const b = etat ? batimentParId(etat.s, Number(args[0])) : undefined;
        if (b) {
          const p = [...b.poids] as [number, number, number, number];
          p[Number(args[1])] = Number(args[2]);
          a.commande({ t: 'poids', id: b.id, poids: p });
        }
        break;
      }
      case 'vanne':
        a.commande({ t: 'vanne', id: Number(args[0]), vanne: Number(args[1]) as 0 | 1 | 2 });
        break;
      case 'arret':
        a.commande({ t: 'pause', id: Number(args[0]), pause: args[1] === '1' });
        break;
      case 'demolir': {
        const id = Number(args[0]);
        if (this.confirmerDemolition === id) {
          this.confirmerDemolition = 0;
          a.commande({ t: 'demolir', id });
          a.selection(null);
        } else {
          this.confirmerDemolition = id;
          setTimeout(() => {
            if (this.confirmerDemolition === id) this.confirmerDemolition = 0;
          }, 3000);
        }
        break;
      }
      case 'foggara':
        a.commande({ t: 'foggara' });
        break;
      case 'corvee':
        a.commande({ t: 'corvee', on: args[0] === '1' });
        break;
      case 'commande':
        if (etat) a.commande({ t: 'commande', n: etat.s.commandeMateriaux + Number(args[0]) });
        break;
      case 'vivres':
        a.commande({ t: 'acheterVivres', n: Number(args[0]) });
        break;
      case 'centrer':
        a.centrer(Number(args[0]));
        break;
      case 'effacerCase':
        a.commande({ t: 'effacer', cases: [Number(args[0])] });
        a.selection(null);
        break;
    }
    if (etat) this.maj(etat, true);
  }

  /* -------------------------------------------------------------- messages */

  toast(texte: string, ton: 'info' | 'bien' | 'alerte' | 'refus' = 'info', detail = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + ton;
    el.innerHTML = ech(texte) + (detail ? `<small>${ech(detail)}</small>` : '');
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.remove(), ton === 'refus' ? 4200 : 5200);
  }

  /** Message collé au curseur (cause d'un refus, coût d'un tracé). */
  bulleCurseur(x: number, y: number, texte: string, ton: '' | 'refus' | 'alerte' = '', detail = '') {
    if (!texte) {
      this.bulle.style.display = 'none';
      return;
    }
    const html = ech(texte) + (detail ? `<small>${ech(detail)}</small>` : '');
    if (this.bulle.dataset.h !== html) {
      this.bulle.innerHTML = html;
      this.bulle.dataset.h = html;
    }
    this.bulle.className = 'bulle ' + ton;
    this.bulle.style.display = '';
    const l = Math.min(x, window.innerWidth - 310);
    const t = Math.min(y, window.innerHeight - 90);
    this.bulle.style.left = l + 'px';
    this.bulle.style.top = t + 'px';
  }

  /** Petit texte qui s'élève au-dessus d'un point de l'écran (+12 vivres, +40 pièces…). */
  flotter(x: number, y: number, texte: string, ton: 'bien' | 'alerte' | '' = '') {
    const el = document.createElement('div');
    el.className = 'flot ' + ton;
    el.textContent = texte;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    this.etiquettes.appendChild(el);
    setTimeout(() => el.remove(), 1650);
  }

  /** Pictogrammes d'alerte au-dessus des bâtiments. `points` : position écran de chaque bâtiment concerné. */
  majEtiquettes(points: { id: number; x: number; y: number; niveau: string; icone: string }[]) {
    const existants = new Map<string, HTMLElement>();
    for (const el of Array.from(this.etiquettes.querySelectorAll<HTMLElement>('.etiq'))) existants.set(el.dataset.id!, el);
    for (const p of points) {
      const cle = String(p.id);
      let el = existants.get(cle);
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = cle;
        this.etiquettes.appendChild(el);
      } else existants.delete(cle);
      const classe = 'etiq ' + (p.niveau === 'arret' ? (p.icone === 'pause' ? 'pause' : '') : p.niveau);
      if (el.className !== classe) el.className = classe;
      if (el.dataset.i !== p.icone) {
        el.innerHTML = ico(p.icone === 'pause' ? 'pause' : p.icone);
        el.dataset.i = p.icone;
      }
      el.style.left = Math.round(p.x) + 'px';
      el.style.top = Math.round(p.y) + 'px';
    }
    for (const el of existants.values()) el.remove();
  }

  /* ------------------------------------------------------------------ rendu */

  maj(e: EtatJeu, force = false) {
    this.dernierEtat = e;
    this.poser('barre', this.htmlBarre(e), force);
    this.poser('gauche', this.htmlGauche(e), force);
    this.poser('gestion', this.htmlGestion(e), force);
    this.poser('construire', this.htmlConstruire(e), force);
    const droite = this.htmlDroite(e);
    this.blocs.get('droite')!.el.style.display = droite ? '' : 'none';
    this.poser('droite', droite, force);
    this.poser('bandeau', this.htmlBandeau(e), true);
  }

  private poser(nom: string, html: string, force: boolean) {
    const b = this.blocs.get(nom)!;
    if (b.html === html) return;
    if (this.appui && !force && nom !== 'bandeau') return; // ne pas remplacer un bouton en cours de clic
    b.html = html;
    b.el.innerHTML = html;
  }

  private htmlBarre(e: EtatJeu): string {
    const { s, c } = e;
    const cal = calendrier(s.pas);
    const pop = population(s);
    const log = logements(s);
    const bras = Math.floor(pop * B.partOuvriers);
    const libres = Math.max(0, Math.round(c.ouvriersLibres));
    const ren = detailRenommee(s, c);
    const b = c.bilan;
    const utile = b.injecte > 0 ? Math.round((100 * b.consomme) / b.injecte) : 0;
    const angle = (cal.heure / 24) * 360;
    const v = (n: number, icone: string, titre: string) =>
      `<button data-a="vitesse:${n}" class="${e.vitesse === n ? 'actif' : ''}" data-astuce="${titre}">${ico(icone)}</button>`;
    const res = (icone: string, valeur: string, sous: string, astuce: string, alerte = false) =>
      `<div class="res${alerte ? ' alerte' : ''}" data-astuce="${astuce}">${ico(icone)}<span>${valeur}</span>${sous ? `<small>${sous}</small>` : ''}</div>`;
    const joursVivres = pop > 0 ? (s.res.vivres + s.res.dattes) / pop : 99;
    return `
      <div class="date" data-astuce="<b>${NOM_SAISON[cal.saison]}</b>Jour ${cal.jourSaison + 1} sur ${JOURS_PAR_SAISON}. La saison chaude fait baisser la source ; la saison des vents amène les tempêtes de sable.">
        <div class="cadran"><i style="transform: rotate(${angle + 180}deg)"></i></div>
        <div><div class="jour">Jour ${cal.jour + 1} · ${String(Math.floor(cal.heure)).padStart(2, '0')} h</div>
        <div class="saison">${NOM_SAISON[cal.saison]} · an ${cal.annee + 1}</div></div>
      </div>
      <div class="vitesses">
        ${v(0, 'pause', '<b>Pause</b>Espace. On peut construire pendant la pause.')}
        ${v(1, 'lecture', '<b>Vitesse normale</b>Touche 1')}
        ${v(2, 'rapide', '<b>Rapide ×2</b>Touche 2')}
        ${v(4, 'tresRapide', '<b>Très rapide ×4</b>Touche 3')}
      </div>
      <div class="ressources">
        ${res('pieces', ent(s.res.pieces), '', '<b>Pièces</b>Gagnées en abreuvant les caravanes et en leur vendant des dattes.')}
        ${res('materiaux', ent(s.res.materiaux), '', '<b>Matériaux</b>Achetés aux caravanes (panneau de gauche) ou produits par une briqueterie.')}
        ${res('vivres', ent(s.res.vivres), '', `<b>Vivres</b>Chaque habitant en mange un par jour. Réserve : ${joursVivres >= 99 ? '—' : joursVivres.toFixed(1)} jour(s).`, joursVivres < 1)}
        ${res('dattes', ent(s.res.dattes), '', '<b>Dattes</b>Vendues aux caravanes ; mangées si les vivres manquent.')}
        ${res('habitants', `${pop}`, `/ ${log}`, '<b>Habitants / logements</b>Ils arrivent s’il y a des vivres, un toit et une fontaine en eau à proximité.', pop >= log && log > 0 && false)}
        ${res('bras', `${libres}`, `libres / ${bras}`, '<b>Bras libres</b>Un habitant sur deux travaille. Les bras libres bâtissent et curent le sable.', libres === 0 && c.postes > bras)}
        ${res('goutte', `${Math.round(b.source)}`, `u/h · ${utile} % utile`, `<b>Eau de la source</b>${Math.round(b.injecte)} u/h entrent dans le réseau : ${Math.round(b.consomme)} bues, ${Math.round(b.evapore)} évaporées, ${Math.round(b.deverse)} perdues en bout de canal.`)}
        ${res('renommee', `${ren.total}`, s.progression.palier >= 2 ? `/ ${B.renommeeVictoire}` : '', `<b>Renommée</b>Caravanes : ${Math.round(ren.caravanes)} · Habitants : ${Math.round(ren.habitants)} · Verdure : ${Math.round(ren.verdure + ren.palmeraies)} · Dattes : ${Math.round(ren.dattes)}`)}
      </div>
      <div class="outilsHaut">
        <button data-a="vue:eau" class="${e.vue === 'eau' ? 'actif' : ''}" data-astuce="<b>Vue de l’eau</b>Montre qui boit à sa soif (vert) et qui manque d’eau (rouge). Touche V.">${ico('eauVue')}</button>
        <button data-a="vue:vent" class="${e.vue === 'vent' ? 'actif' : ''}" data-astuce="<b>Vue du vent</b>Montre les cases exposées au sable (rouge) et abritées (vert). Touche B.">${ico('vent')}</button>
        <button data-a="ouvrir:journal" data-astuce="<b>Journal</b>Les derniers événements.">${ico('journal')}</button>
        <button data-a="ouvrir:aide" data-astuce="<b>Aide</b>Commandes et règles. Touche H.">${ico('aide')}</button>
        <button data-a="ouvrir:menu" data-astuce="<b>Menu</b>Sauvegarder, réglages, quitter. Échap.">${ico('menu')}</button>
      </div>`;
  }

  private htmlGauche(e: EtatJeu): string {
    const { s, c } = e;
    const pr = s.progression;
    let h = `<div class="palier"><h3>${NOM_PALIER[pr.palier]}</h3><span>${pr.palier < 3 ? `Palier ${pr.palier + 1} sur 3` : ''}</span></div>`;
    const obj = objectifs(s, c);
    for (const o of obj) {
      h += `<div class="obj${o.fait ? ' fait' : ''}"><span class="puce">${o.fait ? ico('coche') : ''}</span><span>${ech(o.texte)}</span><b>${o.cible > 1 ? `${o.valeur}/${o.cible}` : ''}</b></div>`;
    }
    if (pr.palier === 3) {
      h += `<p style="margin:6px 0 0;line-height:1.35">L’oasis est renommée. Continuez à votre guise : les années suivantes sont plus rudes.</p>`;
    }
    const cs = conseil(s);
    if (cs) h += `<div class="conseil"><b>Conseil.</b> ${ech(cs)}</div>`;

    // --- annonces ---
    let annonces = '';
    const annonceCar = B.caravaneAnnonceJ * PAS_PAR_JOUR * 2;
    let stock = 0;
    let capacite = 0;
    for (const b of s.batiments) {
      if (b.kind === 'bassin' && b.chantier >= 1) {
        stock += b.stock;
        capacite += B.bassinCapacite;
      }
    }
    for (const car of s.caravanes) {
      if (car.phase === 'annoncee') {
        if (!car.annonceFaite || car.arriveePas - s.pas > annonceCar) continue;
        const assez = stock >= car.besoin * 0.97;
        annonces += `<div class="annonce${assez ? '' : ' alerte'}">${ico('caravane')}<div><b>Caravane dans ${duree(car.arriveePas - s.pas)}</b><small>${car.chameaux} chameaux, ${Math.round(car.besoin)} u d’eau · bassins : ${Math.round(stock)}/${capacite} u</small></div></div>`;
      } else if (car.phase === 'approche') {
        annonces += `<div class="annonce">${ico('caravane')}<div><b>Caravane sur la piste</b><small>${car.chameaux} chameaux, ${Math.round(car.besoin)} u · bassins : ${Math.round(stock)}/${capacite} u</small></div></div>`;
      } else if (car.phase === 'abreuvage') {
        annonces += `<div class="annonce">${ico('caravane')}<div><b>La caravane boit</b><small>${Math.round(car.bu)}/${Math.round(car.besoin)} u · part dans ${duree(car.finPhasePas - s.pas)} au plus tard</small><div class="jauge"><i style="width:${pct(car.bu / car.besoin)}%"></i></div></div></div>`;
      } else if (car.phase === 'commerce') {
        const reste = car.chameaux * B.caravaneVivresParChameau - car.vivresVendus;
        annonces += `<div class="annonce">${ico('caravane')}<div><b>Caravane à l’étape</b><small>Repart dans ${duree(car.finPhasePas - s.pas)}. Elle vend des vivres (${B.prixVivre} pièce l’un).</small>
          <div class="ligneBoutons"><button class="btn" data-a="vivres:10" ${reste > 0 && s.res.pieces >= B.prixVivre ? '' : 'disabled'}>Acheter 10 vivres</button></div></div></div>`;
      }
    }
    for (const m of s.meteo) {
      if (!m.annoncee || s.pas >= m.finPas) continue;
      const enCours = s.pas >= m.debutPas;
      if (m.type === 'tempete') {
        annonces += `<div class="annonce alerte">${ico('tempete')}<div><b>${m.grande ? 'Grande tempête' : 'Tempête de sable'} ${enCours ? 'en cours' : 'dans ' + duree(m.debutPas - s.pas)}</b><small>Vent du ${NOM_DIR[m.dir]}. Les séguias non abritées vont s’ensabler.</small></div></div>`;
      } else {
        annonces += `<div class="annonce alerte">${ico('soleil')}<div><b>Canicule ${enCours ? 'en cours' : 'dans ' + duree(m.debutPas - s.pas)}</b><small>Évaporation et soif des cultures en forte hausse.</small></div></div>`;
      }
    }
    if (annonces) h += `<h4>À venir</h4>${annonces}`;
    return h;
  }

  /** Réglages courants (corvée, commande de matériaux) : bloc stable, redessiné seulement quand il change. */
  private htmlGestion(e: EtatJeu): string {
    const { s } = e;
    let h = '';
    let capacite = 0;
    for (const b of s.batiments) if (b.kind === 'bassin' && b.chantier >= 1) capacite += B.bassinCapacite;
    let ensable = 0;
    for (let i = 0; i < s.canal.length; i++) if (s.canal[i] && s.sable[i] > 0.15) ensable++;
    const aBassin = capacite > 0;
    if (ensable > 0 || s.corvee || aBassin) {
      h += `<h4>Gestion</h4>`;
      if (ensable > 0 || s.corvee) {
        h += `<div class="annonce${ensable ? ' alerte' : ''}">${ico('sable')}<div><b>${ensable} case${ensable > 1 ? 's' : ''} de séguia ensablée${ensable > 1 ? 's' : ''}</b><small>${s.corvee ? 'Corvée en cours : toute la production est à l’arrêt.' : 'Seuls les bras libres curent. La corvée y met tout le monde.'}</small>
          <div class="ligneBoutons"><button class="btn${s.corvee ? ' actif' : ''}" data-a="corvee:${s.corvee ? 0 : 1}">${ico('corvee')}${s.corvee ? 'Arrêter la corvée' : 'Corvée générale'}</button></div></div></div>`;
      }
      if (aBassin) {
        h += `<div class="donnee" data-astuce="<b>Commande de matériaux</b>Quantité achetée à chaque caravane bien reçue (${B.prixMateriau} pièces l’unité, ${B.caravaneMateriauxParChameau} par chameau au plus)."><span>Matériaux commandés par caravane</span><span class="pas"><button data-a="commande:-5">−</button><b>${s.commandeMateriaux}</b><button data-a="commande:5">+</button></span></div>`;
      }
    }
    return h;
  }

  private htmlConstruire(e: EtatJeu): string {
    const { s } = e;
    let onglets = '';
    for (const cat of CATEGORIES) {
      onglets += `<button data-a="cat:${cat.cle}" class="${this.categorie === cat.cle ? 'actif' : ''}">${ico(cat.icone)}${cat.nom}</button>`;
    }
    onglets += `<span class="sep"></span>
      <span class="droite2">
        <button data-a="selection" class="${e.outil.t === 'selection' ? 'actif' : ''}" data-astuce="<b>Sélection</b>Cliquez un bâtiment ou une séguia pour l’inspecter. Échap.">${ico('curseur')}Sélection</button>
        <button data-a="effacer" class="${e.outil.t === 'effacer' ? 'actif' : ''}" data-astuce="<b>Effacer</b>Glissez sur des séguias ou des brise-vent pour les retirer. Touche X.">${ico('gomme')}Effacer</button>
        <button data-a="annuler" ${s.annulables.length ? '' : 'disabled'} data-astuce="<b>Annuler</b>Annule la dernière construction et la rembourse entièrement, pendant 3 heures de jeu. Ctrl+Z.">${ico('annuler')}Annuler</button>
      </span>`;
    let items = '';
    for (const it of itemsDe(this.categorie)) {
      const libre = it.kind ? estDebloque(s, it.kind) : s.progression.palier >= it.palier;
      const verrou = libre ? '' : it.kind ? raisonVerrou(s, it.kind) : 'Disponible après le palier « La première eau ».';
      const actif = memeOutil(e.outil, it.outil);
      const manqueP = s.res.pieces < it.pieces;
      const manqueM = s.res.materiaux < it.materiaux;
      const def = it.kind ? BATIMENTS[it.kind] : null;
      let details = '';
      if (def) {
        const bouts: string[] = [];
        if (def.eau > 0 && def.kind !== 'bassin' && def.kind !== 'citerne') bouts.push(`${def.eau} u/h d’eau`);
        if (def.ouvriers > 0) bouts.push(`${def.ouvriers} bras`);
        if (def.presPiste) bouts.push(`à ${def.presPiste} cases de la piste au plus`);
        if (bouts.length) details = `<i>Besoins : ${bouts.join(' · ')}</i>`;
      }
      const astuce = `<b>${ech(it.nom)}</b>${ech(it.description)}${details}${verrou ? `<i>${ech(verrou)}</i>` : ''}`;
      const img = it.kind && e.vignettes[it.kind] ? `<img src="${e.vignettes[it.kind]}" alt="">` : ico(it.icone);
      items += `<button class="item${actif ? ' actif' : ''}${libre ? '' : ' verrou'}" data-a="outil:${it.cle}" data-astuce="${astuce.replace(/"/g, '&quot;')}">
        <span class="vignette">${img}</span><span class="nom">${ech(it.nom)}</span>
        <span class="cout"><span class="${manqueP ? 'manque' : ''}">${ico('pieces')} ${it.pieces}</span>${it.materiaux ? `<span class="${manqueM ? 'manque' : ''}">${ico('materiaux')} ${it.materiaux}</span>` : ''}${it.parCase ? '<span>/case</span>' : ''}</span>
      </button>`;
    }
    return `<div class="onglets">${onglets}</div><div class="items">${items}</div>`;
  }

  private htmlBandeau(e: EtatJeu): string {
    const b = this.blocs.get('bandeau')!.el;
    const t = tempeteEnCours(e.s);
    if (e.vitesse === 0) {
      b.className = 'bandeau pauseB';
      return `${ico('pause')} Pause — vous pouvez construire`;
    }
    if (t) {
      b.className = 'bandeau';
      return `${ico('tempete')} Tempête de sable — vent du ${NOM_DIR[t.dir]}`;
    }
    if (canicule(e.s)) {
      b.className = 'bandeau';
      return `${ico('soleil')} Canicule`;
    }
    b.className = '';
    return '';
  }

  /* -------------------------------------------------------------- inspecteur */

  private htmlDroite(e: EtatJeu): string {
    const { s, c } = e;
    const sel = e.selection;
    if (!sel) return '';
    if (sel.t === 'case') return this.htmlCase(e, sel.i);
    const b = batimentParId(s, sel.id);
    if (!b) return '';
    const def = BATIMENTS[b.kind];
    const st = statutDe(s, c, b);
    const donnee = (nom: string, val: string) => `<div class="donnee"><span>${nom}</span><b>${val}</b></div>`;
    const jauge = (r: number, classe = '') => `<div class="jauge ${classe}"><i style="width:${pct(r)}%"></i></div>`;
    let h = `<div class="tete"><h3>${ech(def.nom)}</h3><button class="fermer" data-a="fermer">${ico('croix')}</button></div>
      <p>${ech(def.description)}</p>
      <div class="etat ${st.niveau === 'ok' ? '' : st.niveau}"><b>${ech(st.titre)}</b>${ech(st.cause)}${st.remede ? `<span class="remede">${ech(st.remede)}</span>` : ''}</div>`;
    const besoin = besoinEau(s, c, b);
    if (def.eau > 0 && b.kind !== 'puits' && b.chantier >= 1 && !b.pause) {
      h += donnee('Eau reçue / besoin', `${(besoin * b.eauRatio).toFixed(1)} / ${besoin.toFixed(1)} u/h`);
    }
    if (def.ouvriers > 0 && b.chantier >= 1) {
      h += donnee('Bras', `${(Math.round(b.personnel * def.ouvriers * 10) / 10).toString().replace('.', ',')} / ${def.ouvriers}`);
    }
    switch (b.kind) {
      case 'jardin':
        h += donnee('Récolte', `${pct(b.croissance)} %`) + jauge(b.croissance, 'vert');
        h += donnee('Santé', `${pct(b.sante)} %`) + jauge(b.sante, b.sante < 0.4 ? 'rouge' : 'vert');
        h += donnee('À chaque récolte', `${Math.round(B.jardinRecolte * (c.ombre[b.z * N + b.x] ? B.jardinOmbreRecolte : 1) * (s.progression.vocation === 'grenier' ? 1.25 : 1))} vivres`);
        if (c.ombre[b.z * N + b.x]) h += `<p>À l’ombre d’une palmeraie : il boit ${Math.round((1 - B.jardinOmbreBesoin) * 100)} % de moins et donne davantage.</p>`;
        break;
      case 'palmeraie':
        h += donnee('Croissance', `${pct(b.croissance)} %`) + jauge(b.croissance, 'vert');
        h += donnee('Santé', `${pct(b.sante)} %`) + jauge(b.sante, b.sante < 0.4 ? 'rouge' : 'vert');
        h += `<p>${b.croissance >= B.palmeraieMature ? 'Adulte : elle donne des dattes, de l’ombre à ses voisins et arrête le sable sur 5 cases.' : `Encore jeune : dattes et ombre à partir de ${Math.round(B.palmeraieMature * 100)} %.`}</p>`;
        break;
      case 'maison':
        h += donnee('Habitants', `${b.habitants} / ${B.maisonCapacite}`);
        break;
      case 'bassin':
        h += donnee('Réserve', `${Math.round(b.stock)} / ${B.bassinCapacite} u`) + jauge(b.stock / B.bassinCapacite);
        h += `<p>Une caravane ne s’arrête que si les bassins contiennent au moins un quart de sa soif. Elle paie selon ce qu’elle a bu.</p>`;
        break;
      case 'citerne':
        h += donnee('Réserve', `${Math.round(b.stock)} / ${B.citerneCapacite} u`) + jauge(b.stock / B.citerneCapacite);
        h += `<h4>Vanne</h4><div class="poids">
          <button class="${b.vanne === 0 ? 'actif' : ''}" data-a="vanne:${b.id}:0">Remplir</button>
          <button class="${b.vanne === 1 ? 'actif' : ''}" data-a="vanne:${b.id}:1">Tenir</button>
          <button class="${b.vanne === 2 ? 'actif' : ''}" data-a="vanne:${b.id}:2">Vider</button></div>
          <p>« Vider » rend ${B.citerneVidange} u/h à la séguia : l’aval en profite.</p>`;
        break;
      case 'repartiteur':
        h += this.htmlRepartiteur(e, b);
        break;
      case 'source': {
        const q = debitSource(s);
        const cal = calendrier(s.pas);
        h += donnee('Débit', `${Math.round(q)} u/h`);
        h += donnee('Saison', `× ${B.sourceSaison[cal.saison].toFixed(2).replace('.', ',')}`);
        const puits = s.batiments.filter((x) => x.kind === 'puits' && x.chantier >= 1 && !x.pause).length;
        if (puits) h += donnee('Puits', `− ${Math.round(Math.min(1 - B.puitsPlancher, puits * B.puitsBaisse) * 100)} %`);
        if (s.options.secheresse) h += donnee('Année sèche', '− 15 %');
        if (s.foggaraChantier >= 0) {
          h += donnee('Prolongement de la foggara', `${pct(s.foggaraChantier)} %`) + jauge(s.foggaraChantier, 'cuivre');
        } else if (s.foggaraNiveau < 2) {
          const p = B.foggaraPieces[s.foggaraNiveau];
          const m = B.foggaraMateriaux[s.foggaraNiveau];
          h += `<div class="ligneBoutons"><button class="btn principal" data-a="foggara" ${s.progression.palier >= 1 ? '' : 'disabled'}>${ico('foggara')}Prolonger la foggara (+20 %)</button></div>
            <p>${p} pièces, ${m} matériaux, ${Math.round(B.foggaraChantierH / 24 * 10) / 10} jour de travaux.${s.progression.palier >= 1 ? '' : ' Disponible après le premier palier.'}</p>`;
        } else h += `<p>La foggara est à sa longueur maximale.</p>`;
        break;
      }
      case 'puits':
        h += donnee('Apport', `${(B.puitsDebit * b.personnel).toFixed(0)} u/h`);
        break;
      case 'noria':
        h += donnee('Eau élevée', `${(besoin * b.eauRatio * B.noriaRendement).toFixed(1)} u/h`);
        break;
      case 'briqueterie':
        h += donnee('Production', `${(B.briquesParJour * b.personnel * b.eauRatio).toFixed(1)} matériaux/jour`);
        break;
      case 'caravanserail':
        h += `<p>Tant qu’il a ses bras : paiement × ${B.caravanserailPaie}, dattes vendues plus cher, et les caravanes patientent deux fois plus longtemps.</p>`;
        break;
      case 'hammam':
        h += `<p>En eau et en bras : paiement des caravanes × ${B.hammamPaie} et un point de renommée de plus par caravane bien reçue.</p>`;
        break;
      case 'fanal':
        h += `<p>Allumé : les caravanes viennent ${Math.round((1 / B.fanalIntervalle - 1) * 100)} % plus souvent et sont annoncées un jour plus tôt.</p>`;
        break;
      case 'sechoir':
        h += `<p>En service : dattes vendues × ${B.sechoirPrix} et renommée accrue par les dattes vendues.</p>`;
        break;
    }
    // actions
    let actions = '';
    if (b.kind !== 'source' && b.kind !== 'maison' && b.kind !== 'repartiteur' && b.chantier >= 1) {
      const parcelle = b.kind === 'jardin' || b.kind === 'palmeraie';
      actions += b.pause
        ? `<button class="btn actif" data-a="arret:${b.id}:0">${ico('lecture')}${parcelle ? 'Remettre en culture' : 'Remettre en service'}</button>`
        : `<button class="btn" data-a="arret:${b.id}:1">${ico('pause')}${parcelle ? 'Mettre en jachère' : 'Mettre à l’arrêt'}</button>`;
    }
    if (b.kind !== 'source') {
      const arme = this.confirmerDemolition === b.id;
      const rend = `${Math.floor(def.pieces * B.remboursementDemolition)} pièces`;
      actions += `<button class="btn danger${arme ? ' arme' : ''}" data-a="demolir:${b.id}" data-astuce="Rend ${rend}${def.materiaux ? ` et ${Math.floor(def.materiaux * B.remboursementDemolition)} matériaux` : ''}.">${ico('croix')}${arme ? 'Confirmer ?' : 'Démolir'}</button>`;
    }
    if (actions) h += `<div class="ligneBoutons">${actions}</div>`;
    return h;
  }

  private htmlRepartiteur(e: EtatJeu, b: Batiment): string {
    const { s, c } = e;
    const i = b.z * N + b.x;
    let h = '';
    let somme = 0;
    const branches: number[] = [];
    for (let d = 0; d < 4; d++) {
      if (c.enfant[i * 4 + d] >= 0) {
        branches.push(d);
        somme += b.poids[d];
      }
    }
    if (b.chantier < 1) return '<p>Les poids se règlent dès la fin du chantier.</p>';
    if (branches.length < 2) {
      return `<p>Ce répartiteur n’a ${branches.length ? 'qu’une branche' : 'aucune branche'} en aval. Posez-le là où la séguia se divise, puis réglez la part de chaque branche.</p>`;
    }
    const arrive = c.debit[i];
    h += `<div class="donnee"><span>Eau qui arrive</span><b>${arrive.toFixed(1)} u/h</b></div><h4>Part de chaque branche</h4>`;
    for (const d of branches) {
      const part = somme > 0 ? b.poids[d] / somme : 0;
      const aval = this.resumeAval(s, c, c.enfant[i * 4 + d]);
      let boutons = '';
      for (let p = 0; p <= 3; p++) {
        boutons += `<button class="${b.poids[d] === p ? 'actif' : ''}" data-a="poids:${b.id}:${d}:${p}">${p === 0 ? 'Fermé' : p}</button>`;
      }
      h += `<div class="branche"><div class="haut"><span>Vers le ${NOM_DIR[d]}</span><span>${Math.round(part * 100)} % · ${c.debit[c.enfant[i * 4 + d]].toFixed(0)} u/h</span></div>
        <small>${ech(aval)}</small><div class="poids">${boutons}</div></div>`;
    }
    if (somme === 0) h += `<p><b>Toutes les branches sont fermées :</b> l’eau se déverse ici.</p>`;
    return h;
  }

  /** Ce qu'alimente un tronçon : « 3 jardins, 1 palmeraie, bassin ». */
  private resumeAval(s: GameState, c: Cache, depart: number): string {
    const compte = new Map<string, number>();
    let besoin = 0;
    const pile = [depart];
    let cases = 0;
    while (pile.length) {
      const i = pile.pop()!;
      cases++;
      const liste = c.conso.get(i);
      if (liste) {
        for (const b of liste) {
          compte.set(b.kind, (compte.get(b.kind) ?? 0) + 1);
          besoin += besoinEau(s, c, b);
        }
      }
      for (let d = 0; d < 4; d++) if (c.enfant[i * 4 + d] >= 0) pile.push(c.enfant[i * 4 + d]);
    }
    const noms: string[] = [];
    for (const [kind, n] of compte) {
      const nom = BATIMENTS[kind as BatimentKind].nom.toLowerCase();
      noms.push(n > 1 ? `${n} ${nom.endsWith('s') ? nom : nom.replace(/^(\S+)/, '$1s')}` : nom);
    }
    if (!noms.length) return `${cases} cases de canal, personne n’y boit : cette eau est perdue.`;
    return `Alimente : ${noms.join(', ')}. Soif totale : ${besoin.toFixed(0)} u/h.`;
  }

  private htmlCase(e: EtatJeu, i: number): string {
    const { s, c } = e;
    const type = s.canal[i];
    if (!type && !s.cloture[i]) return '';
    let h = '';
    const donnee = (nom: string, val: string) => `<div class="donnee"><span>${nom}</span><b>${val}</b></div>`;
    if (type) {
      h += `<div class="tete"><h3>${type === 2 ? 'Séguia maçonnée' : 'Séguia de terre'}</h3><button class="fermer" data-a="fermer">${ico('croix')}</button></div>`;
      const atteinte = c.rang[i] >= 0;
      if (!atteinte) {
        // pourquoi l'eau n'arrive-t-elle pas ?
        let plusHaut = false;
        const tx = i % N;
        const tz = Math.floor(i / N);
        for (let d = 0; d < 4; d++) {
          const nx = tx + DX[d];
          const nz = tz + DZ[d];
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const j = nz * N + nx;
          if (s.canal[j] && c.rang[j] >= 0 && s.carte.elev[j] < s.carte.elev[i]) plusHaut = true;
        }
        h += `<div class="etat arret"><b>À sec</b>${plusHaut ? 'Cette case est plus haute que la séguia qui l’alimenterait : l’eau ne remonte pas.' : 'Ce tronçon n’est pas relié à la source.'}<span class="remede">${plusHaut ? 'Faites venir l’eau par la terrasse du dessus, ou élevez-la avec une noria.' : 'Reliez-le à une séguia en eau.'}</span></div>`;
      } else {
        const q = c.debit[i];
        const perte = tauxPerte(s, c, i, facteurEvap(s));
        h += `<div class="etat ${q > 0.3 ? '' : 'attention'}"><b>${q > 0.3 ? 'En eau' : 'Presque à sec'}</b>${q > 0.3 ? '' : 'L’amont boit ou perd presque tout.'}</div>`;
        h += donnee('Débit', `${q.toFixed(1)} u/h`);
        h += donnee('Perte dans cette case', `${(perte * 100).toFixed(1).replace('.', ',')} %`);
        if (c.ombre[i]) h += donnee('Ombre des palmiers', 'pertes ÷ 2');
        if (c.deverse[i] > 0.5) h += donnee('Eau perdue ici', `${c.deverse[i].toFixed(1)} u/h`);
      }
      if (s.sable[i] > 0.02) h += donnee('Ensablement', `${pct(s.sable[i])} %`);
      if (c.deverse[i] > 0.5 && atteinte) {
        h += `<p>L’eau se déverse au bout du canal. Prolongez-le vers une parcelle, une citerne ou un bassin.</p>`;
      }
      if (type === 1) h += `<p>Une séguia maçonnée perd quatre fois moins d’eau : repassez dessus avec l’outil « Séguia maçonnée ».</p>`;
      if (i !== s.carte.sourceCase) h += `<div class="ligneBoutons"><button class="btn danger" data-a="effacerCase:${i}">${ico('gomme')}Effacer cette case</button></div>`;
    } else {
      const haie = s.cloture[i] === 2;
      h += `<div class="tete"><h3>${haie ? 'Haie de tamaris' : 'Brise-vent'}</h3><button class="fermer" data-a="fermer">${ico('croix')}</button></div>`;
      h += donnee('État', `${pct(s.clotureEtat[i])} %`);
      h += `<p>${haie ? `Abrite ${B.abriHaie} cases sous le vent. Elle dépérit si le sol est sec.` : `Abrite ${B.abriCloture} cases sous le vent. Chaque tempête l’use.`}</p>`;
      h += `<div class="ligneBoutons"><button class="btn danger" data-a="effacerCase:${i}">${ico('gomme')}Retirer</button></div>`;
    }
    return h;
  }
}
