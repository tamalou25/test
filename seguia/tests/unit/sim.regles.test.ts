import { describe, expect, it } from 'vitest';
import {
  appliquer,
  avancer,
  B,
  cacheDe,
  calendrier,
  creerPartie,
  cx,
  cz,
  deserialiser,
  empreinte,
  estDebloque,
  expositionApercu,
  GRAINE_SCENARIO,
  idx,
  N,
  NN,
  objectifs,
  PAS_DEPART,
  PAS_PAR_JOUR,
  population,
  serialiser,
  Sol,
  verifierConstruction,
  type GameState,
} from '../../src/sim';
import { jouer } from '../bots/strategies';
import { traceL } from '../bots/lib';

const DATE = '2026-11-18T10:00:00Z';

function ouverture(s: GameState) {
  const sx = cx(s.carte.sourceCase);
  const sz = cz(s.carte.sourceCase);
  let zPiste = 0;
  for (const i of s.carte.piste) if (Math.abs(cx(i) - sx) <= 1) zPiste = Math.max(zPiste, cz(i));
  appliquer(s, { t: 'canal', cases: traceL(sx, sz, sx, zPiste - 2), type: 1 });
  return { sx, sz, finZ: zPiste - 2 };
}

describe('placement et refus', () => {
  it('chaque refus donne une cause et, quand c’est possible, une action', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    const roche = s.carte.sol.indexOf(Sol.Roche);
    let v = verifierConstruction(s, 'jardin', cx(roche), cz(roche), 0);
    expect(v.ok).toBe(false);
    expect(v.cause).toMatch(/Rocher/);
    expect(v.suggestion.length).toBeGreaterThan(5);

    const piste = s.carte.piste[10];
    v = verifierConstruction(s, 'maison', cx(piste), cz(piste), 0);
    expect(v.ok).toBe(false);
    expect(v.cause).toMatch(/piste/);

    const sx = cx(s.carte.sourceCase);
    const sz = cz(s.carte.sourceCase);
    v = verifierConstruction(s, 'bassin', sx + 2, sz + 2, 0);
    expect(v.ok).toBe(false);
    expect(v.cause).toMatch(/Trop loin de la piste/);
    expect(v.suggestion).toMatch(/Rapprochez/);

    v = verifierConstruction(s, 'citerne', sx + 2, sz + 2, 0);
    expect(v.ok).toBe(false);
    expect(v.cause).toMatch(/Pas encore disponible/);
    expect(v.suggestion).toMatch(/première eau/);
    expect(estDebloque(s, 'citerne')).toBe(false);

    s.res.pieces = 3;
    v = verifierConstruction(s, 'jardin', sx + 2, sz + 2, 0);
    expect(v.ok).toBe(false);
    expect(v.cause).toMatch(/Il manque 5 pièces/);

    s.res.pieces = 100;
    v = verifierConstruction(s, 'jardin', sx + 2, sz + 4, 0);
    expect(v.ok).toBe(true);
    expect(v.avertissement).toMatch(/à sec/);
    // sur la séguia elle-même : refus avec remède
    v = verifierConstruction(s, 'jardin', sx, sz, 0);
    expect(v.ok).toBe(false);
    expect(v.suggestion).toMatch(/à côté du canal/);
  });

  it('annuler rembourse entièrement, démolir à moitié', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    const { sx, sz } = ouverture(s);
    const avant = { ...s.res };
    const r = appliquer(s, { t: 'construire', kind: 'maison', x: sx + 2, z: sz + 2, rot: 0 });
    expect(r.ok).toBe(true);
    expect(s.res.pieces).toBe(avant.pieces - 10);
    expect(appliquer(s, { t: 'annuler' }).ok).toBe(true);
    expect(s.res.pieces).toBe(avant.pieces);
    expect(s.res.materiaux).toBe(avant.materiaux);
    expect(s.batiments.some((b) => b.id === (r as any).id)).toBe(false);
    // le tracé du canal s'annule aussi
    const nbCanal = () => s.canal.reduce((a, b) => a + (b ? 1 : 0), 0);
    const n0 = nbCanal();
    appliquer(s, { t: 'canal', cases: traceL(sx, sz + 3, sx + 5, sz + 3), type: 1 });
    expect(nbCanal()).toBe(n0 + 5);
    appliquer(s, { t: 'annuler' });
    expect(nbCanal()).toBe(n0);
    // trop tard : refus avec remède, puis démolition à moitié prix
    const r2 = appliquer(s, { t: 'construire', kind: 'maison', x: sx + 2, z: sz + 2, rot: 0 });
    for (let k = 0; k < B.annulerPas + 5; k++) avancer(s);
    const tard = appliquer(s, { t: 'annuler' });
    expect(tard.ok).toBe(false);
    const p0 = s.res.pieces;
    expect(appliquer(s, { t: 'demolir', id: (r2 as any).id }).ok).toBe(true);
    expect(s.res.pieces).toBe(p0 + 5);
  });
});

