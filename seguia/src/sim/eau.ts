/**
 * Solveur d'eau : à chaque pas, le débit descend le réseau de l'amont vers l'aval.
 * Transport instantané (aucune eau stockée dans les canaux), donc aucun risque d'oscillation.
 * Bilan garanti à chaque pas : injecté = évaporé + consommé + déversé.
 */
import { B, BATIMENTS } from './balance';
import { majOmbre, topologie, type Cache } from './cache';
import { calendrier, canicule, casesDe } from './etat';
import { DT_H, N, type Batiment, type GameState } from './types';

/** Débit de la source principale (u/h) à cet instant. */
export function debitSource(s: GameState): number {
  const cal = calendrier(s.pas);
  let nbPuits = 0;
  for (const b of s.batiments) if (b.kind === 'puits' && b.chantier >= 1 && !b.pause) nbPuits++;
  const puits = Math.max(B.puitsPlancher, 1 - B.puitsBaisse * nbPuits);
  return (
    B.sourceDebit *
    (1 + B.sourceParNiveau * s.foggaraNiveau) *
    B.sourceSaison[cal.saison] *
    (s.options.secheresse ? B.sourceSecheresse : 1) *
    puits
  );
}

/** Facteur d'évaporation commun à toutes les cases à cet instant. */
export function facteurEvap(s: GameState): number {
  const cal = calendrier(s.pas);
  return (
    B.evapSaison[cal.saison] *
    (canicule(s) ? B.evapCanicule : 1) *
    (B.evapNuit + (B.evapJour - B.evapNuit) * cal.lumiere)
  );
}

/** Part du débit perdue en traversant la case i. */
export function tauxPerte(s: GameState, c: Cache, i: number, fEvap: number): number {
  const base = s.canal[i] === 2 ? B.perteMaconne : B.perteTerre;
  return Math.min(0.5, base * fEvap * (c.ombre[i] ? B.ombrePerte : 1));
}

function sableMoyen(s: GameState, b: Batiment): number {
  let t = 0;
  const cs = casesDe(b);
  for (const i of cs) t += s.sable[i];
  return t / cs.length;
}

/** Besoin en eau d'un consommateur à cet instant (u/h). */
export function besoinEau(s: GameState, c: Cache, b: Batiment): number {
  if (b.chantier < 1 || b.pause) return 0;
  const def = BATIMENTS[b.kind];
  const cal = calendrier(s.pas);
  const fBesoin = B.besoinSaison[cal.saison] * (canicule(s) ? B.besoinCanicule : 1);
  switch (b.kind) {
    case 'jardin': {
      if (sableMoyen(s, b) > 0.5) return 0; // enseveli : l'eau n'y entre plus
      const ombre = c.ombre[b.z * N + b.x] ? B.jardinOmbreBesoin : 1;
      return def.eau * fBesoin * ombre;
    }
    case 'palmeraie': {
      if (sableMoyen(s, b) > 0.7) return 0;
      const base = B.palmeraieEauJeune + (def.eau - B.palmeraieEauJeune) * b.croissance;
      return base * (1 + (fBesoin - 1) * 0.5);
    }
    case 'bassin':
      return Math.max(0, Math.min(def.eau, (B.bassinCapacite - b.stock) / DT_H));
    case 'citerne':
      return b.vanne === 0 ? Math.max(0, Math.min(def.eau, (B.citerneCapacite - b.stock) / DT_H)) : 0;
    case 'noria':
      return c.rejet.has(b.id) ? def.eau * b.personnel : 0;
    case 'briqueterie':
      return b.personnel > 0 ? def.eau : 0;
    default:
      return def.eau;
  }
}

/**
 * Résout le réseau pour ce pas. Met à jour les stocks (bassins, citernes, norias),
 * `eauRatio` de chaque bâtiment, les débits par case et les cumuls de statistiques.
 */
