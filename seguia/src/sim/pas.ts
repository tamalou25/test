/**
 * Un pas de simulation (0,05 heure de jeu). Ordre fixe, entièrement déterministe.
 */
import { B, BATIMENTS, PRIORITE_PERSONNEL } from './balance';
import { cacheDe, invalider, majExposition, type Cache } from './cache';
import { aEauPotable, appliquer } from './commandes';
import { resoudreEau } from './eau';
import {
  calendrier,
  canicule,
  casesDe,
  cx,
  cz,
  dans,
  idx,
  journal,
  logements,
  population,
  tempeteEnCours,
} from './etat';
import { avancerProgression, batimentActif, detailRenommee } from './progression';
import { rngEntier, rngSuivant } from './rng';
import {
  DT_H,
  JOURS_PAR_AN,
  NN,
  PAS_PAR_AN,
  PAS_PAR_JOUR,
  Sol,
  NOM_DIR,
  NOM_SAISON,
  type Batiment,
  type Caravane,
  type Commande,
  type Dir,
  type Evenement,
  type GameState,
  type Resultat,
} from './types';

const H = (heures: number) => Math.round(heures / DT_H);
const J = (jours: number) => Math.round(jours * PAS_PAR_JOUR);

function evt(ev: Evenement[], type: Evenement['type'], texte: string, caseI = -1, id = 0, valeur = 0) {
  ev.push({ type, caseI, id, valeur, texte });
}

export interface ResultatPas {
  evenements: Evenement[];
  resultats: Resultat[];
}

/** Applique les commandes puis avance la simulation d'un pas. */
export function avancer(s: GameState, commandes: Commande[] = []): ResultatPas {
  const resultats = commandes.map((c) => appliquer(s, c));
  const ev: Evenement[] = [];
  const c = cacheDe(s);

  programmerMeteo(s);
  meteo(s, c, ev);
  personnel(s, c);
  resoudreEau(s);
  cultures(s, c, ev);
  sable(s, c);
  if (s.pas % 4 === 0) humidite(s, c, ev);
  populationPas(s, c, ev);
  caravanes(s, ev);
  chantiers(s, c, ev);
  if (s.pas % 10 === 0) avancerProgression(s, ev);

  // changement de saison (annoncé au premier pas de la saison)
  const cal = calendrier(s.pas + 1);
  if ((s.pas + 1) % (PAS_PAR_JOUR * 5) === 0) {
    journal(s, 'info', `${NOM_SAISON[cal.saison]}, an ${cal.annee + 1}.`);
    evt(ev, 'saison', NOM_SAISON[cal.saison], -1, 0, cal.saison);
  }

  // les actions trop anciennes ne sont plus annulables
  while (s.annulables.length && (s.pas - s.annulables[0].pas > B.annulerPas || s.annulables.length > 24)) {
    s.annulables.shift();
  }
  s.pas++;
  return { evenements: ev, resultats };
}

/**
 * Recalcule les données d'affichage du cache (débits, bilan, ombre, main-d'œuvre) pour un état qui vient
 * d'être chargé, SANS modifier l'état : stocks, ratios, postes et cumuls sont remis tels qu'ils étaient.
 */
export function rechaufferCache(s: GameState): void {
  const sauve = s.batiments.map((b) => [b.stock, b.eauRatio, b.personnel] as const);
  const stats = { ...s.stats };
  const c = cacheDe(s);
  personnel(s, c);
  resoudreEau(s);
  s.batiments.forEach((b, k) => {
    b.stock = sauve[k][0];
    b.eauRatio = sauve[k][1];
    b.personnel = sauve[k][2];
  });
  s.stats = stats;
}

/* ------------------------------------------------------------------ météo */