describe('cultures, population, sable', () => {
  it('un jardin irrigué verdit le sol et donne une récolte ; à sec, il meurt', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    const { sx, sz } = ouverture(s);
    const r = appliquer(s, { t: 'construire', kind: 'jardin', x: sx + 1, z: sz + 2, rot: 0 });
    const id = (r as any).id as number;
    const jardin = () => s.batiments.find((b) => b.id === id)!;
    const caseJardin = idx(sx + 1, sz + 2);
    expect(s.humidite[caseJardin]).toBe(0);
    // premier effet visible en moins de 2 minutes de jeu à vitesse normale (1200 pas)
    for (let k = 0; k < 400; k++) avancer(s);
    expect(jardin().chantier).toBe(1);
    expect(s.humidite[caseJardin]).toBeGreaterThan(B.seuilVert);
    const vivres0 = s.res.vivres;
    let recoltes = 0;
    for (let k = 0; k < PAS_PAR_JOUR * 3; k++) for (const e of avancer(s).evenements) if (e.type === 'recolte') recoltes++;
    expect(recoltes).toBeGreaterThanOrEqual(1);
    expect(s.stats.recoltes).toBe(recoltes);
    void vivres0;
    // on coupe l'eau : le jardin sèche et la perte est comptée une seule fois
    appliquer(s, { t: 'effacer', cases: [idx(sx, sz + 1)] });
    let pertes = 0;
    for (let k = 0; k < PAS_PAR_JOUR * 3; k++) for (const e of avancer(s).evenements) if (e.type === 'jardin_perdu') pertes++;
    expect(pertes).toBe(1);
    expect(jardin().sante).toBe(0);
    expect(s.humidite[caseJardin]).toBeLessThan(B.seuilVert);
    // l'eau revient : le jardin repart
    appliquer(s, { t: 'canal', cases: [idx(sx, sz + 1)], type: 1 });
    for (let k = 0; k < PAS_PAR_JOUR; k++) avancer(s);
    expect(jardin().sante).toBeGreaterThan(0.9);
  });

  it('sans vivres, des habitants partent mais jamais les deux derniers', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    s.res.vivres = 0;
    for (let k = 0; k < PAS_PAR_JOUR * 4; k++) avancer(s);
    expect(population(s)).toBe(2);
    expect(s.stats.habitantsPartis).toBe(2);
  });

  it('un brise-vent protège les cases sous le vent', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    s.progression.palier = 1;
    const { sx, sz } = ouverture(s);
    const vent = s.carte.ventDominant; // sud
    expect(vent).toBe(2);
    const z = sz + 6;
    // clôture au sud d'un tronçon de trois cases
    appliquer(s, { t: 'cloture', cases: [idx(sx + 2, z + 1), idx(sx + 3, z + 1), idx(sx + 4, z + 1)], type: 1 });
    const expo = expositionApercu(s, vent);
    expect(expo[idx(sx + 3, z)]).toBeCloseTo(B.sableAbri, 5);
    expect(expo[idx(sx + 3, z - 2)]).toBeCloseTo(B.sableAbri, 5); // 3 cases d'abri
    expect(expo[idx(sx + 3, z - 3)]).toBe(1);
    expect(expo[idx(sx + 8, z)]).toBe(1);
    // pendant la tempête de l'an 1, la case exposée s'ensable bien plus que l'abritée
    for (const b of s.batiments) if (b.kind === 'maison') b.habitants = 0; // personne pour curer
    const t = s.meteo.length ? s.meteo[0] : null;
    while (s.pas < 13 * PAS_PAR_JOUR) avancer(s);
    void t;
    expect(s.sable[idx(sx + 8, z)]).toBeGreaterThan(0.25);
    expect(s.sable[idx(sx + 3, z)]).toBeLessThan(s.sable[idx(sx + 8, z)] * 0.3);
    for (let i = 0; i < NN; i++) {
      expect(s.sable[i]).toBeGreaterThanOrEqual(0);
      expect(s.sable[i]).toBeLessThanOrEqual(1);
    }
    expect(N).toBe(44);
  });
});

