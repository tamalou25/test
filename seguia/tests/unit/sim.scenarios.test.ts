import { describe, expect, it } from 'vitest';
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
  detailRenommee,
  GRAINE_SCENARIO,
  idx,
  N,
  NN,
  partCanauxDegages,
  PAS_PAR_JOUR,
  population,
  verifierConstruction,
  type BatimentKind,
  type GameState,
} from '../../src/sim';
import { rngCreer, rngEntier, rngSuivant } from '../../src/sim/rng';
import { jouer } from '../bots/strategies';
import { resume, traceL } from '../bots/lib';

function invariants(s: GameState) {
  const c = cacheDe(s);
  for (const k of ['pieces', 'materiaux', 'vivres', 'dattes'] as const) {
    expect(Number.isFinite(s.res[k])).toBe(true);
    expect(s.res[k]).toBeGreaterThanOrEqual(-1e-6);
  }
  for (let i = 0; i < NN; i++) {
    const h = s.humidite[i];
    const sa = s.sable[i];
    if (!(h >= 0 && h <= 1) || !(sa >= 0 && sa <= 1)) throw new Error(`grille hors bornes case ${i} : ${h} ${sa}`);
    if (!(s.clotureEtat[i] >= 0 && s.clotureEtat[i] <= 1)) throw new Error('état de clôture hors bornes');
  }
  let dernier = 0;
  for (const b of s.batiments) {
    expect(b.id).toBeGreaterThan(dernier);
    dernier = b.id;
    for (const v of [b.stock, b.croissance, b.sante, b.eauRatio, b.personnel, b.chantier, b.habitants]) {
      if (!Number.isFinite(v)) throw new Error(`valeur non finie sur ${b.kind} ${b.id}`);
    }
    expect(b.stock).toBeGreaterThanOrEqual(0);
    expect(b.habitants).toBeGreaterThanOrEqual(0);
    expect(b.habitants).toBeLessThanOrEqual(B.maisonCapacite);
    expect(b.sante).toBeGreaterThanOrEqual(0);
    expect(b.sante).toBeLessThanOrEqual(1);
    expect(b.croissance).toBeLessThanOrEqual(1 + 1e-9);
    if (b.kind === 'bassin') expect(b.stock).toBeLessThanOrEqual(B.bassinCapacite + 1e-6);
    if (b.kind === 'citerne') expect(b.stock).toBeLessThanOrEqual(B.citerneCapacite + 1e-6);
  }
  const bil = c.bilan;
  expect(Math.abs(bil.injecte - (bil.evapore + bil.consomme + bil.deverse))).toBeLessThanOrEqual(1e-8 * Math.max(1, bil.injecte));
  expect(population(s)).toBeGreaterThanOrEqual(2);
  expect(s.caravanes.length).toBeLessThan(8);
  expect(s.meteo.length).toBeLessThan(12);
  expect(s.journal.length).toBeLessThanOrEqual(40);
  expect(s.annulables.length).toBeLessThanOrEqual(24);
}

describe('stratégies comparées (même carte, même graine)', () => {
  const etape = jouer('etape', GRAINE_SCENARIO, 40);
  const grenier = jouer('grenier', GRAINE_SCENARIO, 40);
  const neglige = jouer('negligent', GRAINE_SCENARIO, 40);
  const e = resume(etape);
  const g = resume(grenier);
  const n = resume(neglige);

  it('les deux vocations mènent à la victoire, par des chemins visiblement différents', () => {
    expect(e.palier).toBe(3);
    expect(g.palier).toBe(3);
    expect(e.victoireJour).toBeGreaterThanOrEqual(28); // jamais avant la grande tempête
    expect(g.victoireJour).toBeGreaterThanOrEqual(28);
    // l'étape vit des caravanes, le grenier des dattes et de la verdure
    expect(e.renCaravanes).toBeGreaterThan(g.renCaravanes * 1.4);
    expect(g.renDattes + g.renVerdure).toBeGreaterThan((e.renDattes + e.renVerdure) * 2.5);
    expect(g.dattesVendues).toBeGreaterThan(e.dattesVendues * 1.8);
    expect(e.caravanesServies).toBeGreaterThan(g.caravanesServies);
    expect(g.casesVertes).toBeGreaterThan(e.casesVertes);
  });

  it('ne rien régler coûte cher : pas de victoire au jour 40, plus d’eau évaporée, moins de caravanes bien reçues', () => {
    expect(n.palier).toBeLessThan(3);
    expect(n.renommee).toBeLessThan(Math.min(e.renommee, g.renommee) - 15);
    expect(n.eauEvaporeePct).toBeGreaterThan(e.eauEvaporeePct + 5);
    expect(n.caravanesServies).toBeLessThan(e.caravanesServies);
  });

  it('les états restent sains du début à la fin', () => {
    invariants(etape.s);
    invariants(grenier.s);
    invariants(neglige.s);
  });
});