function programmerMeteo(s: GameState) {
  const annee = Math.floor(s.pas / PAS_PAR_AN);
  if (annee <= s.meteoAnneeProgrammee) return;
  s.meteoAnneeProgrammee = annee;
  const base = annee * PAS_PAR_AN;
  const dom = s.carte.ventDominant;
  const tirerDir = (): Dir => {
    const r = rngSuivant(s.rng.meteo);
    if (r < 0.6) return dom;
    return (r < 0.8 ? (dom + 1) % 4 : (dom + 3) % 4) as Dir;
  };
  const tempete = (jour: number, dureeH: number, intensite: number, dir: Dir, grande: boolean) => {
    s.meteo.push({
      type: 'tempete',
      debutPas: base + J(jour),
      finPas: base + J(jour) + H(dureeH),
      dir,
      intensite,
      grande,
      annoncee: false,
    });
  };
  if (annee === 0) {
    tempete(12.3, 6, 0.55, dom, false);
  } else {
    const dCan = annee === 1 ? 7.0 : 6.2 + rngSuivant(s.rng.meteo) * 1.5;
    s.meteo.push({
      type: 'canicule',
      debutPas: base + J(dCan),
      finPas: base + J(dCan + (annee === 1 ? 1.5 : 2)),
      dir: 0,
      intensite: 1,
      grande: false,
      annoncee: false,
    });
    const force = Math.min(1.25, 0.6 + 0.1 * (annee - 1));
    tempete(11.3 + rngSuivant(s.rng.meteo) * 0.4, 6, force, tirerDir(), false);
    tempete(13.3, 10, Math.min(1.4, 1.0 + 0.1 * (annee - 1)), dom, true);
    if (annee >= 3) tempete(10.2, 5, force, tirerDir(), false);
  }
  s.meteo.sort((a, b) => a.debutPas - b.debutPas);
}

function meteo(s: GameState, c: Cache, ev: Evenement[]) {
  for (let k = s.meteo.length - 1; k >= 0; k--) {
    const m = s.meteo[k];
    const avance = m.type === 'tempete' ? J(1.5) : J(1.0);
    if (!m.annoncee && s.pas >= m.debutPas - avance) {
      m.annoncee = true;
      if (m.type === 'tempete') {
        const t = `${m.grande ? 'Grande tempête' : 'Tempête'} de sable annoncée : vent du ${NOM_DIR[m.dir]}.`;
        journal(s, 'alerte', t);
        evt(ev, 'tempete_annoncee', t, -1, 0, m.dir);
      } else {
        const t = 'Canicule annoncée : la source baissera encore et tout aura plus soif.';
        journal(s, 'alerte', t);
        evt(ev, 'canicule_annoncee', t);
      }
    }
    if (s.pas === m.debutPas) {
      if (m.type === 'tempete') {
        journal(s, 'alerte', 'La tempête de sable se lève.');
        evt(ev, 'tempete_debut', 'La tempête se lève', -1, 0, m.dir);
      } else {
        journal(s, 'alerte', 'La canicule commence.');
        evt(ev, 'canicule_debut', 'Canicule');
      }
    }
    if (s.pas === m.finPas) {
      if (m.type === 'tempete') {
        let detruites = 0;
        for (let i = 0; i < NN; i++) {
          if (s.cloture[i] !== 1) continue;
          s.clotureEtat[i] -= B.clotureUsure * m.intensite;
          if (s.clotureEtat[i] <= 0) {
            s.cloture[i] = 0;
            s.clotureEtat[i] = 0;
            detruites++;
          }
        }
        if (detruites) {
          invalider(s);
          evt(ev, 'cloture_detruite', `${detruites} brise-vent emportés`, -1, 0, detruites);
        }
        let ensables = 0;
        for (let i = 0; i < NN; i++) if (s.canal[i] && s.sable[i] > 0.3) ensables++;
        const t = ensables
          ? `La tempête est passée : ${ensables} cases de séguia sont ensablées.`
          : 'La tempête est passée sans dégâts sur les séguias.';
        journal(s, ensables ? 'alerte' : 'bien', t);
        if (m.grande) s.progression.grandeTempetePassee = true;
        evt(ev, 'tempete_fin', t, -1, 0, ensables);
      } else {
        journal(s, 'bien', 'La canicule est finie.');
        evt(ev, 'canicule_fin', 'Fin de la canicule');
      }
    }
    if (s.pas > m.finPas + 10) s.meteo.splice(k, 1);
  }
}

/* ------------------------------------------------------------ main-d'œuvre */