describe('caravanes', () => {
  function jusquaPhase(s: GameState, phase: string, max = PAS_PAR_JOUR * 6) {
    for (let k = 0; k < max; k++) {
      if (s.caravanes.some((c) => c.phase === phase)) return true;
      avancer(s);
    }
    return false;
  }

  function preparer(): GameState {
    const s = creerPartie(GRAINE_SCENARIO);
    const { sx, finZ } = ouverture(s);
    let pose = false;
    for (let dz = -2; dz <= 0 && !pose; dz++) {
      for (const dx of [1, -3]) {
        const r = appliquer(s, { t: 'construire', kind: 'bassin', x: sx + dx, z: finZ + dz, rot: 0 });
        if (r.ok) {
          pose = true;
          break;
        }
      }
    }
    expect(pose).toBe(true);
    appliquer(s, { t: 'commande', n: 0 }); // pas d'achat de matériaux : les comptes restent lisibles
    return s;
  }

  it('une caravane abreuvée paie une seule fois', () => {
    const s = preparer();
    expect(jusquaPhase(s, 'abreuvage')).toBe(true);
    const car = s.caravanes.find((c) => c.phase === 'abreuvage')!;
    const pieces0 = s.res.pieces;
    let paiements = 0;
    let somme = 0;
    for (let k = 0; k < PAS_PAR_JOUR * 2; k++) {
      for (const e of avancer(s).evenements) {
        if (e.type === 'caravane_payee' && e.id === car.id) {
          paiements++;
          somme += e.valeur;
        }
      }
    }
    expect(paiements).toBe(1);
    expect(somme).toBe(Math.round(car.chameaux * B.caravanePaieParChameau));
    expect(s.stats.caravanesServies).toBe(1);
    // aucun autre revenu possible dans ce scénario (pas de dattes), une commande de matériaux éventuelle en moins
    expect(s.res.pieces).toBe(pieces0 + somme);
    expect(s.renommeeCaravanes).toBe(B.renommeeServie);
  });

  it('sauvegarder pendant qu’une caravane boit puis reprendre donne exactement la même partie', () => {
    const a = preparer();
    expect(jusquaPhase(a, 'abreuvage')).toBe(true);
    for (let k = 0; k < 8; k++) avancer(a); // au milieu de l'abreuvage
    const car = a.caravanes.find((c) => c.phase === 'abreuvage')!;
    expect(car.bu).toBeGreaterThan(0);
    expect(car.bu).toBeLessThan(car.besoin);
    const texte = serialiser(a, { vitesse: 2 }, DATE);
    const r = deserialiser(texte);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.etat;
    expect(empreinte(b)).toBe(empreinte(a));
    expect(r.ui.vitesse).toBe(2);
    expect(r.meta.habitants).toBe(population(a));
    const piecesAvant = a.res.pieces;
    for (let k = 0; k < PAS_PAR_JOUR * 2; k++) {
      avancer(a);
      avancer(b);
    }
    expect(empreinte(b)).toBe(empreinte(a));
    expect(b.stats.caravanesServies).toBe(1);
    expect(a.stats.caravanesServies).toBe(1);
    expect(b.res.pieces).toBe(a.res.pieces);
    expect(b.res.pieces).toBeGreaterThan(piecesAvant);
  });

  it('sans eau au bassin, la caravane passe son chemin', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    s.progression.palier = 1;
    let passe = 0;
    for (let k = 0; k < PAS_PAR_JOUR * 9; k++) for (const e of avancer(s).evenements) if (e.type === 'caravane_passe') passe++;
    expect(passe).toBeGreaterThanOrEqual(1);
    // la première caravane est indulgente, les suivantes coûtent de la renommée
    expect(s.stats.caravanesManquees).toBe(passe - 1);
  });
});

