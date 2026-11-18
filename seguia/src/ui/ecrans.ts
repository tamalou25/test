/**
 * Écrans modaux : menu principal, pause, sauvegardes, réglages, aide, journal, choix de vocation, bilan.
 * Un seul écran à la fois ; les boutons portent data-e="action:arg".
 */
import { B, calendrier, NOM_PALIER, NOM_SAISON, PAS_PAR_JOUR, population, type GameState, type MetaSauvegarde } from '../sim';
import { detailRenommee } from '../sim';
import type { Reglages } from '../jeu/types';
import { ico } from './icones';

export type Gestionnaire = (args: string[], ev: Event) => void;

export class Ecrans {
  private voile: HTMLElement | null = null;
  private gestionnaires: Record<string, Gestionnaire> = {};
  private surEchap: (() => void) | null = null;
  nom = '';

  constructor(private racine: HTMLElement) {}

  get ouvert(): boolean {
    return this.voile !== null;
  }

  /** Affiche un écran. `surEchap` : action de la touche Échap (null : Échap sans effet). */
  afficher(nom: string, html: string, gestionnaires: Record<string, Gestionnaire>, surEchap: (() => void) | null, plein = false, large = false) {
    this.fermer();
    this.nom = nom;
    this.gestionnaires = gestionnaires;
    this.surEchap = surEchap;
    const v = document.createElement('div');
    v.className = 'voile' + (plein ? ' plein' : '');
    v.innerHTML = `<div class="fenetre${large ? ' large' : ''}">${html}</div>`;
    const traiter = (e: Event) => {
      const el = (e.target as HTMLElement).closest('[data-e]') as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      if (e.type === 'input' && !(el instanceof HTMLInputElement)) return;
      if (e.type === 'click' && el instanceof HTMLInputElement && el.type === 'range') return;
      const [action, ...args] = el.dataset.e!.split(':');
      this.gestionnaires[action]?.(args, e);
    };
    v.addEventListener('click', traiter);
    v.addEventListener('input', traiter);
    this.racine.appendChild(v);
    this.voile = v;
  }

  /** Remplace le contenu de l'écran courant sans le refermer. */
  remplacer(html: string) {
    const f = this.voile?.querySelector('.fenetre');
    if (f) f.innerHTML = html;
  }

  fermer() {
    this.voile?.remove();
    this.voile = null;
    this.nom = '';
    this.surEchap = null;
  }

  /** Renvoie true si la touche a été consommée. */
  echap(): boolean {
    if (!this.voile) return false;
    if (this.surEchap) this.surEchap();
    return true;
  }
}

/* --------------------------------------------------------------- contenus */