function personnel(s: GameState, c: Cache) {
  const pop = Math.floor(population(s) * B.partOuvriers);
  let dispo = s.corvee ? 0 : pop;
  let postes = 0;
  for (const b of s.batiments) b.personnel = 1;
  for (const kind of PRIORITE_PERSONNEL) {
    const besoin = BATIMENTS[kind].ouvriers;
    for (const b of s.batiments) {
      if (b.kind !== kind) continue;
      if (b.chantier < 1 || b.pause) {
        b.personnel = 0;
        continue;
      }
      postes += besoin;
      const donne = Math.min(besoin, dispo);
      b.personnel = donne / besoin;
      dispo -= donne;
    }
  }
  c.postes = postes;
  c.ouvriersLibres = s.corvee ? pop : dispo;
}

/* ---------------------------------------------------------------- cultures */

function sableMoyen(s: GameState, b: Batiment): number {
  let t = 0;
  for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) t += s.sable[idx(b.x + dx, b.z + dz)];
  return t / (b.w * b.d);
}

function cultures(s: GameState, c: Cache, ev: Evenement[]) {
  const cal = calendrier(s.pas);
  const fChaud = canicule(s) ? 1.3 : cal.saison === 1 ? 1.15 : 1;
  const grenier = s.progression.vocation === 'grenier' ? 1.25 : 1;
  for (const b of s.batiments) {
    if (b.chantier < 1) continue;
    if (b.kind === 'jardin') {
      if (b.pause) {
        b.croissance = 0;
        continue;
      }
      const r = b.eauRatio;
      const enseveli = sableMoyen(s, b) > 0.5;
      const avant = b.sante;
      if (enseveli) b.sante -= (DT_H / B.jardinMortH) * 0.6;
      else if (r >= 0.7) b.sante = Math.min(1, b.sante + DT_H / 12);
      else if (r < 0.4) b.sante -= (DT_H / B.jardinMortH) * (1 - r / 0.4) * fChaud;
      if (b.sante <= 0) {
        b.sante = 0;
        b.croissance = 0;
        if (avant > 0) {
          s.stats.jardinsPerdus++;
          if (cal.annee === 0 && cal.saison === 1) s.stats.jardinsPerdusSaisonChaude++;
          const t = enseveli ? 'Un jardin est enseveli sous le sable.' : 'Un jardin a séché sur pied.';
          journal(s, 'alerte', t);
          evt(ev, 'jardin_perdu', t, idx(b.x, b.z), b.id);
        }
        continue;
      }
      if (!enseveli) b.croissance += (DT_H / B.jardinCycleH) * Math.min(1, r) * (0.35 + 0.65 * b.personnel);
      if (b.croissance >= 1) {
        b.croissance = 0;
        const ombre = c.ombre[idx(b.x, b.z)] ? B.jardinOmbreRecolte : 1;
        const q = B.jardinRecolte * ombre * grenier;
        s.res.vivres += q;
        s.stats.recoltes++;
        evt(ev, 'recolte', `+${Math.round(q)} vivres`, idx(b.x, b.z), b.id, q);
      }
    } else if (b.kind === 'palmeraie') {
      const r = b.pause ? 0 : b.eauRatio;
      const enseveli = sableMoyen(s, b) > 0.7;
      const avant = b.sante;
      if (r >= 0.6 && !enseveli) {
        b.sante = Math.min(1, b.sante + DT_H / 24);
        b.croissance = Math.min(1, b.croissance + (DT_H / B.palmeraieCroissanceH) * Math.min(1, r));
      } else if (r < 0.3 || enseveli) {
        b.sante -= (DT_H / B.palmeraieMortH) * (enseveli ? 0.5 : 1 - r / 0.3) * fChaud;
      }
      if (b.sante <= 0) {
        b.sante = 0;
        if (avant > 0) {
          const adulte = b.croissance >= B.palmeraieMature;
          b.croissance = 0;
          s.stats.palmiersPerdus++;
          const t = adulte ? 'Une palmeraie adulte est morte de soif.' : 'De jeunes palmiers sont morts de soif.';
          journal(s, 'alerte', t);
          evt(ev, 'palmier_perdu', t, idx(b.x, b.z), b.id);
        }
        continue;
      }
      if (b.croissance >= B.palmeraieMature) {
        const maturite = (b.croissance - B.palmeraieMature) / (1 - B.palmeraieMature);
        s.res.dattes +=
          (B.palmeraieDattesParJour / 24) * DT_H * (0.4 + 0.6 * maturite) * (0.3 + 0.7 * b.personnel) * Math.min(1, r) * grenier;
      }
    } else if (b.kind === 'briqueterie') {
      if (!b.pause) s.res.materiaux += (B.briquesParJour / 24) * DT_H * b.personnel * b.eauRatio;
    }
  }
}