describe('sauvegarde', () => {
  it('refuse proprement un fichier abîmé, modifié, étranger ou trop récent', () => {
    const s = creerPartie(GRAINE_SCENARIO);
    for (let k = 0; k < 50; k++) avancer(s);
    const texte = serialiser(s, { vitesse: 1 }, DATE);
    expect(deserialiser(texte).ok).toBe(true);

    const tronque = deserialiser(texte.slice(0, texte.length / 2));
    expect(tronque.ok).toBe(false);
    if (!tronque.ok) expect(tronque.erreur).toMatch(/illisible/);

    const modifie = deserialiser(texte.replace('"pieces":110', '"pieces":999999'));
    expect(modifie.ok).toBe(false);
    if (!modifie.ok) expect(modifie.erreur).toMatch(/somme de contrôle/);

    const etranger = deserialiser('{"bonjour":1}');
    expect(etranger.ok).toBe(false);
    if (!etranger.ok) expect(etranger.erreur).toMatch(/pas une sauvegarde/);

    const futur = deserialiser(texte.replace('"version":1,"somme"', '"version":99,"somme"'));
    expect(futur.ok).toBe(false);
    if (!futur.ok) expect(futur.erreur).toMatch(/plus récente/);

    expect(deserialiser('').ok).toBe(false);
    expect(deserialiser('null').ok).toBe(false);
  });

  it('une partie rechargée à mi-parcours reste identique à la partie continue (6 jours de bot)', () => {
    const continu = jouer('etape', GRAINE_SCENARIO, 6);
    const recharge = jouer('etape', GRAINE_SCENARIO, 6, { rechargerAuPas: 1400 });
    expect(empreinte(recharge.s)).toBe(empreinte(continu.s));
    expect(recharge.s.pas).toBe(PAS_DEPART + 6 * PAS_PAR_JOUR);
  });

  it('deux parties de même graine sont identiques, deux graines différentes ne le sont pas', () => {
    const a = jouer('grenier', GRAINE_SCENARIO, 3);
    const b = jouer('grenier', GRAINE_SCENARIO, 3);
    const c = jouer('grenier', GRAINE_SCENARIO + 8, 3);
    expect(empreinte(a.s)).toBe(empreinte(b.s));
    expect(empreinte(a.s)).not.toBe(empreinte(c.s));
  });
});

describe('progression', () => {
  it('le premier palier se franchit en jouant et débloque les outils suivants', () => {
    const p = jouer('etape', GRAINE_SCENARIO, 4);
    expect(p.s.progression.palier).toBeGreaterThanOrEqual(1);
    expect(estDebloque(p.s, 'repartiteur')).toBe(true);
    expect(estDebloque(p.s, 'citerne')).toBe(true);
    expect(estDebloque(p.s, 'hammam')).toBe(false);
    expect(objectifs(p.s).length).toBeGreaterThan(0);
    expect(calendrier(p.s.pas).jour).toBe(4);
    expect(calendrier(PAS_DEPART).heure).toBeCloseTo(7, 5);
    expect(cacheDe(p.s).renommee).toBeGreaterThan(0);
  });

  it('la vocation ouvre des bâtiments différents', () => {
    const e = jouer('etape', GRAINE_SCENARIO, 20);
    const g = jouer('grenier', GRAINE_SCENARIO, 20);
    expect(e.s.progression.vocation).toBe('etape');
    expect(g.s.progression.vocation).toBe('grenier');
    expect(estDebloque(e.s, 'hammam')).toBe(true);
    expect(estDebloque(e.s, 'sechoir')).toBe(false);
    expect(estDebloque(g.s, 'sechoir')).toBe(true);
    expect(estDebloque(g.s, 'noria')).toBe(true);
    expect(estDebloque(g.s, 'fanal')).toBe(false);
  });
});