describe('crise et rétablissement', () => {
  /** Oasis simple, puis grande tempête sans aucun brise-vent. */
  function oasisEnsablee(): GameState {
    const s = creerPartie(GRAINE_SCENARIO);
    s.res.pieces = 5000;
    s.res.materiaux = 5000;
    s.res.vivres = 5000;
    s.progression.palier = 2;
    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx, sz + 12), type: 1 });
    appliquer(s, { t: 'canal', cases: traceL(sx, sz + 2, sx + 10, sz + 2), type: 1 });
    // plein emploi : autant de postes aux champs que de bras, donc aucun ouvrier libre pour curer
    for (let k = 0; k < 5; k++) {
      appliquer(s, { t: 'construire', kind: 'jardin', x: sx + 1 + k * 2, z: sz + 3, rot: 0 });
      appliquer(s, { t: 'construire', kind: k < 3 ? 'jardin' : 'palmeraie', x: sx + 1 + k * 2, z: sz, rot: 0 });
      if (k < 4) appliquer(s, { t: 'construire', kind: 'maison', x: sx - 3, z: sz + 2 + k * 2, rot: 0 });
    }
    appliquer(s, { t: 'construire', kind: 'fontaine', x: sx - 1, z: sz + 4, rot: 0 });
    for (const b of s.batiments) {
      b.chantier = 1;
      if (b.kind === 'maison') b.habitants = 4;
    }
    cacheDe(s).topoSale = true;
    for (let k = 0; k < 200; k++) avancer(s);
    // on se place une heure avant la grande tempête de l'an 2
    const tempete = () => s.meteo.find((m) => m.type === 'tempete' && m.grande);
    while (!tempete()) avancer(s);
    while (s.pas < tempete()!.debutPas - 20) avancer(s);
    return s;
  }

  function apresTempete(s: GameState): number {
    const fin = s.meteo.find((m) => m.type === 'tempete' && m.grande)!.finPas;
    while (s.pas <= fin) avancer(s);
    return fin;
  }

  it('la tempête ensable le réseau et affame l’aval ; la corvée le rétablit bien plus vite que l’attente', () => {
    const attente = oasisEnsablee();
    const sx = cx(attente.carte.sourceCase);
    const sz = cz(attente.carte.sourceCase);
    const boutBranche = idx(sx + 4, sz + 2); // au milieu de la branche de cultures
    const debitAvant = cacheDe(attente).debit[boutBranche];
    expect(debitAvant).toBeGreaterThan(3);
    apresTempete(attente);
    // effet visible : séguias ensablées, débit effondré au bout de la branche
    expect(partCanauxDegages(attente)).toBeLessThan(0.6);
    expect(cacheDe(attente).debit[boutBranche]).toBeLessThan(debitAvant * 0.5);

    const corvee = oasisEnsablee();
    apresTempete(corvee);
    appliquer(corvee, { t: 'corvee', on: true });

    const delai = (s: GameState) => {
      const depart = s.pas;
      while (partCanauxDegages(s) < 0.9 && s.pas - depart < PAS_PAR_JOUR * 12) avancer(s);
      return (s.pas - depart) / PAS_PAR_JOUR;
    };
    const joursCorvee = delai(corvee);
    const joursAttente = delai(attente);
    expect(cacheDe(attente).ouvriersLibres).toBeLessThanOrEqual(1);
    expect(joursCorvee).toBeLessThan(1);
    expect(joursAttente).toBeGreaterThan(joursCorvee * 3);
    // une fois dégagé, l'eau revient au bout de la branche
    appliquer(corvee, { t: 'corvee', on: false });
    for (let k = 0; k < 40; k++) avancer(corvee);
    expect(cacheDe(corvee).debit[boutBranche]).toBeGreaterThan(debitAvant * 0.8);
  });

  it('des brise-vent posés avant la tempête évitent l’ensablement', () => {
    const nu = oasisEnsablee();
    const abrite = oasisEnsablee();
    const sx = cx(abrite.carte.sourceCase);
    const sz = cz(abrite.carte.sourceCase);
    const vent = abrite.carte.ventDominant; // sud : on protège le côté sud de la branche et l'est/ouest ne compte pas
    expect(vent).toBe(2);
    const cases: number[] = [];
    // clôture au sud des jardins qui bordent la branche (deux cases plus au sud que les parcelles)
    for (let x = sx; x <= sx + 11; x++) cases.push(idx(x, sz + 5));
    const r = appliquer(abrite, { t: 'cloture', cases, type: 1 });
    expect(r.ok).toBe(true);
    apresTempete(nu);
    apresTempete(abrite);
    let sableNu = 0;
    let sableAbrite = 0;
    for (let x = sx + 1; x <= sx + 10; x++) {
      sableNu += nu.sable[idx(x, sz + 2)];
      sableAbrite += abrite.sable[idx(x, sz + 2)];
    }
    expect(sableAbrite).toBeLessThan(sableNu * 0.35);
  });
});

