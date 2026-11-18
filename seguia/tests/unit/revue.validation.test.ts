/**
 * REVUE : un fichier abîmé ou incohérent, dont la somme de contrôle a été RECALCULÉE,
 * doit être refusé proprement, ou accepté seulement s'il laisse 200 pas de simulation
 * se dérouler sans exception ni valeur non finie, et se ré-enregistrer à l'identique.
 *   npx vitest run tests/unit/revue.validation
 */
import { describe, expect, it } from 'vitest';
import { avancer, BATIMENTS, deserialiser, GRAINE_SCENARIO, serialiser, versObjet, type GameState } from '../../src/sim';
import { somme } from '../../src/sim/sauvegarde';
import { jouer } from '../bots/strategies';

const DATE = '2026-11-18T10:00:00Z';
const base = jouer('etape', GRAINE_SCENARIO, 4).s; // caravanes, chantiers, palier 1
const texte = serialiser(base, { vitesse: 1 }, DATE);
const brut0 = JSON.parse(texte);

/** Applique une mutation à l'état, RECALCULE la somme de contrôle et renvoie le texte. */
function forger(mut: (e: any, brut: any) => void): string {
  const brut = JSON.parse(texte);
  mut(brut.etat, brut);
  brut.somme = somme(JSON.stringify(brut.etat));
  return JSON.stringify(brut);
}

function nonFinis(o: unknown, chemin = '', out: string[] = []): string[] {
  if (typeof o === 'number' && !Number.isFinite(o)) out.push(chemin);
  else if (o === null && chemin !== 'progression.vocation') out.push(chemin + '=null');
  else if (o === undefined) out.push(chemin + '=undefined');
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) nonFinis((o as any)[k], chemin ? `${chemin}.${k}` : k, out);
  return out;
}

/** Verdict : 'refusé', 'accepté-sain', ou une description du problème. */
function verdict(t: string): string {
  let r;
  try {
    r = deserialiser(t);
  } catch (err) {
    return `deserialiser LÈVE : ${(err as Error).message}`;
  }
  if (!r.ok) return 'refusé';
  const s: GameState = r.etat;
  const inc = incoherences(s);
  try {
    for (let k = 0; k < 2000; k++) {
      avancer(s);
      if (k === 199 || k === 1999) {
        const nf = nonFinis(versObjet(s));
        if (nf.length) return `accepté puis valeurs non finies/absentes après ${k + 1} pas : ${nf.slice(0, 4).join(', ')}`;
      }
    }
  } catch (err) {
    return `accepté puis avancer() PLANTE : ${(err as Error).message}`;
  }
  const r2 = deserialiser(serialiser(s, { vitesse: 1 }, DATE));
  if (!r2.ok) return `accepté puis la sauvegarde suivante est refusée : ${r2.erreur}`;
  const typ = typesDifferents(versObjet(s));
  if (typ.length) return `accepté avec types faux : ${typ.slice(0, 3).join(', ')}`;
  if (inc.length) return `accepté mais incohérent (sans planter 2000 pas) : ${inc.join(', ')}`;
  return 'accepté-sain';
}

/** schéma des types attendus, appris sur une sauvegarde saine */
const schema = new Map<string, string>();
function apprendre(o: unknown, chemin = '') {
  if (o && typeof o === 'object') for (const k of Object.keys(o)) apprendre((o as any)[k], `${chemin}.${Array.isArray(o) ? '*' : k}`);
  else schema.set(chemin, typeof o);
}
apprendre(versObjet(base));
function typesDifferents(o: unknown, chemin = '', out: string[] = []): string[] {
  if (o && typeof o === 'object') for (const k of Object.keys(o)) typesDifferents((o as any)[k], `${chemin}.${Array.isArray(o) ? '*' : k}`, out);
  else if (chemin !== '.progression.vocation' && schema.has(chemin) && schema.get(chemin) !== typeof o) out.push(`${chemin}:${typeof o}`);
  return out;
}
const PHASES = ['annoncee', 'approche', 'abreuvage', 'commerce', 'depart', 'passe'];
function incoherences(s: GameState): string[] {
  const r: string[] = [];
  for (const b of s.batiments) {
    if (!(b.kind in BATIMENTS)) r.push(`kind ${b.kind}`);
    if (!Number.isInteger(b.x) || !Number.isInteger(b.z)) r.push(`x/z non entiers (${b.x},${b.z})`);
    if (b.w < 1 || b.d < 1) r.push(`emprise ${b.w}x${b.d}`);
    if (b.habitants < 0) r.push(`habitants ${b.habitants}`);
  }
  for (const c of s.caravanes) if (!PHASES.includes(c.phase)) r.push(`phase ${c.phase}`);
  for (const m of s.meteo) {
    if (m.type !== 'tempete' && m.type !== 'canicule') r.push(`météo ${m.type}`);
    if (!(m.dir >= 0 && m.dir <= 3)) r.push(`dir ${m.dir}`);
  }
  for (const p of s.carte.piste) if (!(p >= 0 && p < 44 * 44)) r.push(`piste ${p}`);
  for (let i = 0; i < s.canal.length; i++) if (s.canal[i] > 2) { r.push(`canal ${s.canal[i]}`); break; }
  if (!(s.foggaraNiveau >= 0 && s.foggaraNiveau <= 2)) r.push(`foggaraNiveau ${s.foggaraNiveau}`);
  if (!(s.progression.palier >= 0 && s.progression.palier <= 3)) r.push(`palier ${s.progression.palier}`);
  return r;
}

