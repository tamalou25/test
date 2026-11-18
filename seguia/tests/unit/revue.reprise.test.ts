/**
 * REVUE : reprise exacte autour des transitions qui créditent ou débitent quelque chose.
 * Pour chaque transition, sauvegarde/recharge au pas d'avant, au pas exact et au pas d'après :
 * l'empreinte finale ET le nombre d'événements de chaque type doivent être ceux de la partie continue.
 *   npx vitest run tests/unit/revue.reprise
 */
import { describe, expect, it } from 'vitest';
import { avancer, deserialiser, empreinte, GRAINE_SCENARIO, serialiser, type Evenement } from '../../src/sim';
import { jouer, type NomStrategie } from '../outils/revue-strategies';

const JOURS = 14;
const TYPES: Evenement['type'][] = [
  'caravane_payee',
  'caravane_depart',
  'colons',
  'palier',
  'choix_vocation',
  'recolte',
  'tempete_fin',
  'tempete_annoncee',
  'caravane_annoncee',
  'cloture_detruite',
  'foggara_finie',
  'victoire',
];

function continu(nom: NomStrategie) {
  const quand = new Map<string, number[]>();
  const p = jouer(nom, GRAINE_SCENARIO, JOURS, {
    apresPas: (pp, evs) => {
      for (const e of evs) {
        if (!TYPES.includes(e.type)) continue;
        // le pas où la transition a été appliquée est pp.s.pas - 1
        const l = quand.get(e.type) ?? [];
        l.push(pp.s.pas - 1);
        quand.set(e.type, l);
      }
    },
  });
  return { p, quand };
}

for (const nom of ['etape', 'grenier'] as NomStrategie[]) {
  describe(`revue reprise (${nom})`, () => {
    const ref = continu(nom);
    const empRef = empreinte(ref.p.s);
    for (const type of TYPES) {
      const pasT = ref.quand.get(type)?.[0];
      if (pasT === undefined) continue;
      for (const d of [-1, 0, 1]) {
        it(`${type} : rechargement au pas ${pasT + d} (transition au pas ${pasT})`, () => {
          const r = jouer(nom, GRAINE_SCENARIO, JOURS, { rechargerAuxPas: [pasT + d] });
          expect(empreinte(r.s)).toBe(empRef);
          for (const t of TYPES) expect(r.compte[t] ?? 0, t).toBe(ref.p.compte[t] ?? 0);
        });
      }
    }
  });
}

describe('revue : choix de vocation en attente au moment de la sauvegarde', () => {
  it('après rechargement, la simulation ne réémet jamais « choix_vocation » : seul l’écran l’aurait proposé', () => {
    let capture = '';
    jouer('etape', GRAINE_SCENARIO, 20, {
      apresPas: (p) => {
        if (p.s.progression.choixVocationEnAttente && !capture) {
          capture = serialiser(p.s, { vitesse: 1 }, '2026-11-18T10:00:00Z');
          return true;
        }
      },
    });
    expect(capture).not.toBe('');
    const r = deserialiser(capture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.etat;
    expect(s.progression.choixVocationEnAttente).toBe(true);
    let reemis = 0;
    for (let k = 0; k < 5 * 480; k++) for (const e of avancer(s).evenements) if (e.type === 'choix_vocation') reemis++;
    // Jeu.lancer() ne regarde pas choixVocationEnAttente : sans réémission, l'écran ne revient pas
    // et avancerProgression() reste bloquée (return anticipé) : palier 1 pour toujours.
    expect(s.progression.palier).toBe(1);
    expect(reemis, 'événements choix_vocation réémis après rechargement').toBeGreaterThan(0);
  });
});