describe('endurance', () => {
  it('10 années accélérées avec des actions tirées au hasard : aucun blocage, aucune valeur incohérente', () => {
    const rng = rngCreer(4242, 7);
    const kinds = Object.keys(BATIMENTS).filter((k) => BATIMENTS[k as BatimentKind].constructible) as BatimentKind[];
    let tours = 0;
    let poses = 0;
    const p = jouer('negligent', GRAINE_SCENARIO, 150, {
      apresTour: (q) => {
        const s = q.s;
        tours++;
        if (tours % 6 === 0) invariants(s);
        // un joueur brouillon : il construit, trace, efface, règle et démolit au hasard
        const tirage = rngSuivant(rng);
        // le joueur brouillon reçoit de quoi essayer tous les bâtiments
        s.res.pieces += 4;
        s.res.materiaux += 1.5;
        let x = rngEntier(rng, 1, N - 3);
        let z = rngEntier(rng, 1, N - 3);
        if (rngSuivant(rng) < 0.7) {
          // le plus souvent près d'une séguia existante
          const canaux: number[] = [];
          for (let i = 0; i < NN; i += 3) if (s.canal[i]) canaux.push(i);
          if (canaux.length) {
            const i = canaux[rngEntier(rng, 0, canaux.length - 1)];
            x = Math.max(1, Math.min(N - 4, cx(i) + rngEntier(rng, -3, 2)));
            z = Math.max(1, Math.min(N - 4, cz(i) + rngEntier(rng, -3, 2)));
          }
        }
        if (tirage < 0.12) {
          const kind = kinds[rngEntier(rng, 0, kinds.length - 1)];
          if (verifierConstruction(s, kind, x, z, 0).ok && appliquer(s, { t: 'construire', kind, x, z, rot: rngEntier(rng, 0, 3) as 0 }).ok) poses++;
        } else if (tirage < 0.16) {
          appliquer(s, { t: 'canal', cases: traceL(x, z, x + rngEntier(rng, -4, 4), z + rngEntier(rng, -4, 4)).filter((i) => i >= 0 && i < NN), type: rngSuivant(rng) < 0.5 ? 1 : 2 });
        } else if (tirage < 0.18) {
          appliquer(s, { t: 'cloture', cases: traceL(x, z, Math.min(N - 1, x + 3), z), type: rngSuivant(rng) < 0.5 ? 1 : 2 });
        } else if (tirage < 0.195) {
          appliquer(s, { t: 'effacer', cases: traceL(x, z, Math.min(N - 1, x + 2), Math.min(N - 1, z + 2)) });
        } else if (tirage < 0.21 && s.batiments.length > 6) {
          const b = s.batiments[rngEntier(rng, 2, s.batiments.length - 1)];
          if (b.kind !== 'maison') appliquer(s, { t: 'demolir', id: b.id });
        } else if (tirage < 0.24) {
          const b = s.batiments[rngEntier(rng, 0, s.batiments.length - 1)];
          if (b.kind === 'repartiteur') appliquer(s, { t: 'poids', id: b.id, poids: [rngEntier(rng, 0, 3), rngEntier(rng, 0, 3), rngEntier(rng, 0, 3), rngEntier(rng, 0, 3)] });
          else if (b.kind === 'citerne') appliquer(s, { t: 'vanne', id: b.id, vanne: rngEntier(rng, 0, 2) as 0 });
          else appliquer(s, { t: 'pause', id: b.id, pause: rngSuivant(rng) < 0.5 });
        } else if (tirage < 0.245) {
          appliquer(s, { t: 'corvee', on: !s.corvee });
        } else if (tirage < 0.25) {
          appliquer(s, { t: 'annuler' });
        } else if (tirage < 0.255) {
          appliquer(s, { t: 'foggara' });
        }
      },
    });
    const s = p.s;
    invariants(s);
    const cal = calendrier(s.pas);
    expect(cal.annee).toBe(10);
    expect(poses).toBeGreaterThan(20);
    // le monde vit encore : de l'eau coule, des caravanes passent, la météo est programmée
    expect(cacheDe(s).bilan.injecte).toBeGreaterThan(20);
    expect(s.stats.caravanesServies + s.stats.caravanesPartielles + s.stats.caravanesManquees).toBeGreaterThan(40);
    expect(s.meteoAnneeProgrammee).toBe(10);
    expect(Number.isFinite(detailRenommee(s).total)).toBe(true);
  });
});