/* -------------------------------------------------------------------- sable */

function sable(s: GameState, c: Cache) {
  const t = tempeteEnCours(s);
  const { sol } = s.carte;
  if (t) {
    majExposition(s, c, t.dir);
    const depot = t.intensite * B.sableParHeure * DT_H;
    for (let i = 0; i < NN; i++) {
      if (sol[i] === Sol.Roche || sol[i] === Sol.Dune) continue;
      const id = c.occ[i];
      if (id && !estParcelle(s, id)) continue;
      const v = s.sable[i] + depot * c.expo[i] * (s.humidite[i] >= 0.5 ? B.sableHumide : 1);
      s.sable[i] = v > 1 ? 1 : v;
    }
  }
  // curage par les ouvriers libres : l'amont d'abord, puis les parcelles
  let capacite = c.ouvriersLibres * B.curageParOuvrierParHeure * DT_H;
  if (capacite > 0) {
    for (let k = 0; k < c.nbOrdre && capacite > 0; k++) {
      const i = c.ordre[k];
      if (s.sable[i] > 0) {
        const d = Math.min(s.sable[i], capacite);
        s.sable[i] -= d;
        capacite -= d;
      }
    }
    if (capacite > 0) {
      for (let i = 0; i < NN && capacite > 0; i++) {
        if (s.canal[i] && c.rang[i] < 0 && s.sable[i] > 0) {
          const d = Math.min(s.sable[i], capacite);
          s.sable[i] -= d;
          capacite -= d;
        }
      }
    }
    if (capacite > 0) {
      for (const b of s.batiments) {
        if (capacite <= 0) break;
        if (b.kind !== 'jardin' && b.kind !== 'palmeraie') continue;
        for (const i of casesDe(b)) {
          if (s.sable[i] > 0 && capacite > 0) {
            const d = Math.min(s.sable[i], capacite);
            s.sable[i] -= d;
            capacite -= d;
          }
        }
      }
    }
  }
  // hors des canaux, le vent finit par emporter le sable ; dans une séguia en eau, le courant le chasse lentement
  if (!t) {
    const declin = B.sableDeclinParHeure * DT_H;
    const chasse = B.sableChasseParHeure * DT_H;
    for (let i = 0; i < NN; i++) {
      const v = s.sable[i];
      if (v <= 0) continue;
      if (!s.canal[i]) s.sable[i] = v > declin ? v - declin : 0;
      else if (c.debit[i] > 1) {
        const d = chasse * Math.min(1, c.debit[i] / 30);
        s.sable[i] = v > d ? v - d : 0;
      }
    }
  }
}

function estParcelle(s: GameState, id: number): boolean {
  let lo = 0;
  let hi = s.batiments.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    const b = s.batiments[m];
    if (b.id === id) return b.kind === 'jardin' || b.kind === 'palmeraie';
    if (b.id < id) lo = m + 1;
    else hi = m - 1;
  }
  return false;
}

/* ----------------------------------------------------------------- humidité */

const ETALE = [1, 0.6, 0.3];