export function resoudreEau(s: GameState): Cache {
  const c = topologie(s);
  majOmbre(s, c);
  const { recu, inject, debit, deverse } = c;
  const fEvap = facteurEvap(s);
  for (let k = 0; k < c.nbOrdre; k++) {
    const i = c.ordre[k];
    recu[i] = 0;
    inject[i] = 0;
  }
  debit.fill(0);
  deverse.fill(0);

  let injecte = 0;
  let evapore = 0;
  let consomme = 0;
  let deverseTotal = 0;

  // --- injections ---
  const qSource = debitSource(s);
  if (c.rang[s.carte.sourceCase] >= 0) {
    inject[s.carte.sourceCase] += qSource;
    injecte += qSource;
  }
  for (const b of s.batiments) {
    if (b.chantier < 1) continue;
    if (b.kind === 'puits') {
      const i = c.branchement.get(b.id);
      if (i !== undefined && !b.pause) {
        const q = B.puitsDebit * b.personnel;
        inject[i] += q;
        injecte += q;
      }
    } else if (b.kind === 'citerne') {
      const i = c.branchement.get(b.id);
      if (i !== undefined && b.vanne === 2 && b.stock > 0) {
        const q = Math.min(B.citerneVidange, b.stock / DT_H);
        b.stock = Math.max(0, b.stock - q * DT_H);
        inject[i] += q;
        injecte += q;
      }
    } else if (b.kind === 'noria') {
      const haut = c.rejet.get(b.id);
      if (haut !== undefined && b.stock > 0) {
        const q = (b.stock / DT_H) * B.noriaRendement;
        b.stock = 0;
        inject[haut] += q;
        injecte += q;
      }
    }
  }

  // --- remise à zéro des ratios des consommateurs ---
  for (const b of s.batiments) {
    const def = BATIMENTS[b.kind];
    if (def.eau > 0 && b.kind !== 'puits') b.eauRatio = b.chantier >= 1 && !b.pause ? 0 : 1;
    else b.eauRatio = 1;
  }

  // --- descente du réseau ---
  for (let k = 0; k < c.nbOrdre; k++) {
    const i = c.ordre[k];
    const arrive = recu[i] + inject[i];
    if (arrive <= 0) continue;
    const passe = arrive * (1 - B.sableBlocage * s.sable[i]);
    const bloque = arrive - passe;
    if (bloque > 0) {
      deverse[i] += bloque;
      deverseTotal += bloque;
    }
    const perte = passe * tauxPerte(s, c, i, fEvap);
    evapore += perte;
    let dispo = passe - perte;
    debit[i] = passe;

    const liste = c.conso.get(i);
    if (liste) {
      for (const b of liste) {
        const besoin = besoinEau(s, c, b);
        if (besoin <= 0) {
          b.eauRatio = 1;
          continue;
        }
        const pris = Math.min(besoin, dispo);
        dispo -= pris;
        consomme += pris;
        b.eauRatio = pris / besoin;
        if (b.kind === 'bassin' || b.kind === 'citerne' || b.kind === 'noria') b.stock += pris * DT_H;
      }
    }

    // partage entre les branches aval
    const rep = c.repartiteurs.get(i);
    let somme = 0;
    for (let d = 0; d < 4; d++) {
      if (c.enfant[i * 4 + d] >= 0) somme += rep ? rep.poids[d] : 1;
    }
    if (somme <= 0) {
      if (dispo > 0) {
        deverse[i] += dispo;
        deverseTotal += dispo;
      }
    } else {
      for (let d = 0; d < 4; d++) {
        const e = c.enfant[i * 4 + d];
        if (e >= 0) recu[e] += (dispo * (rep ? rep.poids[d] : 1)) / somme;
      }
    }
  }

  // bassins et citernes à ciel ouvert : légère évaporation du stock
  const cal = calendrier(s.pas);
  const evapStock = (B.evapBassinParJour / 24) * DT_H * B.evapSaison[cal.saison];
  for (const b of s.batiments) {
    if (b.kind === 'bassin' && b.stock > 0) b.stock = Math.max(0, b.stock * (1 - evapStock));
    else if (b.kind === 'citerne' && b.stock > 0) b.stock = Math.max(0, b.stock * (1 - evapStock * 0.25));
  }

  c.bilan.injecte = injecte;
  c.bilan.source = qSource;
  c.bilan.evapore = evapore;
  c.bilan.consomme = consomme;
  c.bilan.deverse = deverseTotal;
  s.stats.eauInjectee += injecte * DT_H;
  s.stats.eauUtile += consomme * DT_H;
  s.stats.eauEvaporee += evapore * DT_H;
  s.stats.eauDeversee += deverseTotal * DT_H;
  return c;
}
