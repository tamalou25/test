// REVUE : copie générée de tests/bots/strategies.ts (rechargement à un pas quelconque). Régénérer si l'original change.
/**
 * Bots de stratégie : ils jouent le scénario par les commandes du joueur, sans affichage.
 *  - etape    : mise sur les caravanes (bassins, caravansérail, hammam, fanal)
 *  - grenier  : mise sur les cultures (palmeraies, jardins à l'ombre, séchoir)
 *  - negligent: même ouverture, mais ne règle plus rien ensuite
 *               (ni répartiteur, ni citerne, ni brise-vent, ni corvée)
 *
 * Plan commun : un canal principal file au sud vers la piste (fontaines, maisons, bassin) ;
 * une branche de cultures part vers l'est près de la source, parcelles sur ses deux rives.
 * Le répartiteur posé à la jonction décide qui boit : les cultures ou le bassin.
 */
import {
  B,
  cacheDe,
  calendrier,
  canal,
  cmd,
  cx,
  cz,
  dans,
  idx,
  nb,
  nouvellePartie,
  pas,
  PAS_PAR_JOUR,
  population,
  poserPres,
  resume,
  traceL,
  type Partie,
} from '../bots/lib';
import {
  deserialiser,
  DX,
  DZ,
  serialiser,
  tempeteEnCours,
  verifierConstruction,
  type BatimentKind,
  type Dir,
  type GameState,
} from '../../src/sim';

export type NomStrategie = 'etape' | 'grenier' | 'negligent';

function logementsLibres(s: GameState): number {
  let cap = 0;
  for (const b of s.batiments) if (b.kind === 'maison') cap += B.maisonCapacite;
  return cap - population(s);
}

/** Brise-vent à une case des séguias, du côté d'où vient le vent. */
function briseVent(p: Partie, dir: Dir) {
  const s = p.s;
  const c = cacheDe(s);
  const cases: number[] = [];
  for (let i = 0; i < s.canal.length; i++) {
    if (!s.canal[i]) continue;
    const x = cx(i) + DX[dir];
    const z = cz(i) + DZ[dir];
    if (!dans(x, z)) continue;
    const j = idx(x, z);
    if (s.canal[j] || c.occ[j] || s.cloture[j]) continue;
    cases.push(j);
  }
  if (cases.length) cmd(p, { t: 'cloture', cases, type: 1 });
}

export interface OptionsJeu {
  secheresse?: boolean;
  /** à ce pas, l'état est sauvegardé puis rechargé (test de reprise) */
  rechargerAuPas?: number;
  /** appelé après chaque tour de décision */
  apresTour?: (p: Partie) => void;
  /** REVUE : pas ABSOLUS (valeur de s.pas) auxquels sauvegarder puis recharger */
  rechargerAuxPas?: number[];
  /** REVUE : appelé après chaque pas ; renvoyer true arrête la partie */
  apresPas?: (p: Partie, ev: import('../../src/sim').Evenement[]) => boolean | void;
  /** consigne toutes les commandes (pour les rejouer dans l'application empaquetée) */
  consigner?: boolean;
}