function humidite(s: GameState, c: Cache, ev: Evenement[]) {
  const cible = c.cibleHumidite;
  cible.fill(0);
  const etaler = (i: number, force: number, rayon: number) => {
    const x = cx(i);
    const z = cz(i);
    for (let dz = -rayon; dz <= rayon; dz++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (!dans(nx, nz)) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        const v = force * ETALE[d];
        const j = idx(nx, nz);
        if (v > cible[j]) cible[j] = v;
      }
    }
  };
  for (let k = 0; k < c.nbOrdre; k++) {
    const i = c.ordre[k];
    const q = c.debit[i];
    if (q > 0.3) etaler(i, Math.min(1, 0.4 + q / 5), 2);
    if (c.deverse[i] > 0.5) etaler(i, 1, 2);
  }
  for (const b of s.batiments) {
    if (b.chantier < 1) continue;
    if (b.kind === 'jardin' || b.kind === 'palmeraie') {
      const r = b.pause ? 0 : b.eauRatio;
      if (r <= 0) continue;
      for (let z = b.z - 1; z <= b.z + b.d; z++) {
        for (let x = b.x - 1; x <= b.x + b.w; x++) {
          if (!dans(x, z)) continue;
          const dedans = x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d;
          const v = (dedans ? 0.95 : 0.5) * r;
          const j = idx(x, z);
          if (v > cible[j]) cible[j] = v;
        }
      }
    } else if (
      b.kind === 'source' ||
      (b.kind === 'fontaine' && b.eauRatio >= 0.5) ||
      ((b.kind === 'bassin' || b.kind === 'citerne') && b.stock > 10)
    ) {
      for (let z = b.z - 1; z <= b.z + b.d; z++) {
        for (let x = b.x - 1; x <= b.x + b.w; x++) {
          if (!dans(x, z)) continue;
          const j = idx(x, z);
          if (0.6 > cible[j]) cible[j] = 0.6;
        }
      }
    }
  }
  const cal = calendrier(s.pas);
  const dt = DT_H * 4;
  const monte = B.humiditeMonte * dt;
  const descend = B.humiditeDescend * dt * B.evapSaison[cal.saison];
  let haiesMortes = 0;
  for (let i = 0; i < NN; i++) {
    const h = s.humidite[i];
    const t = cible[i];
    let n = h;
    if (t > h) n = Math.min(t, h + monte);
    else if (t < h) n = Math.max(t, h - descend);
    s.humidite[i] = n;
    if (s.cloture[i] === 2) {
      if (n < 0.2) {
        s.clotureEtat[i] -= 0.004;
        if (s.clotureEtat[i] <= 0) {
          s.cloture[i] = 0;
          s.clotureEtat[i] = 0;
          haiesMortes++;
        }
      } else if (s.clotureEtat[i] < 1) {
        s.clotureEtat[i] = Math.min(1, s.clotureEtat[i] + 0.01);
      }
    }
  }
  if (haiesMortes) {
    invalider(s);
    const t = `${haiesMortes} haie${haiesMortes > 1 ? 's sont mortes' : ' est morte'} de soif.`;
    journal(s, 'alerte', t);
    evt(ev, 'cloture_detruite', t, -1, 0, haiesMortes);
  }
}

/* --------------------------------------------------------------- population */

function populationPas(s: GameState, c: Cache, ev: Evenement[]) {
  const pop = population(s);
  let conso = (pop * B.vivresParHabitantParJour * DT_H) / 24;
  if (s.res.vivres >= conso) {
    s.res.vivres -= conso;
  } else {
    conso -= s.res.vivres;
    s.res.vivres = 0;
    s.res.dattes = Math.max(0, s.res.dattes - conso);
  }
  if (s.pas % B.pasParTourPopulation !== 0) return;

  const tour = s.pas / B.pasParTourPopulation;
  const sansNourriture = s.res.vivres <= 0 && s.res.dattes <= 0;
  if (sansNourriture) {
    s.faim++;
    if (s.faim === 1) {
      const t = 'Les greniers sont vides : des habitants vont partir.';
      journal(s, 'alerte', t);
      evt(ev, 'famine', t);
    }
    if (pop > 2) {
      let pire: Batiment | null = null;
      for (const b of s.batiments) {
        if (b.kind === 'maison' && b.habitants > 0 && (!pire || b.habitants >= pire.habitants)) pire = b;
      }
      if (pire) {
        pire.habitants--;
        s.stats.habitantsPartis++;
        evt(ev, 'habitant_parti', 'Un habitant affamé quitte l’oasis', idx(pire.x, pire.z), pire.id);
      }
    }
    return;
  }
  s.faim = 0;
  let quota = 1 + Math.floor(detailRenommee(s, c).total / 40);
  const reserve = s.res.vivres + s.res.dattes;
  let popCourante = pop;
  for (const b of s.batiments) {
    if (b.kind !== 'maison' || b.chantier < 1) continue;
    const potable = aEauPotable(s, b.x + b.w / 2, b.z + b.d / 2);
    if (potable) {
      if (quota > 0 && b.habitants < B.maisonCapacite && reserve >= popCourante * 0.5 + 2) {
        b.habitants++;
        popCourante++;
        quota--;
        evt(ev, 'habitant_arrive', 'Un habitant s’installe', idx(b.x, b.z), b.id);
      }
    } else if (b.habitants > 0 && tour % 2 === 0 && popCourante > 2) {
      b.habitants--;
      popCourante--;
      s.stats.habitantsPartis++;
      const t = 'Sans eau potable à proximité, un habitant s’en va.';
      if (s.pas % (B.pasParTourPopulation * 4) === 0) journal(s, 'alerte', t);
      evt(ev, 'habitant_parti', t, idx(b.x, b.z), b.id);
    }
  }
}

