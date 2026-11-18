/**
 * Renommée, paliers et objectifs.
 */
import { B } from './balance';
import { cacheDe, type Cache } from './cache';
import { calendrier, journal, population } from './etat';
import type { Evenement, GameState } from './types';

export function batimentActif(s: GameState, kind: string, eauMin = 0): boolean {
  for (const b of s.batiments) {
    if (b.kind === kind && b.chantier >= 1 && !b.pause && b.personnel >= 0.5 && b.eauRatio >= eauMin) return true;
  }
  return false;
}

export interface DetailRenommee {
  total: number;
  caravanes: number;
  habitants: number;
  verdure: number;
  dattes: number;
  palmeraies: number;
}

/** Nombre de cases verdoyantes, recompté à partir des grilles (ne dépend d'aucun cache). */
export function compterCasesVertes(s: GameState): number {
  const { sol } = s.carte;
  let n = 0;
  for (let i = 0; i < s.humidite.length; i++) {
    if (s.humidite[i] >= B.seuilVert && s.sable[i] < 0.5 && (sol[i] === 0 || sol[i] === 1)) n++;
  }
  return n;
}

export function detailRenommee(s: GameState, c: Cache = cacheDe(s)): DetailRenommee {
  c.casesVertes = compterCasesVertes(s);
  const voc = s.progression.vocation;
  const fEtape = voc === 'etape' ? B.vocationBonus : 1;
  const fGrenier = voc === 'grenier' ? B.vocationBonus : 1;
  let palmeraies = 0;
  for (const b of s.batiments) {
    if (b.kind === 'palmeraie' && b.chantier >= 1 && b.croissance >= B.palmeraieMature && b.sante > 0) palmeraies++;
  }
  const sechoir = batimentActif(s, 'sechoir');
  const caravanes = Math.max(0, s.renommeeCaravanes) * fEtape;
  const habitants = population(s) * B.renommeeParHabitant;
  const verdure = c.casesVertes * B.renommeeParCaseVerte * fGrenier;
  const dattes =
    s.stats.dattesVendues * (B.renommeeParDatteVendue + (sechoir ? B.renommeeSechoirParDatte : 0)) * fGrenier;
  const palm = palmeraies * B.renommeeParPalmeraie * fGrenier;
  return {
    total: Math.floor(caravanes + habitants + verdure + dattes + palm),
    caravanes,
    habitants,
    verdure,
    dattes,
    palmeraies: palm,
  };
}

export interface Objectif {
  id: string;
  texte: string;
  valeur: number;
  cible: number;
  fait: boolean;
}

export const NOM_PALIER = ['La première eau', 'Le relais', "L'oasis renommée", 'Mode libre'] as const;

/** Part des cases de séguia qui ne sont pas ensablées. */
export function partCanauxDegages(s: GameState): number {
  let total = 0;
  let nets = 0;
  for (let i = 0; i < s.canal.length; i++) {
    if (!s.canal[i]) continue;
    total++;
    if (s.sable[i] < 0.3) nets++;
  }
  return total ? nets / total : 1;
}

export function partReseauEnEau(s: GameState, c: Cache = cacheDe(s)): number {
  let total = 0;
  let enEau = 0;
  for (let i = 0; i < s.canal.length; i++) {
    if (!s.canal[i]) continue;
    total++;
    if (c.debit[i] > 0.3) enEau++;
  }
  return total ? enEau / total : 0;
}

export function objectifs(s: GameState, c: Cache = cacheDe(s)): Objectif[] {
  const o = (id: string, texte: string, valeur: number, cible: number): Objectif => ({
    id,
    texte,
    valeur: Math.min(valeur, cible),
    cible,
    fait: valeur >= cible,
  });
  const pop = population(s);
  const p = s.progression.palier;
  if (p === 0) {
    let jardinIrrigue = 0;
    let fontaine = 0;
    for (const b of s.batiments) {
      if (b.kind === 'jardin' && b.chantier >= 1 && !b.pause && b.eauRatio >= 0.8) jardinIrrigue = 1;
      if (b.kind === 'fontaine' && b.chantier >= 1 && b.eauRatio >= 0.5) fontaine = 1;
    }
    return [
      o('jardin', 'Irriguer un jardin', jardinIrrigue, 1),
      o('fontaine', 'Alimenter une fontaine', fontaine, 1),
      o('habitants', 'Loger 10 habitants', pop, 10),
      o('caravane', 'Abreuver une caravane', s.stats.caravanesServies + s.stats.caravanesPartielles, 1),
    ];
  }
  if (p === 1) {
    let jardins = 0;
    let palmeraies = 0;
    for (const b of s.batiments) {
      if (b.kind === 'jardin' && b.chantier >= 1 && b.sante > 0 && !b.pause) jardins++;
      if (b.kind === 'palmeraie' && b.chantier >= 1 && b.croissance >= B.palmeraieMature && b.sante > 0) palmeraies++;
    }
    const cal = calendrier(s.pas);
    return [
      o('chaude', 'Passer la première saison chaude', Math.min(cal.jour, 10), 10),
      o('jardins', 'Garder 3 jardins en vie', jardins, 3),
      o('palmeraies', 'Faire grandir 2 palmeraies', palmeraies, 2),
      o('habitants', 'Loger 18 habitants', pop, 18),
      o('caravanes', 'Bien abreuver 3 caravanes', s.stats.caravanesServies, 3),
    ];
  }
  if (p === 2) {
    const ren = detailRenommee(s, c).total;
    return [
      o('tempete', 'Essuyer la grande tempête (an 2, saison des vents)', s.progression.grandeTempetePassee ? 1 : 0, 1),
      o('reseau', 'Dégager les séguias après la tempête (90 %)', Math.floor(partCanauxDegages(s) * 100), 90),
      o('renommee', `Atteindre ${B.renommeeVictoire} de renommée`, ren, B.renommeeVictoire),
    ];
  }
  return [];
}

