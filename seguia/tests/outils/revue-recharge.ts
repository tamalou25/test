/**
 * REVUE (lecture seule du jeu) : balayage des instants de sauvegarde/rechargement.
 * Pour chaque bot, joue une partie continue, puis rejoue en sauvegardant/rechargeant à un pas R,
 * et compare l'empreinte de l'état à CHAQUE pas suivant avec celle de la partie continue.
 *
 *   npx tsx tests/outils/revue-recharge.ts [jours=30] [strategies=etape,grenier]
 */
import { cacheDe, empreinte, GRAINE_SCENARIO, PAS_PAR_JOUR, tempeteEnCours, versObjet, B } from '../../src/sim';
import { depuisBase64 } from '../../src/sim/sauvegarde';
import { jouer, type NomStrategie } from './revue-strategies';

const jours = Number(process.argv[2] ?? 30);
const strategies = (process.argv[3] ?? 'etape,grenier').split(',') as NomStrategie[];

interface Trace {
  emp: Map<number, string>;
  tags: Map<number, string[]>;
}

function tracer(nom: NomStrategie): Trace {
  const emp = new Map<number, string>();
  const tags = new Map<number, string[]>();
  let avant: { phases: string; palier: number; attente: boolean; chantier: boolean; fog: boolean } | null = null;
  jouer(nom, GRAINE_SCENARIO, jours, {
    apresPas: (p, evs) => {
      const s = p.s;
      emp.set(s.pas, empreinte(s));
      // étiquettes de l'état au pas s.pas (= prochain pas à jouer)
      const t: string[] = [];
      if (tempeteEnCours(s)) t.push('tempete');
      if (s.pas % B.pasParTourPopulation === 0) t.push('tourPop');
      if (s.pas % 10 === 0) t.push('progression');
      const phases = s.caravanes.map((c) => c.id + c.phase).join(',');
      for (const c of s.caravanes) t.push('car:' + c.phase);
      const chantier = s.batiments.some((b) => b.chantier < 1);
      if (chantier) t.push('chantier');
      if (s.foggaraChantier >= 0) t.push('foggara');
      if (s.progression.choixVocationEnAttente) t.push('vocationEnAttente');
      for (const e of evs) t.push('ev:' + e.type);
      if (avant && avant.phases !== phases) t.push('transitionCaravane');
      if (avant && avant.palier !== s.progression.palier) t.push('transitionPalier');
      avant = { phases, palier: s.progression.palier, attente: s.progression.choixVocationEnAttente, chantier, fog: s.foggaraChantier >= 0 };
      tags.set(s.pas, t);
    },
  });
  return { emp, tags };
}

/** Choisit des pas de rechargement : autour des transitions (avant / exact / après) et quelques pas réguliers. */
function choisir(tr: Trace): number[] {
  const pasListe = [...tr.tags.keys()].sort((a, b) => a - b);
  const r = new Set<number>();
  const prendre = (cle: (t: string[]) => boolean, max: number, voisins = true) => {
    let n = 0;
    for (const p of pasListe) {
      if (n >= max) break;
      if (cle(tr.tags.get(p)!)) {
        r.add(p);
        if (voisins) {
          r.add(p - 1);
          r.add(p + 1);
        }
        n++;
      }
    }
  };
  prendre((t) => t.includes('ev:caravane_payee'), 3);
  prendre((t) => t.includes('ev:caravane_depart'), 3);
  prendre((t) => t.includes('ev:caravane_arrivee'), 3);
  prendre((t) => t.includes('ev:caravane_annoncee'), 2);
  prendre((t) => t.includes('ev:caravane_boit'), 2);
  prendre((t) => t.includes('ev:colons'), 2);
  prendre((t) => t.includes('ev:palier') || t.includes('ev:choix_vocation') || t.includes('ev:victoire'), 4);
  prendre((t) => t.includes('vocationEnAttente'), 2, false);
  prendre((t) => t.includes('ev:tempete_fin'), 3);
  prendre((t) => t.includes('ev:tempete_debut'), 2);
  prendre((t) => t.includes('tempete'), 1, false);
  prendre((t) => t.includes('ev:recolte'), 2);
  prendre((t) => t.includes('ev:foggara_finie'), 2);
  prendre((t) => t.includes('foggara'), 1, false);
  prendre((t) => t.includes('ev:chantier_fini'), 2);
  prendre((t) => t.includes('chantier'), 1, false);
  prendre((t) => t.includes('ev:saison'), 2);
  // tours de population (s.pas % 120 == 0) : avant, exact, après, à des moments variés
  const tours = pasListe.filter((p) => tr.tags.get(p)!.includes('tourPop'));
  for (let k = 0; k < tours.length; k += Math.max(1, Math.floor(tours.length / 6))) {
    r.add(tours[k]);
    r.add(tours[k] - 1);
    r.add(tours[k] + 1);
  }
  // pas réguliers, non alignés sur 4 ni 10 ni 40
  for (let k = 1; k <= 12; k++) r.add(pasListe[Math.floor((k * pasListe.length) / 13)] + 3);
  const min = pasListe[0];
  const max = pasListe[pasListe.length - 1] - 1;
  return [...r].filter((p) => p > min && p < max).sort((a, b) => a - b);
}