/* ---------------------------------------------------------------- caravanes */

function stockBassins(s: GameState): number {
  let t = 0;
  for (const b of s.batiments) if (b.kind === 'bassin' && b.chantier >= 1) t += b.stock;
  return t;
}

/** Indice de piste où s'arrêter : au plus près du bassin le mieux rempli. -1 s'il n'y a aucun bassin. */
export function indiceArret(s: GameState): number {
  let meilleur: Batiment | null = null;
  for (const b of s.batiments) {
    if (b.kind !== 'bassin' || b.chantier < 1) continue;
    if (!meilleur || b.stock > meilleur.stock) meilleur = b;
  }
  if (!meilleur) return -1;
  const bx = meilleur.x + meilleur.w / 2;
  const bz = meilleur.z + meilleur.d / 2;
  let best = -1;
  let bd = 1e9;
  for (let k = 0; k < s.carte.piste.length; k++) {
    const p = s.carte.piste[k];
    const d = Math.hypot(cx(p) + 0.5 - bx, cz(p) + 0.5 - bz);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

function creerCaravane(s: GameState, arriveePas: number, chameaux: number, indulgente: boolean): Caravane {
  const car: Caravane = {
    id: s.prochainId++,
    chameaux,
    besoin: chameaux * B.caravaneEauParChameau,
    bu: 0,
    phase: 'annoncee',
    arriveePas,
    pos: 0,
    arret: -1,
    finPhasePas: 0,
    satisfaction: 0,
    paiement: 0,
    dattesVendues: 0,
    materiauxAchetes: 0,
    colons: 0,
    vivresVendus: 0,
    annonceFaite: false,
    indulgente,
  };
  s.caravanes.push(car);
  return car;
}

function programmerSuivante(s: GameState) {
  const cal = calendrier(s.pas);
  const fanal = batimentActif(s, 'fanal');
  const renommee = detailRenommee(s).total;
  const jours =
    B.caravaneIntervalleJ *
    Math.max(0.45, Math.min(1, 1 - renommee / 250)) *
    (fanal ? B.fanalIntervalle : 1) *
    (0.85 + 0.3 * rngSuivant(s.rng.caravanes));
  const chameaux = Math.min(32, 4 + Math.floor(renommee / 6) + 3 * cal.annee + rngEntier(s.rng.caravanes, 0, 2));
  creerCaravane(s, s.pas + J(jours), chameaux, false);
}

function caravanes(s: GameState, ev: Evenement[]) {
  if (!s.premiereCaravaneLancee) {
    const bassin = s.batiments.some((b) => b.kind === 'bassin' && b.chantier >= 1);
    if (bassin || s.pas >= J(5)) {
      s.premiereCaravaneLancee = true;
      creerCaravane(s, s.pas + J(bassin ? 0.9 : 1.5), 4, true);
    }
  }
  const caravanserail = batimentActif(s, 'caravanserail');
  const fanal = batimentActif(s, 'fanal');
  const fin = s.carte.piste.length - 1;
  const avance = B.caravaneVitesse * DT_H;
  const annonce = J(B.caravaneAnnonceJ + (fanal ? B.fanalAnnonceJ : 0));

  for (let k = 0; k < s.caravanes.length; k++) {
    const car = s.caravanes[k];
    switch (car.phase) {
      case 'annoncee': {
        if (!car.annonceFaite && s.pas >= car.arriveePas - annonce) {
          car.annonceFaite = true;
          const t = `Caravane annoncée : ${car.chameaux} chameaux, ${car.besoin} u d'eau demandées.`;
          journal(s, 'info', t);
          evt(ev, 'caravane_annoncee', t, -1, car.id, car.chameaux);
        }
        if (s.pas >= car.arriveePas) {
          car.phase = 'approche';
          car.pos = 0;
          car.arret = indiceArret(s);
          evt(ev, 'caravane_arrivee', 'Une caravane entre sur la piste', s.carte.piste[0], car.id, car.chameaux);
          programmerSuivante(s);
        }
        break;
      }
      case 'approche': {
        car.pos += avance;
        if (car.arret < 0) car.arret = indiceArret(s);
        const cible = car.arret >= 0 ? car.arret : fin * 0.5;
        if (car.pos < cible) break;
        car.pos = cible;
        const stock = stockBassins(s);
        if (car.arret >= 0 && stock >= car.besoin * B.caravaneSeuilArret) {
          car.phase = 'abreuvage';
          car.finPhasePas = s.pas + H(B.caravanePatienceH * (caravanserail ? B.caravanserailDuree : 1));
          evt(ev, 'caravane_boit', 'La caravane fait halte au bassin', s.carte.piste[Math.round(car.pos)], car.id);
        } else {
          car.phase = 'passe';
          const punie = !car.indulgente && s.progression.palier >= 1;
          if (punie) {
            s.renommeeCaravanes += B.renommeeManquee;
            s.stats.caravanesManquees++;
          }
          const t =
            car.arret < 0
              ? 'Aucun bassin : la caravane passe son chemin.'
              : 'Bassin presque à sec : la caravane passe son chemin.';
          journal(s, punie ? 'alerte' : 'info', t);
          evt(ev, 'caravane_passe', t, s.carte.piste[Math.round(car.pos)], car.id);
        }
        break;
      }
      case 'abreuvage': {
        let soif = Math.min(car.chameaux * B.caravaneDebitParChameau * DT_H, car.besoin - car.bu);
        for (const b of s.batiments) {
          if (soif <= 0) break;
          if (b.kind !== 'bassin' || b.chantier < 1 || b.stock <= 0) continue;
          const pris = Math.min(b.stock, soif);
          b.stock -= pris;
          car.bu += pris;
          soif -= pris;
        }
        if (car.bu >= car.besoin - 1e-6 || s.pas >= car.finPhasePas) payer(s, car, caravanserail, ev);
        break;
      }
      case 'commerce': {
        if (s.pas >= car.finPhasePas) echanger(s, car, caravanserail, ev);
        break;
      }
      case 'depart':
      case 'passe': {
        car.pos += avance;
        if (car.pos >= fin) {
          s.caravanes.splice(k, 1);
          k--;
        }
        break;
      }
    }
  }
}

/** Changement de phase abreuvage → commerce : le paiement et la renommée sont comptés ICI, une seule fois. */
function payer(s: GameState, car: Caravane, caravanserail: boolean, ev: Evenement[]) {
  const hammam = batimentActif(s, 'hammam', 0.6);
  car.satisfaction = Math.max(0, Math.min(1, car.bu / car.besoin));
  car.paiement = Math.round(
    car.chameaux *
      B.caravanePaieParChameau *
      car.satisfaction *
      (caravanserail ? B.caravanserailPaie : 1) *
      (hammam ? B.hammamPaie : 1) *
      (s.progression.vocation === 'etape' ? B.etapePaie : 1),
  );
  s.res.pieces += car.paiement;
  if (car.satisfaction >= 0.9) {
    s.renommeeCaravanes += B.renommeeServie + (hammam ? B.renommeeHammam : 0);
    s.stats.caravanesServies++;
  } else if (car.satisfaction >= 0.5) {
    s.renommeeCaravanes += B.renommeePartielle;
    s.stats.caravanesPartielles++;
  } else if (!car.indulgente) {
    s.renommeeCaravanes += B.renommeeManquee + 1;
    s.stats.caravanesManquees++;
  }
  car.phase = 'commerce';
  car.finPhasePas = s.pas + H(B.caravaneCommerceH * (caravanserail ? B.caravanserailDuree : 1));
  const t =
    car.satisfaction >= 0.9
      ? `Caravane abreuvée : +${car.paiement} pièces.`
      : `Caravane mal abreuvée (${Math.round(car.satisfaction * 100)} %) : +${car.paiement} pièces seulement.`;
  journal(s, car.satisfaction >= 0.9 ? 'bien' : 'alerte', t);
  evt(ev, 'caravane_payee', t, s.carte.piste[Math.round(car.pos)], car.id, car.paiement);
}

/** Changement de phase commerce → départ : dattes, matériaux et colons, comptés une seule fois. */
function echanger(s: GameState, car: Caravane, caravanserail: boolean, ev: Evenement[]) {
  const sechoir = batimentActif(s, 'sechoir');
  if (car.satisfaction > 0) {
    const demande = car.chameaux * B.caravaneDattesParChameau * car.satisfaction * (caravanserail ? 1.5 : 1);
    const n = Math.floor(Math.min(s.res.dattes, demande));
    if (n > 0) {
      const gain = n * B.prixDatte * (sechoir ? B.sechoirPrix : 1) * (caravanserail ? B.caravanserailDattes : 1);
      s.res.dattes -= n;
      s.res.pieces += gain;
      s.stats.dattesVendues += n;
      car.dattesVendues = n;
    }
    const m = Math.max(
      0,
      Math.min(s.commandeMateriaux, car.chameaux * B.caravaneMateriauxParChameau, Math.floor(s.res.pieces / B.prixMateriau)),
    );
    if (m > 0) {
      s.res.pieces -= m * B.prixMateriau;
      s.res.materiaux += m;
      car.materiauxAchetes = m;
    }
  }
  if (car.satisfaction >= 0.9) {
    let libres = logements(s) - population(s);
    let colons = Math.min(libres, 1 + Math.floor(car.chameaux / 6));
    for (const b of s.batiments) {
      if (colons <= 0) break;
      if (b.kind !== 'maison' || b.chantier < 1) continue;
      while (b.habitants < B.maisonCapacite && colons > 0) {
        b.habitants++;
        colons--;
        car.colons++;
        libres--;
      }
    }
    if (car.colons > 0) evt(ev, 'colons', `${car.colons} colons s’installent`, -1, car.id, car.colons);
  }
  car.phase = 'depart';
  const morceaux: string[] = [];
  if (car.dattesVendues) morceaux.push(`${car.dattesVendues} dattes vendues`);
  if (car.materiauxAchetes) morceaux.push(`${car.materiauxAchetes} matériaux achetés`);
  if (car.colons) morceaux.push(`${car.colons} colons installés`);
  const t = morceaux.length ? `La caravane repart : ${morceaux.join(', ')}.` : 'La caravane repart.';
  journal(s, 'info', t);
  evt(ev, 'caravane_depart', t, s.carte.piste[Math.round(car.pos)], car.id);
}

/* ----------------------------------------------------------------- chantiers */

function chantiers(s: GameState, c: Cache, ev: Evenement[]) {
  let fini = false;
  const bras = 0.6 + 0.4 * Math.min(1, c.ouvriersLibres / 2);
  for (const b of s.batiments) {
    if (b.chantier >= 1) continue;
    const def = BATIMENTS[b.kind];
    b.chantier += (DT_H / def.chantierH) * bras;
    if (b.chantier >= 1) {
      b.chantier = 1;
      fini = true;
      evt(ev, 'chantier_fini', `${def.nom} terminé${def.nom.endsWith('e') ? 'e' : ''}`, idx(b.x, b.z), b.id);
    }
  }
  if (fini) invalider(s);
  if (s.foggaraChantier >= 0) {
    s.foggaraChantier += (DT_H / B.foggaraChantierH) * (0.5 + 0.5 * Math.min(1, c.ouvriersLibres / 3));
    if (s.foggaraChantier >= 1) {
      s.foggaraChantier = -1;
      s.foggaraNiveau++;
      const t = 'La foggara est prolongée : la source donne davantage.';
      journal(s, 'bien', t);
      evt(ev, 'foggara_finie', t, s.carte.sourceCase);
    }
  }
}

export { JOURS_PAR_AN };