export function jouer(nom: NomStrategie, graine: number, jours: number, options: OptionsJeu = {}): Partie {
  const p = nouvellePartie(graine, !!options.secheresse);
  if (options.consigner) p.journalCommandes = [];
  let s = p.s;
  const sx = cx(s.carte.sourceCase);
  const sz = cz(s.carte.sourceCase);
  let zPiste = 0;
  for (const i of s.carte.piste) if (Math.abs(cx(i) - sx) <= 1) zPiste = Math.max(zPiste, cz(i));
  const finZ = zPiste - 2;
  const zc = sz + 2; // rangée de la branche de cultures
  const longueurBranche = 14;

  // --- ouverture commune ---
  canal(p, traceL(sx, sz, sx, finZ));
  canal(p, traceL(sx, zc, sx + 5, zc));
  let brancheFin = sx + 5;

  /** emplacements de parcelles le long de la branche : rive nord puis rive sud, d'ouest en est */
  const emplacements: { x: number; z: number }[] = [];
  for (let k = 0; k < longueurBranche / 2; k++) {
    emplacements.push({ x: sx + 1 + k * 2, z: zc + 1 });
    emplacements.push({ x: sx + 1 + k * 2, z: zc - 2 });
  }
  let prochain = 0;
  const poserParcelle = (kind: BatimentKind): boolean => {
    while (prochain < emplacements.length) {
      const e = emplacements[prochain];
      // prolonger la branche si besoin
      if (e.x + 1 > brancheFin) {
        const r = canal(p, traceL(brancheFin, zc, e.x + 1, zc));
        if (!r.ok) return false;
        brancheFin = e.x + 1;
      }
      const v = verifierConstruction(s, kind, e.x, e.z, 0);
      if (!v.ok) {
        if (v.cause.startsWith('Il manque')) return false;
        prochain++;
        continue;
      }
      const r = cmd(p, { t: 'construire', kind, x: e.x, z: e.z, rot: 0 });
      prochain++;
      return r.ok;
    }
    return false;
  };

  poserParcelle('jardin');
  poserParcelle('jardin');
  poserPres(p, 'fontaine', sx + 1, sz + 6, 3);
  poserPres(p, 'maison', sx + 2, sz + 7, 5);
  poserPres(p, 'bassin', sx + 1, finZ - 1, 6);

  let repartiteur = 0;
  let citerne = 0;
  let derniereAlerte = -1;
  const neglige = nom === 'negligent';

  const tour = () => {
    const cal = calendrier(s.pas);
    const pop = population(s);
    const palier = s.progression.palier;
    if (s.progression.choixVocationEnAttente) cmd(p, { t: 'vocation', v: nom === 'grenier' ? 'grenier' : 'etape' });

    // --- vivres : un jardin pour 5 habitants (logés ou attendus) ---
    const jardins = nb(p, 'jardin');
    const cibleJardins = Math.min(12, Math.ceil((pop + 3) / 5));
    if (jardins < cibleJardins && s.res.pieces >= 8 + 6) poserParcelle('jardin');

    // --- palmeraies ---
    const ciblePalm = nom === 'grenier' ? (palier >= 2 ? 9 : 4) : palier >= 1 ? 3 : 2;
    if (nb(p, 'palmeraie') < ciblePalm && cal.jour >= 1 && s.res.pieces >= 14 + (nom === 'grenier' ? 10 : 25)) {
      poserParcelle('palmeraie');
    }

    // --- logements, tant qu'il y a de quoi manger ---
    const maisons = nb(p, 'maison');
    const cibleMaisons = nom === 'grenier' ? 11 : 10;
    if (logementsLibres(s) <= 1 && maisons < cibleMaisons && s.res.vivres > pop * 0.7 && s.res.pieces >= 10 + 10 && s.res.materiaux >= 4) {
      const ok = poserPres(p, 'maison', sx + 2 + (maisons % 2 ? -5 : 0), sz + 7 + Math.floor(maisons / 2) * 2, 5);
      if (!ok && nb(p, 'fontaine') < 3 && s.res.pieces >= 30 && s.res.materiaux >= 8) {
        poserPres(p, 'fontaine', sx - 1, sz + 10, 3);
      }
    }

    // --- famine : acheter des vivres à la caravane présente ---
    if (s.res.vivres < pop * 1.0 && s.res.pieces > 40 && s.caravanes.some((k) => k.phase === 'commerce' || k.phase === 'abreuvage')) {
      cmd(p, { t: 'acheterVivres', n: 40 });
    }
    if (neglige) return;

    // --- quand l'argent rentre : réduire les pertes et trouver de l'eau ---
    if (palier >= 1 && s.res.pieces > 90 && s.res.materiaux > 20) {
      // maçonner le canal principal puis la branche de cultures, dix cases à la fois
      const aMaconner: number[] = [];
      for (let z = sz; z <= finZ && aMaconner.length < 10; z++) if (s.canal[idx(sx, z)] === 1) aMaconner.push(idx(sx, z));
      for (let x = sx; x <= brancheFin && aMaconner.length < 10; x++) if (s.canal[idx(x, zc)] === 1) aMaconner.push(idx(x, zc));
      if (aMaconner.length) canal(p, aMaconner, 2);
    }
    if (palier >= 2 && nb(p, 'puits') < 2 && s.res.pieces > 150 && s.res.materiaux > 25) {
      // un puits au bout de la branche de cultures : de l'eau là où elle manque
      poserPres(p, 'puits', brancheFin + 1, zc, 3, false);
    }

    // --- réglages : répartiteur, citerne, source ---
    const attendue = s.caravanes.find((k) => k.phase === 'annoncee' && k.arriveePas - s.pas < PAS_PAR_JOUR * 0.8);
    const presente = s.caravanes.find((k) => k.phase === 'approche' || k.phase === 'abreuvage');
    if (palier >= 1) {
      if (!repartiteur && s.res.pieces >= 12 + 10 && s.res.materiaux >= 4) {
        const r = cmd(p, { t: 'construire', kind: 'repartiteur', x: sx, z: zc, rot: 0 });
        if (r.ok) repartiteur = r.id!;
      }
      // la citerne se place en aval des fontaines : l'amont boit d'abord, elle ne doit pas les assécher
      if (!citerne && s.res.pieces >= 26 + 15 && s.res.materiaux >= 12) citerne = poserPres(p, 'citerne', sx - 2, finZ - 2, 3);
      const cibleFoggara = 2;
      if (
        s.foggaraNiveau < cibleFoggara &&
        s.foggaraChantier < 0 &&
        s.res.pieces >= B.foggaraPieces[s.foggaraNiveau] + 30 &&
        s.res.materiaux >= B.foggaraMateriaux[s.foggaraNiveau] + 4
      ) {
        cmd(p, { t: 'foggara' });
      }
    }
    if (repartiteur) {
      // Nord, est, sud, ouest : les cultures sont à l'est ; fontaines, citerne et bassins au sud.
      // Comme un joueur qui lit la fiche du répartiteur : on envoie au sud ce que le sud peut boire, pas plus.
      const c = cacheDe(s);
      const arrive = Math.max(1, c.debit[idx(sx, zc)]);
      let soifSud = 0;
      const prochaineCar = presente ?? attendue;
      for (const b of s.batiments) {
        if (b.chantier < 1 || b.pause) continue;
        if (b.kind === 'fontaine') soifSud += 2.5;
        else if (b.kind === 'hammam') soifSud += 9;
        else if (b.kind === 'citerne' && b.vanne === 0 && b.stock < B.citerneCapacite - 5) soifSud += nom === 'etape' ? 14 : 8;
        else if (b.kind === 'bassin' && b.stock < B.bassinCapacite - 2) {
          // sans caravane en vue, le bassin se remplit doucement ; à l'approche, à plein débit
          soifSud += prochaineCar ? 27 : nom === 'etape' ? 10 : 5;
        }
      }
      const part = Math.min(0.85, Math.max(0.06, (soifSud * 1.12) / arrive));
      let meilleur: [number, number] = [3, 1];
      let ecart = 9;
      for (let e = 1; e <= 3; e++) {
        for (let su = 1; su <= 3; su++) {
          const d = Math.abs(su / (e + su) - part);
          if (d < ecart) {
            ecart = d;
            meilleur = [e, su];
          }
        }
      }
      cmd(p, { t: 'poids', id: repartiteur, poids: [0, meilleur[0], meilleur[1], 0] });
    }
    if (citerne) {
      // on remplit au repos, on vide pour la caravane
      cmd(p, { t: 'vanne', id: citerne, vanne: presente ? 2 : 0 });
    }

    // --- tempêtes : brise-vent avant, corvée après ---
    const prochaine = s.meteo.find((m) => m.type === 'tempete' && m.annoncee && s.pas < m.debutPas);
    if (prochaine && derniereAlerte !== prochaine.debutPas && palier >= 1 && s.res.pieces > 40) {
      derniereAlerte = prochaine.debutPas;
      briseVent(p, prochaine.dir);
    }
    let ensable = 0;
    for (let i = 0; i < s.canal.length; i++) if (s.canal[i] && s.sable[i] > 0.25) ensable++;
    const veutCorvee = ensable > 2 && !tempeteEnCours(s);
    if (veutCorvee !== s.corvee) cmd(p, { t: 'corvee', on: veutCorvee });

    // --- vocation ---
    if (palier >= 2) {
      if (s.commandeMateriaux < 30) cmd(p, { t: 'commande', n: 30 });
      if (!nb(p, 'caravanserail') && s.res.pieces >= 70 + (nom === 'grenier' ? 60 : 0) && s.res.materiaux >= 28) {
        poserPres(p, 'caravanserail', sx + 4, finZ - 3, 8, false);
      }
      if (nom === 'etape') {
        if (nb(p, 'caravanserail') && nb(p, 'bassin') < 2 && s.res.pieces >= 30 && s.res.materiaux >= 6) poserPres(p, 'bassin', sx - 3, finZ - 1, 6);
        if (nb(p, 'caravanserail', true) && !nb(p, 'hammam') && s.res.pieces >= 80 && s.res.materiaux >= 30) poserPres(p, 'hammam', sx - 3, finZ - 8, 6);
        if (nb(p, 'hammam') && !nb(p, 'fanal') && s.res.pieces >= 55 && s.res.materiaux >= 18) poserPres(p, 'fanal', sx + 7, finZ, 8, false);
      } else if (!nb(p, 'sechoir') && s.res.pieces >= 50 && s.res.materiaux >= 15) {
        poserPres(p, 'sechoir', sx + 6, zc + 4, 8, false);
      }
    }
  };

  const total = jours * PAS_PAR_JOUR;
  const parTour = 40; // un tour de décision toutes les 2 heures de jeu
  const recharges = new Set(options.rechargerAuxPas ?? []);
  const recharger = () => {
    const r = deserialiser(serialiser(p.s, { vitesse: 1 }, '2026-01-01T00:00:00Z'));
    if (!r.ok) throw new Error(r.erreur);
    s = p.s = r.etat;
  };
  for (let t = 0; t < total; t += parTour) {
    if (options.rechargerAuPas !== undefined && t === options.rechargerAuPas) {
      const r = deserialiser(serialiser(p.s, { vitesse: 1 }, '2026-01-01T00:00:00Z'));
      if (!r.ok) throw new Error(r.erreur);
      s = p.s = r.etat;
    }
    if (recharges.has(p.s.pas)) recharger();
    tour();
    for (let k = 0; k < parTour; k++) {
      if (k > 0 && recharges.has(p.s.pas)) recharger();
      const evs: import('../../src/sim').Evenement[] = [];
      pas(p, 1, (e) => evs.push(e));
      if (options.apresPas && options.apresPas(p, evs) === true) return p;
    }
    if (options.apresTour) options.apresTour(p);
  }
  return p;
}

// exécution directe : npx tsx tests/bots/strategies.ts [graine] [jours] [--faits]
if (typeof process !== 'undefined' && process.argv?.[1] && process.argv[1].endsWith('__jamais__')) {
  const graine = Number(process.argv[2] ?? 20261120);
  const jours = Number(process.argv[3] ?? 30);
  const lignes: Record<string, unknown>[] = [];
  for (const nom of ['etape', 'grenier', 'negligent'] as NomStrategie[]) {
    const p = jouer(nom, graine, jours);
    lignes.push({ strategie: nom, ...resume(p) });
    if (process.argv.includes('--faits')) console.log(nom, '\n  ' + p.faits.join('\n  '));
  }
  const cols = Object.keys(lignes[0]);
  for (const col of cols) console.log(col.padEnd(22), lignes.map((l) => String(l[col]).padStart(10)).join(' '));
}
