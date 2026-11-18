/**
 * Commandes du joueur : validation (cause de refus + action suggérée) puis application.
 * Toute modification de l'état par le joueur passe par ici.
 */
import { B, BATIMENTS } from './balance';
import { cacheDe, invalider, topologie } from './cache';
import {
  batimentParId,
  casesDe,
  cx,
  cz,
  dans,
  idx,
  journal,
  logements,
  nouveauBatiment,
  population,
  pourtourDe,
} from './etat';
import { N, Sol, type Batiment, type BatimentKind, type Commande, type Dir, type GameState, type Resultat } from './types';

const refus = (cause: string, suggestion: string): Resultat => ({ ok: false, cause, suggestion });

export function estDebloque(s: GameState, kind: BatimentKind): boolean {
  const def = BATIMENTS[kind];
  if (!def.constructible) return false;
  if (s.progression.palier < def.palier) return false;
  if (def.vocation && s.progression.vocation !== def.vocation) return false;
  return true;
}

export function raisonVerrou(s: GameState, kind: BatimentKind): string {
  const def = BATIMENTS[kind];
  if (s.progression.palier < def.palier) {
    return def.palier === 1
      ? 'Disponible après le palier « La première eau ».'
      : 'Disponible après le palier « Le relais ».';
  }
  if (def.vocation && s.progression.vocation !== def.vocation) {
    return def.vocation === 'etape'
      ? 'Réservé à la vocation « Étape des caravanes ».'
      : 'Réservé à la vocation « Grenier du désert ».';
  }
  return '';
}

/** Distance (de Tchebychev) de la case à la piste la plus proche. */
export function distancePiste(s: GameState, i: number): number {
  const x = cx(i);
  const z = cz(i);
  let best = 999;
  for (const p of s.carte.piste) {
    const d = Math.max(Math.abs(cx(p) - x), Math.abs(cz(p) - z));
    if (d < best) best = d;
  }
  return best;
}

export interface Verification {
  ok: boolean;
  cause: string;
  suggestion: string;
  /** remarque non bloquante (ex. bâtiment qui restera à sec) */
  avertissement: string;
  /** emprise après rotation */
  w: number;
  d: number;
}

/** Vérifie une pose de bâtiment sans rien modifier (sert aussi à l'aperçu de construction). */
export function verifierConstruction(s: GameState, kind: BatimentKind, x: number, z: number, rot: Dir): Verification {
  const def = BATIMENTS[kind];
  const tourne = rot === 1 || rot === 3;
  const w = tourne ? def.d : def.w;
  const d = tourne ? def.w : def.d;
  const non = (cause: string, suggestion: string): Verification => ({ ok: false, cause, suggestion, avertissement: '', w, d });
  if (!def.constructible) return non('Ce bâtiment ne se construit pas.', '');
  if (!estDebloque(s, kind)) return non('Pas encore disponible.', raisonVerrou(s, kind));
  if (!dans(x, z) || !dans(x + w - 1, z + d - 1)) return non('Hors du plateau.', 'Restez sur le bloc de désert.');
  const c = cacheDe(s);
  const { elev, sol } = s.carte;
  const e0 = elev[idx(x, z)];
  let minPiste = 999;
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const i = idx(x + dx, z + dz);
      if (sol[i] === Sol.Roche) return non('Rocher : on ne bâtit pas dessus.', 'Choisissez un sol de sable ou de cailloux.');
      if (sol[i] === Sol.Dune) return non('Dune mouvante : rien n’y tient.', 'Éloignez-vous du cordon de dunes.');
      if (sol[i] === Sol.Piste) return non('La piste doit rester libre pour les caravanes.', 'Bâtissez juste à côté de la piste.');
      if (elev[i] !== e0) return non("L'emprise chevauche deux terrasses.", 'Décalez le bâtiment pour qu’il soit à plat.');
      if (c.occ[i]) return non('Un bâtiment occupe déjà la place.', 'Choisissez un emplacement libre ou démolissez-le.');
      if (s.cloture[i]) return non('Un brise-vent occupe la case.', 'Effacez-le d’abord (outil Effacer).');
      if (def.surCanal) {
        if (!s.canal[i]) return non('Le répartiteur se pose sur une séguia.', 'Placez-le sur la case où le canal se divise.');
        if (i === s.carte.sourceCase) return non('Pas sur la sortie de la source.', 'Posez-le une case plus loin, à la première jonction.');
      } else if (s.canal[i]) {
        return non('Une séguia passe ici.', 'Posez le bâtiment à côté du canal : il s’y branche tout seul.');
      }
      if (def.presPiste) minPiste = Math.min(minPiste, distancePiste(s, i));
    }
  }
  if (def.presPiste && minPiste > def.presPiste) {
    return non(
      `Trop loin de la piste (${minPiste} cases, ${def.presPiste} au plus).`,
      'Rapprochez-le de la piste des caravanes.',
    );
  }
  if (s.res.pieces < def.pieces) {
    return non(
      `Il manque ${Math.ceil(def.pieces - s.res.pieces)} pièces.`,
      'Abreuvez une caravane ou vendez-lui des dattes.',
    );
  }
  if (s.res.materiaux < def.materiaux) {
    return non(
      `Il manque ${Math.ceil(def.materiaux - s.res.materiaux)} matériaux.`,
      'Commandez-en à la prochaine caravane (panneau Caravanes).',
    );
  }
  // avertissements non bloquants
  let avertissement = '';
  const fictif = { x, z, w, d };
  if (def.branche) {
    const t = topologie(s);
    let raccord = false;
    let touche = false;
    for (const i of pourtourDe(fictif)) {
      if (!s.canal[i]) continue;
      touche = true;
      if (t.rang[i] < 0) continue;
      if (kind === 'puits' ? elev[i] <= e0 : elev[i] >= e0) raccord = true;
    }
    if (kind === 'puits') {
      if (!touche) avertissement = 'Aucune séguia voisine : le puits ne pourra rien alimenter.';
    } else if (!raccord) {
      avertissement = touche
        ? "La séguia voisine est plus basse ou à sec : l'eau ne montera pas jusqu'ici."
        : 'Aucune séguia ne touche cet emplacement : il restera à sec tant qu’un canal ne l’atteint pas.';
    }
  }
  if (kind === 'maison' && !aEauPotable(s, x + w / 2, z + d / 2)) {
    avertissement = 'Aucune fontaine en eau à moins de 7 cases : la maison ne se peuplera pas.';
  }
  return { ok: true, cause: '', suggestion: '', avertissement, w, d };
}

