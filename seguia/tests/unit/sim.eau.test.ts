import { describe, expect, it } from 'vitest';
import {
  appliquer,
  avancer,
  B,
  cacheDe,
  creerPartie,
  cx,
  cz,
  GRAINE_SCENARIO,
  idx,
  N,
  NN,
  Sol,
  topologie,
  verifierConstruction,
  type BatimentKind,
  type GameState,
} from '../../src/sim';
import { rngCreer, rngEntier, rngSuivant } from '../../src/sim/rng';
import { traceL } from '../bots/lib';

function riche(s: GameState) {
  s.res.pieces = 1e6;
  s.res.materiaux = 1e6;
  s.res.vivres = 1e6;
  s.progression.palier = 3;
  s.progression.vocation = 'grenier';
}

function bilanOk(s: GameState) {
  const b = cacheDe(s).bilan;
  const sorties = b.evapore + b.consomme + b.deverse;
  expect(Math.abs(b.injecte - sorties)).toBeLessThanOrEqual(1e-9 * Math.max(1, b.injecte));
}

function stocks(s: GameState): number {
  let t = 0;
  for (const b of s.batiments) if (b.kind === 'bassin' || b.kind === 'citerne' || b.kind === 'noria') t += b.stock;
  return t;
}

describe("solveur d'eau", () => {
  it('conserve l’eau à chaque pas sur le scénario de base', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx, sz + 12), type: 1 });
    appliquer(s, { t: 'construire', kind: 'jardin', x: sx + 1, z: sz + 1, rot: 0 });
    for (let k = 0; k < 600; k++) {
      avancer(s);
      bilanOk(s);
    }
    expect(cacheDe(s).bilan.injecte).toBeGreaterThan(50);
  });

  it('l’eau ne remonte jamais une terrasse', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    riche(s);
    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    // une marche plus haute au milieu du tracé : l'eau s'arrête à son pied
    s.carte.elev[idx(sx, sz + 3)] = 3;
    appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx, sz + 6), type: 1 });
    for (let k = 0; k < 20; k++) avancer(s);
    const c = topologie(s);
    expect(c.rang[idx(sx, sz + 2)]).toBeGreaterThanOrEqual(0);
    expect(c.debit[idx(sx, sz + 2)]).toBeGreaterThan(0);
    expect(c.rang[idx(sx, sz + 3)]).toBe(-1);
    expect(c.debit[idx(sx, sz + 3)]).toBe(0);
    expect(c.debit[idx(sx, sz + 5)]).toBe(0);
    // toute l'eau se déverse au pied de la marche
    expect(c.deverse[idx(sx, sz + 2)]).toBeGreaterThan(50);
    bilanOk(s);
    // en contournant la marche par des cases de même niveau, l'eau repart
    appliquer(s, { t: 'canal', cases: traceL(sx, sz + 2, sx + 1, sz + 4), type: 1 });
    appliquer(s, { t: 'canal', cases: traceL(sx + 1, sz + 4, sx, sz + 4), type: 1 });
    for (let k = 0; k < 3; k++) avancer(s);
    expect(c.debit[idx(sx, sz + 5)]).toBeGreaterThan(0);
    bilanOk(s);
  });

  it('sert l’amont d’abord quand l’eau manque', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    riche(s);
    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx + 30, sz + 2, true), type: 2 });
    const ids: number[] = [];
    for (let k = 0; k < 13; k++) {
      for (const dz of [1, -2]) {
        const r = appliquer(s, { t: 'construire', kind: 'jardin', x: sx + 1 + k * 2, z: sz + 2 + dz, rot: 0 });
        if (r.ok) ids.push(r.id!);
      }
    }
    expect(ids.length).toBeGreaterThan(18);
    for (const b of s.batiments) if (b.kind === 'jardin') b.chantier = 1;
    appliquer(s, { t: 'effacer', cases: [] });
    for (let k = 0; k < 5; k++) avancer(s);
    const jardins = s.batiments.filter((b) => b.kind === 'jardin');
    const c = topologie(s);
    jardins.sort((a, b) => c.rang[c.branchement.get(a.id)!] - c.rang[c.branchement.get(b.id)!]);
    expect(jardins[0].eauRatio).toBe(1);
    expect(jardins[jardins.length - 1].eauRatio).toBeLessThan(0.05);
    // jamais un jardin aval mieux servi qu'un jardin amont
    for (let k = 1; k < jardins.length; k++) expect(jardins[k].eauRatio).toBeLessThanOrEqual(jardins[k - 1].eauRatio + 1e-9);
    bilanOk(s);
  });

  it('le répartiteur partage selon les poids', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    riche(s);
    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx, sz + 6), type: 2 });
    appliquer(s, { t: 'canal', cases: traceL(sx, sz + 3, sx + 4, sz + 3), type: 2 });
    const r = appliquer(s, { t: 'construire', kind: 'repartiteur', x: sx, z: sz + 3, rot: 0 });
    expect(r.ok).toBe(true);
    const rep = s.batiments.find((b) => b.kind === 'repartiteur')!;
    rep.chantier = 1;
    appliquer(s, { t: 'poids', id: rep.id, poids: [0, 3, 1, 0] });
    appliquer(s, { t: 'effacer', cases: [] });
    cacheDe(s).topoSale = true;
    for (let k = 0; k < 3; k++) avancer(s);
    const c = cacheDe(s);
    const est = c.debit[idx(sx + 1, sz + 3)];
    const sud = c.debit[idx(sx, sz + 4)];
    expect(est / sud).toBeCloseTo(3, 6);
    // branche fermée : plus rien ne passe
    appliquer(s, { t: 'poids', id: rep.id, poids: [0, 0, 2, 0] });
    avancer(s);
    expect(c.debit[idx(sx + 1, sz + 3)]).toBe(0);
    bilanOk(s);
  });

  it('la citerne remplit puis rend son eau, sans en créer', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    riche(s);
    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx, sz + 8), type: 2 });
    const r = appliquer(s, { t: 'construire', kind: 'citerne', x: sx + 1, z: sz + 2, rot: 0 });
    expect(r.ok).toBe(true);
    const cit = s.batiments.find((b) => b.kind === 'citerne')!;
    cit.chantier = 1;
    cacheDe(s).topoSale = true;
    for (let k = 0; k < 200; k++) {
      avancer(s);
      bilanOk(s);
    }
    expect(cit.stock).toBeGreaterThan(200);
    const avant = cit.stock;
    appliquer(s, { t: 'vanne', id: cit.id, vanne: 2 });
    const debitAvant = cacheDe(s).debit[idx(sx, sz + 7)];
    for (let k = 0; k < 40; k++) {
      avancer(s);
      bilanOk(s);
    }
    expect(cit.stock).toBeLessThan(avant - 35);
    expect(cacheDe(s).debit[idx(sx, sz + 7)]).toBeGreaterThan(debitAvant + 10);
    appliquer(s, { t: 'vanne', id: cit.id, vanne: 1 });
    const tenu = cit.stock;
    for (let k = 0; k < 20; k++) avancer(s);
    expect(cit.stock).toBeGreaterThan(tenu * 0.99);
    expect(cit.stock).toBeLessThanOrEqual(tenu);
  });

  it('conserve l’eau sur 150 réseaux tirés au hasard', () => {
    const kinds: BatimentKind[] = ['jardin', 'palmeraie', 'fontaine', 'bassin', 'citerne', 'puits', 'noria', 'repartiteur', 'briqueterie'];
    for (let essai = 0; essai < 150; essai++) {
      const rng = rngCreer(1000 + essai, 9);
      const s = creerPartie(GRAINE_SCENARIO + 8 * (essai % 5));
      riche(s);
      // marche aléatoire de canaux depuis la source
      let x = cx(s.carte.sourceCase);
      let z = cz(s.carte.sourceCase);
      const cases: number[] = [];
      for (let k = 0; k < 120; k++) {
        if (rngSuivant(rng) < 0.12) {
          const c0 = cases.length ? cases[rngEntier(rng, 0, cases.length - 1)] : s.carte.sourceCase;
          x = cx(c0);
          z = cz(c0);
        }
        const d = rngEntier(rng, 0, 3);
        const nx = x + [0, 1, 0, -1][d];
        const nz = z + [-1, 0, 1, 0][d];
        if (nx < 1 || nz < 1 || nx >= N - 1 || nz >= N - 1) continue;
        x = nx;
        z = nz;
        cases.push(idx(x, z));
      }
      appliquer(s, { t: 'canal', cases, type: rngSuivant(rng) < 0.5 ? 1 : 2 });
      for (let k = 0; k < 40; k++) {
        const kind = kinds[rngEntier(rng, 0, kinds.length - 1)];
        const c0 = cases[rngEntier(rng, 0, cases.length - 1)];
        const px = cx(c0) + rngEntier(rng, -2, 1);
        const pz = cz(c0) + rngEntier(rng, -2, 1);
        if (verifierConstruction(s, kind, px, pz, 0).ok) {
          const r = appliquer(s, { t: 'construire', kind, x: px, z: pz, rot: 0 });
          if (r.ok) {
            const b = s.batiments.find((q) => q.id === r.id)!;
            b.chantier = 1;
            if (kind === 'repartiteur') b.poids = [rngEntier(rng, 0, 3), rngEntier(rng, 0, 3), rngEntier(rng, 0, 3), rngEntier(rng, 0, 3)];
            if (kind === 'citerne') {
              b.stock = rngEntier(rng, 0, 600);
              b.vanne = rngEntier(rng, 0, 2) as 0 | 1 | 2;
            }
          }
        }
      }
      // un peu de sable dans les canaux
      for (const c0 of cases) if (rngSuivant(rng) < 0.2) s.sable[c0] = rngSuivant(rng);
      // des habitants pour faire tourner puits et norias
      for (const b of s.batiments) if (b.kind === 'maison') b.habitants = 4;
      cacheDe(s).topoSale = true;
      let sourceCumul = 0;
      const stock0 = stocks(s);
      const st0 = { ...s.stats };
      for (let k = 0; k < 30; k++) {
        avancer(s);
        bilanOk(s);
        const b = cacheDe(s).bilan;
        expect(Number.isFinite(b.injecte)).toBe(true);
        sourceCumul += b.injecte;
      }
      // les stocks ne dépassent jamais leur capacité (à l'arrondi près)
      for (const b of s.batiments) {
        expect(b.stock).toBeGreaterThanOrEqual(0);
        if (b.kind === 'bassin') expect(b.stock).toBeLessThanOrEqual(B.bassinCapacite + 1e-6);
        if (b.kind === 'citerne') expect(b.stock).toBeLessThanOrEqual(B.citerneCapacite + 1e-6);
        expect(b.eauRatio).toBeGreaterThanOrEqual(0);
        expect(b.eauRatio).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(s.stats.eauInjectee - st0.eauInjectee).toBeGreaterThan(0);
      void stock0;
      void sourceCumul;
    }
  });

  it('un canal ensablé laisse passer moins d’eau et déborde sur place', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx, sz + 8), type: 1 });
    for (let k = 0; k < 3; k++) avancer(s);
    const c = cacheDe(s);
    const avant = c.debit[idx(sx, sz + 6)];
    s.sable[idx(sx, sz + 3)] = 1;
    // pas d'ouvriers libres pour curer pendant le test
    for (const b of s.batiments) if (b.kind === 'maison') b.habitants = 0;
    avancer(s);
    expect(c.debit[idx(sx, sz + 6)]).toBeLessThan(avant * 0.2);
    expect(c.deverse[idx(sx, sz + 3)]).toBeGreaterThan(avant * 0.5);
    bilanOk(s);
    expect(NN).toBe(N * N);
    expect(Sol.Roche).toBe(2);
  });
});
