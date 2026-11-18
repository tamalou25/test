/**
 * Outils communs aux bots de stratégie : ils jouent par les mêmes commandes que le joueur.
 */
import {
  appliquer,
  avancer,
  B,
  BATIMENTS,
  cacheDe,
  calendrier,
  creerPartie,
  cx,
  cz,
  dans,
  detailRenommee,
  idx,
  N,
  objectifs,
  partReseauEnEau,
  population,
  topologie,
  verifierConstruction,
  PAS_PAR_JOUR,
  type BatimentKind,
  type Commande,
  type Dir,
  type Evenement,
  type GameState,
  type Resultat,
} from '../../src/sim';

export interface Partie {
  s: GameState;
  /** événements marquants relevés */
  faits: string[];
  compte: Record<string, number>;
  /** si présent, toutes les commandes émises y sont consignées avec le pas où elles ont été appliquées */
  journalCommandes?: { pas: number; cmd: Commande }[];
}

export function nouvellePartie(graine: number, secheresse = false): Partie {
  return { s: creerPartie(graine, { secheresse }), faits: [], compte: {} };
}

export function cmd(p: Partie, c: Commande): Resultat {
  if (p.journalCommandes) p.journalCommandes.push({ pas: p.s.pas, cmd: c });
  return appliquer(p.s, c);
}

/** Avance de n pas en relevant les événements. */
export function pas(p: Partie, n: number, surEvenement?: (e: Evenement) => void) {
  for (let k = 0; k < n; k++) {
    const r = avancer(p.s);
    for (const e of r.evenements) {
      p.compte[e.type] = (p.compte[e.type] ?? 0) + 1;
      if (surEvenement) surEvenement(e);
      if (
        e.type === 'palier' ||
        e.type === 'choix_vocation' ||
        e.type === 'victoire' ||
        e.type === 'jardin_perdu' ||
        e.type === 'palmier_perdu' ||
        e.type === 'caravane_passe' ||
        e.type === 'famine'
      ) {
        const cal = calendrier(p.s.pas);
        p.faits.push(`j${cal.jour} ${cal.heure.toFixed(0)}h ${e.type} ${e.texte}`);
      }
    }
  }
}

/** Cases d'un tracé en L de (x0,z0) à (x1,z1) : d'abord en x puis en z, ou l'inverse. */
export function traceL(x0: number, z0: number, x1: number, z1: number, zDabord = false): number[] {
  const r: number[] = [];
  let x = x0;
  let z = z0;
  r.push(idx(x, z));
  const allerX = () => {
    while (x !== x1) {
      x += x1 > x ? 1 : -1;
      r.push(idx(x, z));
    }
  };
  const allerZ = () => {
    while (z !== z1) {
      z += z1 > z ? 1 : -1;
      r.push(idx(x, z));
    }
  };
  if (zDabord) {
    allerZ();
    allerX();
  } else {
    allerX();
    allerZ();
  }
  return r;
}

export function canal(p: Partie, cases: number[], type: 1 | 2 = 1): Resultat {
  return cmd(p, { t: 'canal', cases, type });
}

/**
 * Pose un bâtiment au plus près de (x, z), à un emplacement valide.
 * Si `raccorde`, exige que le bâtiment touche une séguia où l'eau peut arriver.
 */
export function poserPres(
  p: Partie,
  kind: BatimentKind,
  x: number,
  z: number,
  rayon = 8,
  raccorde = true,
): number {
  const def = BATIMENTS[kind];
  for (let r = 0; r <= rayon; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const rot of [0, 1] as Dir[]) {
          const v = verifierConstruction(p.s, kind, x + dx, z + dz, rot);
          if (!v.ok) continue;
          if (raccorde && (def.branche || kind === 'maison') && v.avertissement) continue;
          const res = cmd(p, { t: 'construire', kind, x: x + dx, z: z + dz, rot });
          if (res.ok) return res.id!;
        }
      }
    }
  }
  return 0;
}

export function nb(p: Partie, kind: BatimentKind, finis = false): number {
  return p.s.batiments.filter((b) => b.kind === kind && (!finis || b.chantier >= 1)).length;
}

export function resume(p: Partie) {
  const s = p.s;
  const c = cacheDe(s);
  const cal = calendrier(s.pas);
  const ren = detailRenommee(s, c);
  const eauTotale = s.stats.eauInjectee || 1;
  return {
    jour: cal.jour,
    an: cal.annee + 1,
    palier: s.progression.palier,
    vocation: s.progression.vocation ?? '-',
    habitants: population(s),
    pieces: Math.round(s.res.pieces),
    materiaux: Math.round(s.res.materiaux),
    vivres: Math.round(s.res.vivres),
    dattes: Math.round(s.res.dattes),
    renommee: ren.total,
    renCaravanes: Math.round(ren.caravanes),
    renVerdure: Math.round(ren.verdure + ren.palmeraies),
    renDattes: Math.round(ren.dattes),
    casesVertes: c.casesVertes,
    caravanesServies: s.stats.caravanesServies,
    caravanesPartielles: s.stats.caravanesPartielles,
    caravanesManquees: s.stats.caravanesManquees,
    dattesVendues: s.stats.dattesVendues,
    jardinsPerdus: s.stats.jardinsPerdus,
    palmiersPerdus: s.stats.palmiersPerdus,
    habitantsPartis: s.stats.habitantsPartis,
    eauUtilePct: Math.round((100 * s.stats.eauUtile) / eauTotale),
    eauEvaporeePct: Math.round((100 * s.stats.eauEvaporee) / eauTotale),
    eauDeverseePct: Math.round((100 * s.stats.eauDeversee) / eauTotale),
    reseauEnEauPct: Math.round(partReseauEnEau(s, c) * 100),
    victoireJour: s.progression.victoirePas >= 0 ? Math.floor(s.progression.victoirePas / PAS_PAR_JOUR) : -1,
  };
}

export { B, BATIMENTS, N, PAS_PAR_JOUR, cacheDe, calendrier, cx, cz, dans, idx, objectifs, population, topologie };