/** Le point (en cases, centre d'emprise) est-il desservi en eau potable ? */
export function aEauPotable(s: GameState, px: number, pz: number): boolean {
  const sx = cx(s.carte.sourceCase) + 0.5;
  const sz = cz(s.carte.sourceCase) + 0.5;
  if (Math.hypot(px - sx, pz - sz) <= B.sourceRayonPotable) return true;
  for (const b of s.batiments) {
    if (b.kind !== 'fontaine' || b.chantier < 1 || b.pause || b.eauRatio < 0.5) continue;
    if (Math.hypot(px - (b.x + 0.5), pz - (b.z + 0.5)) <= B.fontaineRayon) return true;
  }
  return false;
}

export function verifierCanal(s: GameState, i: number, type: 1 | 2): Resultat {
  if (i < 0 || i >= N * N) return refus('Hors du plateau.', '');
  const sol = s.carte.sol[i];
  if (sol === Sol.Roche) return refus('On ne creuse pas la roche.', 'Contournez le rocher.');
  if (sol === Sol.Dune) return refus('Le sable de la dune comblerait aussitôt le canal.', 'Passez plus loin des dunes.');
  const c = cacheDe(s);
  if (c.occ[i]) {
    const b = batimentParId(s, c.occ[i]);
    if (!b || b.kind !== 'repartiteur') return refus('Un bâtiment occupe la case.', 'Faites passer la séguia à côté.');
  }
  if (s.cloture[i]) return refus('Un brise-vent occupe la case.', 'Effacez-le d’abord (outil Effacer).');
  if (type === 2 && s.progression.palier < 1) {
    return refus('La séguia maçonnée arrive après le palier « La première eau ».', '');
  }
  return { ok: true };
}

export function coutCanal(s: GameState, i: number, type: 1 | 2): { pieces: number; materiaux: number } {
  const actuel = s.canal[i];
  if (actuel >= type) return { pieces: 0, materiaux: 0 };
  if (type === 1) return { pieces: B.coutCanalTerre, materiaux: 0 };
  return { pieces: B.coutCanalMaconnePieces, materiaux: B.coutCanalMaconneMateriaux };
}