/** Conseil du moment pendant le premier palier (dérivé de l'état, rien à sauvegarder). */
export function conseil(s: GameState): string {
  if (s.progression.palier !== 0) return '';
  let nbCanal = 0;
  for (let i = 0; i < s.canal.length; i++) if (s.canal[i]) nbCanal++;
  const a = (k: string) => s.batiments.some((b) => b.kind === k);
  const fini = (k: string) => s.batiments.some((b) => b.kind === k && b.chantier >= 1);
  if (nbCanal < 4) return 'Choisissez l’outil Séguia et tracez un canal en glissant depuis la sortie de la source.';
  if (!a('jardin')) return 'Posez un jardin contre la séguia : il s’y branche tout seul.';
  if (!s.batiments.some((b) => b.kind === 'jardin' && b.eauRatio >= 0.8 && b.chantier >= 1)) {
    return 'L’eau doit atteindre le jardin : prolongez la séguia jusqu’à lui, sans jamais remonter.';
  }
  if (!a('fontaine')) return 'Construisez une fontaine contre un canal : elle donne l’eau potable aux maisons voisines.';
  if (s.batiments.filter((b) => b.kind === 'maison').length < 3) return 'Bâtissez des maisons à moins de 7 cases de la fontaine.';
  if (!a('bassin')) return 'Bâtissez le bassin des caravanes près de la piste, puis amenez-y une séguia.';
  if (!fini('bassin')) return 'Le bassin est en chantier. Vérifiez qu’une séguia en eau le touche.';
  if (s.stats.caravanesServies + s.stats.caravanesPartielles < 1) {
    return 'Une caravane approche : il lui faut de l’eau dans le bassin à son arrivée.';
  }
  return 'Logez 10 habitants : il faut des vivres, des maisons et une fontaine en eau.';
}

/** Vérifie les objectifs et fait avancer les paliers. */
export function avancerProgression(s: GameState, ev: Evenement[]) {
  const c = cacheDe(s);
  c.renommee = detailRenommee(s, c).total;
  const pr = s.progression;
  if (pr.palier === 3) return;
  if (pr.choixVocationEnAttente) {
    // rappel tant que le choix n'est pas fait (une partie rechargée ne reste jamais bloquée)
    ev.push({ type: 'choix_vocation', caseI: -1, id: 0, valeur: 1, texte: 'Le relais' });
    return;
  }
  const obj = objectifs(s, c);
  if (obj.length === 0 || !obj.every((x) => x.fait)) return;
  if (pr.palier === 0) {
    pr.palier = 1;
    s.res.pieces += 30;
    s.res.materiaux += 15;
    journal(s, 'bien', 'Palier atteint : La première eau. Répartiteur, citerne, séguia maçonnée et brise-vent disponibles.');
    ev.push({ type: 'palier', caseI: -1, id: 1, valeur: 1, texte: 'La première eau' });
  } else if (pr.palier === 1) {
    pr.choixVocationEnAttente = true;
    journal(s, 'bien', 'Palier atteint : Le relais. Choisissez la vocation de l’oasis.');
    ev.push({ type: 'choix_vocation', caseI: -1, id: 0, valeur: 0, texte: 'Le relais' });
  } else if (pr.palier === 2) {
    pr.palier = 3;
    pr.victoirePas = s.pas;
    journal(s, 'bien', 'L’oasis est renommée dans tout le désert. La partie continue en mode libre.');
    ev.push({ type: 'victoire', caseI: -1, id: 0, valeur: c.renommee, texte: "L'oasis renommée" });
  }
}