describe('revue : fichiers tronqués et octets modifiés (sans recalcul de somme)', () => {
  it('toute troncature est refusée sans lever', () => {
    const longueurs = [0, 1, 10, 100, 1000, Math.floor(texte.length / 3), Math.floor(texte.length / 2), texte.length - 100, texte.length - 2, texte.length - 1];
    for (const n of longueurs) expect(verdict(texte.slice(0, n)), `longueur ${n}`).toBe('refusé');
  });
  it('un octet modifié dans la partie état est refusé', () => {
    const debut = texte.indexOf('"etat":') + 10;
    for (let k = 0; k < 60; k++) {
      const i = debut + Math.floor(((texte.length - debut - 2) * k) / 60);
      const c = texte[i];
      const rempl = c === '1' ? '2' : c === 'A' ? 'B' : c === 'a' ? 'b' : c === '0' ? '9' : null;
      if (!rempl) continue;
      expect(verdict(texte.slice(0, i) + rempl + texte.slice(i + 1)), `octet ${i}`).toBe('refusé');
    }
  });
});

const cas: [string, (e: any, brut: any) => void, 'refusé' | 'refusé ou sain'][] = [
  ['version future', (_e, b) => (b.version = 99), 'refusé'],
  ['version ancienne sans migration (0)', (_e, b) => (b.version = 0), 'refusé'],
  ['version négative', (_e, b) => (b.version = -3), 'refusé'],
  ['champ res manquant', (e) => delete e.res, 'refusé'],
  ['res.pieces en texte', (e) => (e.res.pieces = '110'), 'refusé'],
  ['res.pieces null', (e) => (e.res.pieces = null), 'refusé'],
  ['pas null', (e) => (e.pas = null), 'refusé'],
  ['pas décimal', (e) => (e.pas = 12.5), 'refusé'],
  ['rng manquant', (e) => delete e.rng, 'refusé'],
  ['rng.meteo à 3 entrées', (e) => (e.rng.meteo = e.rng.meteo.slice(0, 3)), 'refusé'],
  ['rng.meteo en textes', (e) => (e.rng.meteo = ['a', 'b', 'c', 'd']), 'refusé ou sain'],
  ['humidite base64 trop courte', (e) => (e.humidite = e.humidite.slice(0, 100)), 'refusé'],
  ['canal base64 trop longue', (e) => (e.canal = e.canal + 'AAAA'), 'refusé'],
  ['sable base64 caractère invalide', (e) => (e.sable = '!' + e.sable.slice(1)), 'refusé'],
  ['stats manquantes', (e) => delete e.stats, 'refusé ou sain'],
  ['stats.recoltes en texte', (e) => (e.stats.recoltes = 'beaucoup'), 'refusé ou sain'],
  ['progression manquante', (e) => delete e.progression, 'refusé ou sain'],
  ['progression.palier = 9', (e) => (e.progression.palier = 9), 'refusé ou sain'],
  ['ids des bâtiments en désordre', (e) => e.batiments.reverse(), 'refusé'],
  ['id de bâtiment dupliqué', (e) => (e.batiments[1].id = e.batiments[0].id), 'refusé'],
  ['bâtiment hors du plateau', (e) => (e.batiments[1].x = 43), 'refusé'],
  ['bâtiment x négatif', (e) => (e.batiments[1].x = -1), 'refusé'],
  ['bâtiment x décimal', (e) => (e.batiments[1].x = 3.5), 'refusé ou sain'],
  ['bâtiment x en texte', (e) => (e.batiments[1].x = '3'), 'refusé ou sain'],
  ['bâtiment de type inconnu', (e) => (e.batiments[1].kind = 'chateau'), 'refusé ou sain'],
  ['bâtiment sans santé', (e) => delete e.batiments[e.batiments.length - 1].sante, 'refusé ou sain'],
  ['bâtiment sans poids', (e) => delete e.batiments[1].poids, 'refusé'],
  ['bâtiment emprise nulle (w=0)', (e) => (e.batiments.find((b: any) => b.kind === 'jardin').w = 0), 'refusé ou sain'],
  ['habitants négatifs', (e) => (e.batiments.find((b: any) => b.kind === 'maison').habitants = -50), 'refusé ou sain'],
  ['bâtiments n’est pas une liste', (e) => (e.batiments = {}), 'refusé'],
  ['caravane de phase inconnue', (e) => {
    e.caravanes.push({ ...(e.caravanes[0] ?? {}), id: e.prochainId, phase: 'perdue' });
    e.prochainId++;
  }, 'refusé ou sain'],
  ['caravane sans champ besoin', (e) => {
    if (e.caravanes[0]) delete e.caravanes[0].besoin;
  }, 'refusé ou sain'],
  ['caravane : chameaux = 0 en abreuvage', (e) => {
    const c = e.caravanes[0];
    c.phase = 'abreuvage';
    c.chameaux = 0;
    c.besoin = 0;
    c.finPhasePas = e.pas + 5;
  }, 'refusé ou sain'],
  ['météo de type inconnu', (e) => e.meteo.push({ type: 'grele', debutPas: e.pas + 2, finPas: e.pas + 50, dir: 0, intensite: 1, grande: false, annoncee: false }), 'refusé ou sain'],
  ['tempête de direction 7', (e) => e.meteo.push({ type: 'tempete', debutPas: e.pas + 2, finPas: e.pas + 50, dir: 7, intensite: 1, grande: false, annoncee: false }), 'refusé ou sain'],
  ['piste pointant hors plateau', (e) => (e.carte.piste[3] = 999999), 'refusé ou sain'],
  ['piste trop courte (5 cases)', (e) => (e.carte.piste = e.carte.piste.slice(0, 5)), 'refusé'],
  ['source hors plateau', (e) => (e.carte.sourceCase = 5000), 'refusé'],
  ['canal de type 7', (e) => {
    const t = Buffer.from(e.canal, 'base64');
    for (let i = 0; i < t.length; i++) if (t[i]) t[i] = 7;
    e.canal = t.toString('base64');
  }, 'refusé ou sain'],
  ['humidité NaN dans la grille', (e) => {
    const t = Buffer.from(e.humidite, 'base64');
    new Float64Array(t.buffer, t.byteOffset, t.length / 8)[10] = NaN;
    e.humidite = t.toString('base64');
  }, 'refusé'],
  ['annulables : cases absentes', (e) => (e.annulables = [{ pas: e.pas, type: 'canal', id: 0 }]), 'refusé'],
  ['journal en texte', (e) => (e.journal = 'abc'), 'refusé'],
  ['foggaraNiveau = 50', (e) => (e.foggaraNiveau = 50), 'refusé ou sain'],
  ['foggaraNiveau = -1', (e) => (e.foggaraNiveau = -1), 'refusé ou sain'],
  ['prochainId trop petit', (e) => (e.prochainId = 1), 'refusé'],
  ['NaN via 1e400 dans le texte', (_e) => {}, 'refusé'],
];