export function verifierCloture(s: GameState, i: number, type: 1 | 2): Resultat {
  if (i < 0 || i >= N * N) return refus('Hors du plateau.', '');
  const sol = s.carte.sol[i];
  if (sol !== Sol.Sable && sol !== Sol.Reg) return refus('Sol impropre à une clôture.', 'Choisissez du sable ou des cailloux.');
  if (cacheDe(s).occ[i]) return refus('Un bâtiment occupe la case.', '');
  if (s.canal[i]) return refus('Une séguia passe ici.', 'Plantez le brise-vent le long du canal, côté vent.');
  if (s.progression.palier < 1) return refus('Les brise-vent arrivent après le palier « La première eau ».', '');
  return { ok: true };
}

function retirerBatiment(s: GameState, b: Batiment) {
  const k = s.batiments.indexOf(b);
  if (k >= 0) s.batiments.splice(k, 1);
  invalider(s);
}

/** Applique une commande. Renvoie le succès ou la cause du refus. */
export function appliquer(s: GameState, cmd: Commande): Resultat {
  switch (cmd.t) {
    case 'construire': {
      const v = verifierConstruction(s, cmd.kind, cmd.x, cmd.z, cmd.rot);
      if (!v.ok) return refus(v.cause, v.suggestion);
      const def = BATIMENTS[cmd.kind];
      const b = nouveauBatiment(s.prochainId++, cmd.kind, cmd.x, cmd.z, cmd.rot, s.pas);
      s.res.pieces -= def.pieces;
      s.res.materiaux -= def.materiaux;
      s.batiments.push(b);
      s.annulables.push({
        pas: s.pas,
        type: 'batiment',
        id: b.id,
        cases: [],
        avant: [],
        pieces: def.pieces,
        materiaux: def.materiaux,
      });
      invalider(s);
      return { ok: true, id: b.id, cout: { pieces: def.pieces, materiaux: def.materiaux }, message: v.avertissement };
    }
    case 'canal': {
      let premier: Resultat | null = null;
      const faites: number[] = [];
      const avant: number[] = [];
      let pieces = 0;
      let materiaux = 0;
      let interrompu = '';
      for (const i of cmd.cases) {
        const r = verifierCanal(s, i, cmd.type);
        if (!r.ok) {
          if (!premier) premier = r;
          continue;
        }
        const cout = coutCanal(s, i, cmd.type);
        if (cout.pieces === 0 && cout.materiaux === 0) continue; // déjà fait
        if (s.res.pieces < cout.pieces) {
          interrompu = 'Tracé interrompu : plus assez de pièces.';
          break;
        }
        if (s.res.materiaux < cout.materiaux) {
          interrompu = 'Tracé interrompu : plus assez de matériaux.';
          break;
        }
        s.res.pieces -= cout.pieces;
        s.res.materiaux -= cout.materiaux;
        pieces += cout.pieces;
        materiaux += cout.materiaux;
        faites.push(i);
        avant.push(s.canal[i]);
        s.canal[i] = cmd.type;
      }
      if (faites.length === 0) {
        if (interrompu) {
          return refus(
            interrompu.replace('Tracé interrompu : p', 'P'),
            cmd.type === 2 ? 'Commandez des matériaux à la prochaine caravane.' : 'Abreuvez une caravane pour gagner des pièces.',
          );
        }
        return premier ?? { ok: true, cout: { pieces: 0, materiaux: 0 } };
      }
      s.annulables.push({ pas: s.pas, type: 'canal', id: 0, cases: faites, avant, pieces, materiaux });
      invalider(s);
      return { ok: true, cout: { pieces, materiaux }, message: interrompu };
    }
    case 'cloture': {
      let premier: Resultat | null = null;
      const faites: number[] = [];
      const avant: number[] = [];
      let pieces = 0;
      let interrompu = '';
      const prix = cmd.type === 1 ? B.coutCloture : B.coutHaie;
      for (const i of cmd.cases) {
        const r = verifierCloture(s, i, cmd.type);
        if (!r.ok) {
          if (!premier) premier = r;
          continue;
        }
        if (s.cloture[i] === cmd.type && s.clotureEtat[i] >= 0.999) continue;
        if (s.res.pieces < prix) {
          interrompu = 'Tracé interrompu : plus assez de pièces.';
          break;
        }
        s.res.pieces -= prix;
        pieces += prix;
        faites.push(i);
        avant.push(s.cloture[i]);
        s.cloture[i] = cmd.type;
        s.clotureEtat[i] = 1;
      }
      if (faites.length === 0) {
        if (interrompu) return refus('Plus assez de pièces.', 'Abreuvez une caravane pour gagner des pièces.');
        return premier ?? { ok: true, cout: { pieces: 0, materiaux: 0 } };
      }
      s.annulables.push({ pas: s.pas, type: 'cloture', id: 0, cases: faites, avant, pieces, materiaux: 0 });
      invalider(s);
      return { ok: true, cout: { pieces, materiaux: 0 }, message: interrompu };
    }
    case 'demolir': {
      const b = batimentParId(s, cmd.id);
      if (!b) return refus('Bâtiment introuvable.', '');
      if (b.kind === 'source') return refus('La source ne se démolit pas.', '');
      const def = BATIMENTS[b.kind];
      const rendP = Math.floor(def.pieces * B.remboursementDemolition);
      const rendM = Math.floor(def.materiaux * B.remboursementDemolition);
      s.res.pieces += rendP;
      s.res.materiaux += rendM;
      if (b.kind === 'maison' && b.habitants > 0) relogerOuPartir(s, b);
      retirerBatiment(s, b);
      s.annulables = s.annulables.filter((a) => !(a.type === 'batiment' && a.id === b.id));
      return { ok: true, cout: { pieces: -rendP, materiaux: -rendM } };
    }
    case 'effacer': {
      const c = cacheDe(s);
      let n = 0;
      let bloque: Resultat | null = null;
      for (const i of cmd.cases) {
        if (i < 0 || i >= N * N) continue;
        if (s.cloture[i]) {
          s.cloture[i] = 0;
          s.clotureEtat[i] = 0;
          n++;
        }
        if (s.canal[i]) {
          if (i === s.carte.sourceCase) {
            bloque = refus('La sortie de la source ne s’efface pas.', '');
            continue;
          }
          if (c.occ[i]) {
            bloque = refus('Un répartiteur est posé sur cette séguia.', 'Démolissez d’abord le répartiteur.');
            continue;
          }
          s.canal[i] = 0;
          n++;
        }
      }
      if (n === 0) return bloque ?? refus('Rien à effacer ici.', 'L’outil Effacer retire séguias et brise-vent ; pour un bâtiment, sélectionnez-le.');
      invalider(s);
      return { ok: true };
    }
    case 'poids': {
      const b = batimentParId(s, cmd.id);
      if (!b || b.kind !== 'repartiteur') return refus('Ce n’est pas un répartiteur.', '');
      b.poids = cmd.poids.map((p) => Math.max(0, Math.min(3, Math.round(p)))) as [number, number, number, number];
      return { ok: true };
    }
    case 'vanne': {
      const b = batimentParId(s, cmd.id);
      if (!b || b.kind !== 'citerne') return refus('Ce n’est pas une citerne.', '');
      b.vanne = cmd.vanne;
      return { ok: true };
    }
    case 'pause': {
      const b = batimentParId(s, cmd.id);
      if (!b) return refus('Bâtiment introuvable.', '');
      if (b.kind === 'source' || b.kind === 'maison' || b.kind === 'repartiteur') {
        return refus('Ce bâtiment ne se met pas à l’arrêt.', '');
      }
      b.pause = cmd.pause;
      return { ok: true };
    }
    case 'corvee':
      s.corvee = cmd.on;
      journal(s, 'info', cmd.on ? 'Corvée générale : tout le monde cure les canaux.' : 'Fin de la corvée : chacun retourne à son poste.');
      return { ok: true };
    case 'vocation': {
      if (!s.progression.choixVocationEnAttente) return refus('Le choix de la vocation viendra à la fin du palier « Le relais ».', '');
      s.progression.vocation = cmd.v;
      s.progression.choixVocationEnAttente = false;
      s.progression.palier = 2;
      s.res.pieces += 50;
      s.res.materiaux += 25;
      journal(
        s,
        'bien',
        cmd.v === 'etape'
          ? 'Vocation choisie : Étape des caravanes. Hammam et fanal disponibles.'
          : 'Vocation choisie : Grenier du désert. Séchoir à dattes et noria disponibles.',
      );
      return { ok: true };
    }
    case 'acheterVivres': {
      const car = s.caravanes.find((k) => k.phase === 'commerce' || k.phase === 'abreuvage');
      if (!car) return refus('Aucune caravane à l’étape.', 'Attendez la prochaine caravane : elle vend des vivres pendant son arrêt.');
      const maxi = car.chameaux * B.caravaneVivresParChameau - car.vivresVendus;
      if (maxi <= 0) return refus('Cette caravane n’a plus de vivres à vendre.', '');
      const n = Math.min(Math.max(1, Math.floor(cmd.n)), maxi, Math.floor(s.res.pieces / B.prixVivre));
      if (n <= 0) return refus('Pas assez de pièces.', `Un vivre coûte ${B.prixVivre} pièce et demie.`);
      s.res.pieces -= n * B.prixVivre;
      s.res.vivres += n;
      car.vivresVendus += n;
      return { ok: true, cout: { pieces: n * B.prixVivre, materiaux: 0 }, message: `${n} vivres achetés.` };
    }
    case 'commande':
      s.commandeMateriaux = Math.max(0, Math.min(60, Math.round(cmd.n)));
      return { ok: true };
    case 'foggara': {
      if (s.progression.palier < 1) return refus('La foggara se prolonge après le palier « La première eau ».', '');
      if (s.foggaraNiveau >= 2) return refus('La foggara ne peut pas aller plus loin.', 'Creusez un puits pour un appoint local.');
      if (s.foggaraChantier >= 0) return refus('Les puisatiers sont déjà au travail.', '');
      const p = B.foggaraPieces[s.foggaraNiveau];
      const m = B.foggaraMateriaux[s.foggaraNiveau];
      if (s.res.pieces < p) return refus(`Il manque ${Math.ceil(p - s.res.pieces)} pièces.`, 'Abreuvez une caravane ou vendez-lui des dattes.');
      if (s.res.materiaux < m) return refus(`Il manque ${Math.ceil(m - s.res.materiaux)} matériaux.`, 'Commandez-en à la prochaine caravane.');
      s.res.pieces -= p;
      s.res.materiaux -= m;
      s.foggaraChantier = 0;
      journal(s, 'info', 'Les puisatiers prolongent la foggara : la source donnera 30 % de plus.');
      return { ok: true, cout: { pieces: p, materiaux: m } };
    }
    case 'annuler': {
      const a = s.annulables[s.annulables.length - 1];
      if (!a) return refus('Rien à annuler.', '');
      if (s.pas - a.pas > B.annulerPas) {
        return refus('Trop tard pour annuler.', 'Sélectionnez le bâtiment et démolissez-le (remboursé à moitié).');
      }
      s.annulables.pop();
      if (a.type === 'batiment') {
        const b = batimentParId(s, a.id);
        if (!b) return refus('Ce bâtiment n’existe plus.', '');
        if (b.kind === 'maison' && b.habitants > 0) relogerOuPartir(s, b);
        retirerBatiment(s, b);
      } else if (a.type === 'canal') {
        const c = cacheDe(s);
        for (let k = 0; k < a.cases.length; k++) {
          const i = a.cases[k];
          if (a.avant[k] === 0 && c.occ[i]) continue; // un répartiteur a été posé dessus entre-temps
          s.canal[i] = a.avant[k];
        }
        invalider(s);
      } else {
        for (let k = 0; k < a.cases.length; k++) {
          s.cloture[a.cases[k]] = a.avant[k];
          s.clotureEtat[a.cases[k]] = a.avant[k] ? 1 : 0;
        }
        invalider(s);
      }
      s.res.pieces += a.pieces;
      s.res.materiaux += a.materiaux;
      return { ok: true, cout: { pieces: -a.pieces, materiaux: -a.materiaux }, message: 'Annulé et remboursé.' };
    }
  }
}

/** Les habitants d'une maison supprimée s'installent ailleurs s'il reste de la place, sinon ils partent. */
function relogerOuPartir(s: GameState, maison: Batiment) {
  let n = maison.habitants;
  maison.habitants = 0;
  for (const b of s.batiments) {
    if (n <= 0) break;
    if (b === maison || b.kind !== 'maison' || b.chantier < 1) continue;
    const place = B.maisonCapacite - b.habitants;
    const k = Math.min(place, n);
    b.habitants += k;
    n -= k;
  }
  if (n > 0) {
    s.stats.habitantsPartis += n;
    journal(s, 'alerte', `${n} habitant${n > 1 ? 's' : ''} sans toit ${n > 1 ? 'ont' : 'a'} quitté l'oasis.`);
  }
}

// exporté pour l'interface : logements libres
export function logementsLibres(s: GameState): number {
  return logements(s) - population(s);
}

export { casesDe };