function diff(a: any, b: any, chemin = ''): string | null {
  if (typeof a === 'string' && typeof b === 'string' && a.length > 200 && a !== b) {
    const oa = depuisBase64(a);
    const ob = depuisBase64(b);
    if (oa.length === 1936 * 8) {
      const fa = new Float64Array(oa.buffer);
      const fb = new Float64Array(ob.buffer);
      for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) return `${chemin}[${i}] ${fa[i]} ≠ ${fb[i]}`;
    }
    for (let i = 0; i < oa.length; i++) if (oa[i] !== ob[i]) return `${chemin}[${i}] ${oa[i]} ≠ ${ob[i]}`;
  }
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${chemin} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
  const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of cles) {
    const d = diff(a[k], b[k], chemin ? `${chemin}.${k}` : k);
    if (d) return d;
  }
  return null;
}

function etatAuPas(nom: NomStrategie, pasCible: number, recharge?: number) {
  let res: { obj: any; c: any } | null = null;
  jouer(nom, GRAINE_SCENARIO, jours, {
    rechargerAuxPas: recharge !== undefined ? [recharge] : [],
    apresPas: (p) => {
      if (p.s.pas === pasCible) {
        const c = cacheDe(p.s);
        res = { obj: versObjet(p.s), c: { renommee: c.renommee, casesVertes: c.casesVertes, ombrePas: c.ombrePas } };
        return true;
      }
    },
  });
  return res!;
}

for (const nom of strategies) {
  const tr = tracer(nom);
  const fin = Math.max(...tr.emp.keys());
  const cibles = choisir(tr);
  console.log(`\n=== ${nom} : ${jours} jours, ${cibles.length} instants de rechargement ===`);
  let divergences = 0;
  for (const R of cibles) {
    let premier = -1;
    let finale = '';
    jouer(nom, GRAINE_SCENARIO, jours, {
      rechargerAuxPas: [R],
      apresPas: (p) => {
        if (p.s.pas <= R) return;
        // contrôle fin pendant 200 pas, puis tous les 20 pas (coût)
        if (p.s.pas - R > 200 && p.s.pas % 20 !== 0 && p.s.pas !== fin) return;
        const e = empreinte(p.s);
        if (p.s.pas === fin) finale = e;
        if (premier < 0 && e !== tr.emp.get(p.s.pas)) {
          premier = p.s.pas;
          return true;
        }
      },
    });
    if (premier > R + 200) {
      // affiner : premier pas exact de la divergence dans la fenêtre de 20
      const debut = premier - 20;
      jouer(nom, GRAINE_SCENARIO, jours, {
        rechargerAuxPas: [R],
        apresPas: (p) => {
          if (p.s.pas <= debut) return;
          if (empreinte(p.s) !== tr.emp.get(p.s.pas)) {
            premier = p.s.pas;
            return true;
          }
        },
      });
    }
    const tags = (tr.tags.get(R) ?? []).filter((t) => !t.startsWith('car:') || true).join(' ');
    if (premier < 0) {
      console.log(`R=${R} (j${Math.floor(R / PAS_PAR_JOUR)}, %120=${R % 120}, %10=${R % 10}, %4=${R % 4}) OK final identique  [${tags}]`);
    } else {
      divergences++;
      const a = etatAuPas(nom, premier);
      const b = etatAuPas(nom, premier, R);
      // cache juste après le rechargement, au pas R+1
      console.log(
        `R=${R} (j${Math.floor(R / PAS_PAR_JOUR)}, %120=${R % 120}, %10=${R % 10}, %4=${R % 4}) DIVERGE au pas ${premier} (après ${premier - R} pas) [${tags}]\n` +
          `    1re différence (continu ≠ rechargé) : ${diff(a.obj, b.obj)}\n` +
          `    cache continu ${JSON.stringify(a.c)} / rechargé ${JSON.stringify(b.c)}`,
      );
    }
  }
  console.log(`--- ${nom} : ${divergences} divergence(s) sur ${cibles.length} rechargements`);
}