describe('revue : champs incohérents avec somme de contrôle recalculée', () => {
  for (const [nom, mut, attendu] of cas) {
    it(nom, () => {
      let t = forger(mut);
      if (nom.startsWith('NaN via')) {
        // JSON ne peut pas porter NaN ; 1e400 devient Infinity à la lecture
        t = t.replace(/"pieces":[0-9.]+/, '"pieces":1e400');
        const b = JSON.parse(t);
        b.somme = somme(JSON.stringify(b.etat));
        t = JSON.stringify(b).replace(/"pieces":null/, '"pieces":1e400');
      }
      const v = verdict(t);
      if (process.env.REVUE_LOG) require('node:fs').appendFileSync(process.env.REVUE_LOG, nom + ' => ' + v + '\n');
      if (attendu === 'refusé') expect(v).toBe('refusé');
      else expect(['refusé', 'accepté-sain']).toContain(v);
    });
  }

  it('la section ui (hors somme) est assainie : vitesse ramenée à 1, caméra invalide ignorée', () => {
    const b = JSON.parse(texte);
    b.ui = { vitesse: 1e9, camera: { x: 'abc', z: null, distance: -5, azimut: 1, inclinaison: 1 } };
    const r = deserialiser(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      // défaut signalé par la relecture, corrigé depuis : Jeu.lancer(...) ne reçoit plus que des valeurs saines
      expect(r.ui.vitesse).toBe(1);
      expect(r.ui.camera).toBeUndefined();
    }
  });

  it('la section meta (hors somme) est recalculée à partir de l’état : elle ne peut plus mentir sur la partie', () => {
    const b = JSON.parse(texte);
    b.meta = { ...brut0.meta, palier: 3, carte: '<img src=x onerror=alert(1)>' };
    const r = deserialiser(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      // défaut signalé par la relecture, corrigé depuis
      expect(r.meta.palier).toBe(r.etat.progression.palier);
      expect(r.meta.carte).toBe(r.etat.options.nomCarte);
    }
  });
});
