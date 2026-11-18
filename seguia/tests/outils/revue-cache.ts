/**
 * REVUE : les données dérivées que voit le joueur (débits, déversements, bilan, ouvriers libres)
 * sont-elles les mêmes juste avant la sauvegarde et juste après le chargement ?
 *   npx tsx tests/outils/revue-cache.ts
 */
import { cacheDe, deserialiser, GRAINE_SCENARIO, idx, cx, cz, serialiser } from '../../src/sim';
import { jouer } from './revue-strategies';

const points = [12540, 2000, 5000, 9001, 12000];
let fin = 0;
for (const R of points) {
  jouer('grenier', GRAINE_SCENARIO, 30, {
    apresPas: (p) => {
      if (p.s.pas !== R) return;
      const s = p.s;
      const avant = cacheDe(s);
      const r = deserialiser(serialiser(s, { vitesse: 1 }, 'x'));
      if (!r.ok) throw new Error(r.erreur);
      const apres = cacheDe(r.etat);
      let max = 0;
      let iMax = -1;
      for (let i = 0; i < avant.debit.length; i++) {
        const d = Math.abs(avant.debit[i] - apres.debit[i]);
        if (d > max) {
          max = d;
          iMax = i;
        }
      }
      const sx = cx(s.carte.sourceCase);
      const zc = cz(s.carte.sourceCase) + 2;
      const j = idx(sx, zc); // case du répartiteur des bots
      console.log(
        `pas ${R} : écart max de débit ${max.toFixed(3)} u/h (case ${iMax}) ; jonction : ${avant.debit[j].toFixed(3)} → ${apres.debit[j].toFixed(3)} ; ` +
          `bilan.source ${avant.bilan.source.toFixed(3)} → ${apres.bilan.source.toFixed(3)} ; ouvriersLibres ${avant.ouvriersLibres} → ${apres.ouvriersLibres} ; postes ${avant.postes} → ${apres.postes}`,
      );
      fin++;
      return true;
    },
  });
}