const ech = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function dateLisible(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function resumeMeta(m: MetaSauvegarde): string {
  return `Jour ${m.jour + 1}, ${NOM_SAISON[m.saison as 0 | 1 | 2].toLowerCase()}, an ${m.annee + 1} · ${NOM_PALIER[m.palier as 0]} · ${m.habitants} habitants · renommée ${m.renommee}`;
}

export function htmlPrincipal(continuer: MetaSauvegarde | null, version: string, electron: boolean): string {
  return `
    <h1>Séguia</h1>
    <p class="sous">Une oasis-relais à faire vivre, goutte après goutte.</p>
    <div class="menuBoutons">
      ${continuer ? `<button class="btn principal" data-e="continuer">${ico('lecture')}Continuer<span style="font-weight:400;opacity:.9"> — jour ${continuer.jour + 1}, ${continuer.habitants} habitants</span></button>` : ''}
      <button class="btn${continuer ? '' : ' principal'}" data-e="nouvelle">${ico('palmeraie')}Nouvelle partie</button>
      <button class="btn" data-e="charger">${ico('dossier')}Charger une partie</button>
      <button class="btn" data-e="reglages">${ico('reglages')}Réglages</button>
      <button class="btn" data-e="aide">${ico('aide')}Comment jouer</button>
      ${electron ? `<button class="btn" data-e="quitter">${ico('croix')}Quitter</button>` : ''}
    </div>
    <p class="sous" style="font-size:12px;margin-top:16px">Version ${ech(version)} · F11 : plein écran</p>`;
}

export function htmlNouvelle(hasard: boolean, secheresse: boolean): string {
  return `
    <h2>Nouvelle partie</h2>
    <div class="choix">
      <button class="carteChoix${hasard ? '' : ' actif'}" data-e="carte:scenario">${ico('renommee')}<b>Aïn Tamda</b>La carte du scénario : la source au pied du massif, la piste dans la plaine. Idéale pour une première partie.</button>
      <button class="carteChoix${hasard ? ' actif' : ''}" data-e="carte:hasard">${ico('rotation')}<b>Carte au hasard</b>Un autre relief, une autre orientation, un autre vent dominant. Pour rejouer autrement.</button>
    </div>
    <div class="ligneBoutons" style="margin-top:14px">
      <button class="btn${secheresse ? ' actif' : ''}" data-e="secheresse">${ico('soleil')}Année sèche : source −15 % ${secheresse ? '(activée)' : '(plus difficile)'}</button>
    </div>
    <div class="piedFenetre">
      <button class="btn" data-e="retour">Retour</button>
      <button class="btn principal" data-e="lancer">${ico('lecture')}Commencer</button>
    </div>`;
}

export function htmlPause(): string {
  return `
    <h2>Pause</h2>
    <div class="menuBoutons">
      <button class="btn principal" data-e="reprendre">${ico('lecture')}Reprendre</button>
      <button class="btn" data-e="sauver">${ico('dossier')}Sauvegarder</button>
      <button class="btn" data-e="charger">${ico('dossier')}Charger</button>
      <button class="btn" data-e="reglages">${ico('reglages')}Réglages</button>
      <button class="btn" data-e="aide">${ico('aide')}Comment jouer</button>
      <button class="btn" data-e="principal">${ico('annuler')}Retour au menu principal</button>
    </div>
    <p class="sous" style="font-size:12.5px;margin-top:12px">La partie est sauvegardée automatiquement à chaque nouveau jour et au retour au menu.</p>`;
}

export interface LigneEmplacement {
  slot: string;
  nom: string;
  meta: MetaSauvegarde | null;
  existe: boolean;
  illisible: boolean;
  copie: boolean;
}

export function htmlSauvegardes(mode: 'sauver' | 'charger', lignes: LigneEmplacement[], chemin: string, electron: boolean, message = ''): string {
  let h = `<h2>${mode === 'sauver' ? 'Sauvegarder' : 'Charger une partie'}</h2>`;
  if (message) h += `<div class="erreur">${message}</div>`;
  for (const l of lignes) {
    const auto = l.slot === 'auto';
    let info = 'Emplacement libre';
    if (l.existe && l.illisible) info = 'Fichier illisible' + (l.copie ? ' — une copie de secours existe' : '');
    else if (l.meta) info = `${ech(l.meta.carte)}${l.meta.vocation ? ' · ' + (l.meta.vocation === 'etape' ? 'Étape des caravanes' : 'Grenier du désert') : ''}<small>${resumeMeta(l.meta)}</small><small>${dateLisible(l.meta.dateIso)}</small>`;
    let boutons = '';
    if (mode === 'sauver' && !auto) boutons += `<button class="btn principal" data-e="ecrire:${l.slot}">Sauvegarder ici</button>`;
    if (mode === 'charger' && l.existe && !l.illisible) boutons += `<button class="btn principal" data-e="lire:${l.slot}">Charger</button>`;
    if (mode === 'charger' && l.copie) boutons += `<button class="btn" data-e="lireCopie:${l.slot}" title="Version précédente de cet emplacement">Copie de secours</button>`;
    if (l.existe && !auto) boutons += `<button class="btn danger" data-e="supprimer:${l.slot}">${ico('croix')}</button>`;
    h += `<div class="emplacement"><div class="info"><b>${ech(l.nom)}</b><br>${info}</div>${boutons}</div>`;
  }
  h += `<div class="chemin">Dossier des sauvegardes : ${ech(chemin)}</div>
    <div class="piedFenetre">
      ${electron ? `<button class="btn" data-e="dossier">${ico('dossier')}Ouvrir le dossier</button>` : ''}
      <button class="btn" data-e="retour">Retour</button>
    </div>`;
  return h;
}

export function htmlReglages(r: Reglages, electron: boolean): string {
  const curseur = (cle: string, nom: string, v: number) =>
    `<div class="reglage"><span>${nom}</span><input type="range" min="0" max="100" value="${Math.round(v * 100)}" data-e="volume:${cle}"><b id="val-${cle}">${Math.round(v * 100)}</b></div>`;
  const q = (cle: string, nom: string, detail: string) =>
    `<button class="carteChoix${r.qualite === cle ? ' actif' : ''}" data-e="qualite:${cle}" style="padding:10px"><b style="font-size:15px">${nom}</b><span style="font-size:12.5px">${detail}</span></button>`;
  return `
    <h2>Réglages</h2>
    <h4 style="margin:6px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--encre-douce)">Son</h4>
    ${curseur('general', 'Volume général', r.volumes.general)}
    ${curseur('musique', 'Musique', r.volumes.musique)}
    ${curseur('ambiance', 'Ambiance', r.volumes.ambiance)}
    ${curseur('effets', 'Effets', r.volumes.effets)}
    <h4 style="margin:14px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--encre-douce)">Image</h4>
    <div class="choix" style="grid-template-columns:1fr 1fr 1fr">
      ${q('leger', 'Léger', 'Pour les PC modestes : sans effets, ombres simples.')}
      ${q('equilibre', 'Équilibré', 'Effet maquette, halos de nuit, ombres nettes.')}
      ${q('soigne', 'Soigné', 'Image plus fine et ombres détaillées.')}
    </div>
    <div class="ligneBoutons" style="margin-top:12px">
      <button class="btn${r.afficherIps ? ' actif' : ''}" data-e="ips">Afficher les images par seconde</button>
      ${electron ? `<button class="btn" data-e="pleinEcran">Plein écran (F11)</button>` : ''}
    </div>
    <div class="piedFenetre"><button class="btn principal" data-e="retour">Fermer</button></div>`;
}

export function htmlAide(): string {
  return `
    <h2>Comment jouer</h2>
    <p><b>L’eau est un débit à partager, pas un trésor à amasser.</b> Elle sort de la source, suit vos séguias sans jamais remonter une terrasse, et se perd un peu à chaque case. Celui qui est en amont boit le premier.</p>
    <p><b>Chaque goutte a un prix.</b> Les jardins nourrissent vite mais meurent vite. Les palmeraies sont lentes, robustes, et leur ombre épargne l’eau de leurs voisins. Le bassin fait s’arrêter les caravanes, qui paient, vendent des matériaux et amènent des colons. La citerne garde l’eau pour plus tard.</p>
    <p><b>Tout est annoncé.</b> Caravanes, canicule et tempêtes de sable s’affichent à gauche avant d’arriver : c’est le moment de régler vos répartiteurs, de remplir une citerne ou de planter des brise-vent du côté du vent.</p>
    <div class="touches">
      <kbd>Clic gauche</kbd><span>Poser, tracer en glissant, sélectionner</span>
      <kbd>Clic droit / Échap</kbd><span>Annuler l’outil en cours ; Échap ouvre le menu</span>
      <kbd>Glisser clic droit</kbd><span>Tourner et incliner la vue</span>
      <kbd>Glisser molette</kbd><span>Déplacer la vue (ou glisser clic gauche en mode Sélection)</span>
      <kbd>Molette</kbd><span>Zoom vers le curseur — de près, la vue s’abaisse</span>
      <kbd>Z Q S D / flèches</kbd><span>Déplacer la vue · <b>A</b> et <b>E</b> : tourner</span>
      <kbd>Espace</kbd><span>Pause · <b>1 2 3</b> : vitesses</span>
      <kbd>R</kbd><span>Tourner le bâtiment à poser</span>
      <kbd>Ctrl + Z</kbd><span>Annuler la dernière construction (remboursée, 3 heures de jeu)</span>
      <kbd>X</kbd><span>Outil Effacer · <b>Suppr</b> : démolir la sélection</span>
      <kbd>V / B</kbd><span>Vue de l’eau / vue du vent</span>
      <kbd>F5 / F9</kbd><span>Sauvegarde rapide / chargement rapide (emplacement 1)</span>
      <kbd>F11</kbd><span>Plein écran</span>
    </div>
    <div class="piedFenetre"><button class="btn principal" data-e="retour">Compris</button></div>`;
}

export function htmlJournal(s: GameState): string {
  let h = `<h2>Journal</h2>`;
  if (!s.journal.length) h += `<p>Rien à signaler pour l’instant.</p>`;
  for (let k = s.journal.length - 1; k >= 0; k--) {
    const j = s.journal[k];
    const cal = calendrier(j.pas);
    h += `<div class="annonce${j.ton === 'alerte' ? ' alerte' : ''}"><div><small>Jour ${cal.jour + 1}, ${String(Math.floor(cal.heure)).padStart(2, '0')} h</small>${ech(j.texte)}</div></div>`;
  }
  h += `<div class="piedFenetre"><button class="btn principal" data-e="retour">Fermer</button></div>`;
  return h;
}

export function htmlPalier(): string {
  return `
    <h2>Palier atteint : La première eau</h2>
    <p>L’eau court, les premiers habitants sont installés et une caravane a bu chez vous. Vous recevez <b>30 pièces</b> et <b>15 matériaux</b>.</p>
    <p><b>Nouveaux outils.</b> Le <b>répartiteur</b> se pose sur une jonction de séguias et règle la part de chaque branche. La <b>citerne</b> met de l’eau de côté. La <b>séguia maçonnée</b> perd quatre fois moins. Les <b>brise-vent</b> arrêtent le sable. La <b>foggara</b> peut être prolongée depuis la source.</p>
    <p><b>Ce qui vient.</b> La saison chaude fait baisser la source et monter la soif. Ensuite viendra la saison des vents et sa première tempête de sable. Tout est annoncé à gauche.</p>
    <div class="piedFenetre"><button class="btn principal" data-e="retour">Continuer</button></div>`;
}

export function htmlVocation(): string {
  return `
    <h2>Le relais tient bon. Quelle oasis voulez-vous bâtir ?</h2>
    <p>Ce choix est définitif pour cette partie. Il ouvre des bâtiments différents et change ce qui fait votre renommée. Vous recevez 50 pièces et 25 matériaux.</p>
    <div class="choix">
      <button class="carteChoix" data-e="vocation:etape">${ico('caravane')}<b>Étape des caravanes</b>
        <ul><li>Renommée des caravanes × 1,5</li><li>Paiements × 1,25</li><li><b>Hammam</b> : paiements × 1,4</li><li><b>Fanal</b> : caravanes plus fréquentes</li></ul>
        Il faudra de grandes réserves d’eau au bon moment.</button>
      <button class="carteChoix" data-e="vocation:grenier">${ico('palmeraie')}<b>Grenier du désert</b>
        <ul><li>Renommée de la verdure et des dattes × 1,5</li><li>Récoltes × 1,25</li><li><b>Séchoir</b> : dattes vendues plus cher</li><li><b>Noria</b> : irriguer les terrasses hautes</li></ul>
        Il faudra de l’eau régulière, de l’ombre et des bras.</button>
    </div>`;
}

export function htmlVictoire(s: GameState, renommee: number): string {
  const cal = calendrier(s.pas);
  const st = s.stats;
  const d = (nom: string, v: string) => `<div class="donnee"><span>${nom}</span><b>${v}</b></div>`;
  const total = st.eauInjectee || 1;
  const ren = detailRenommee(s);
  return `
    <h2>L’oasis renommée</h2>
    <p>On parle d’${ech(s.options.nomCarte)} d’un bout à l’autre de la piste. Vous avez atteint ${renommee} de renommée au jour ${cal.jour + 1}, en ${s.progression.vocation === 'etape' ? 'étape des caravanes' : 'grenier du désert'}.</p>
    <div class="bilan">
      ${d('Habitants', String(population(s)))}
      ${d('Jour de la victoire', String(Math.floor(s.progression.victoirePas / PAS_PAR_JOUR) + 1))}
      ${d('Caravanes bien abreuvées', String(st.caravanesServies))}
      ${d('Caravanes mal reçues ou perdues', String(st.caravanesPartielles + st.caravanesManquees))}
      ${d('Dattes vendues', String(st.dattesVendues))}
      ${d('Récoltes', String(st.recoltes))}
      ${d('Jardins perdus', String(st.jardinsPerdus))}
      ${d('Palmeraies perdues', String(st.palmiersPerdus))}
      ${d('Eau utile', Math.round((100 * st.eauUtile) / total) + ' %')}
      ${d('Eau évaporée ou perdue', Math.round((100 * (st.eauEvaporee + st.eauDeversee)) / total) + ' %')}
      ${d('Renommée des caravanes', String(Math.round(ren.caravanes)))}
      ${d('Renommée des cultures', String(Math.round(ren.verdure + ren.palmeraies + ren.dattes)))}
    </div>
    <p>Notez ces chiffres : l’autre vocation, une carte au hasard ou une année sèche donnent une tout autre partie. Cible : ${B.renommeeVictoire} de renommée.</p>
    <div class="piedFenetre">
      <button class="btn" data-e="principal">Menu principal</button>
      <button class="btn principal" data-e="retour">${ico('lecture')}Continuer en mode libre</button>
    </div>`;
}

export function htmlErreur(titre: string, message: string, copie: boolean): string {
  return `
    <h2>${ech(titre)}</h2>
    <div class="erreur">${ech(message)}</div>
    <p>${copie ? 'Une copie de secours (la version précédente de cet emplacement) est disponible.' : 'Aucune copie de secours n’existe pour cet emplacement.'}</p>
    <div class="piedFenetre">
      <button class="btn" data-e="retour">Retour</button>
      ${copie ? `<button class="btn principal" data-e="copie">Charger la copie de secours</button>` : ''}
    </div>`;
}

export function htmlConfirmer(titre: string, texte: string, oui: string): string {
  return `<h2>${ech(titre)}</h2><p>${ech(texte)}</p>
    <div class="piedFenetre"><button class="btn" data-e="non">Annuler</button><button class="btn principal" data-e="oui">${ech(oui)}</button></div>`;
}
