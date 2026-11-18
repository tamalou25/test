import { jouer } from '../bots/strategies';
import { cacheDe } from '../bots/lib';
import { objectifs, population, N, calendrier, partCanauxDegages } from '../../src/sim';
const nom = (process.argv[2] ?? 'etape') as any;
const jours = Number(process.argv[3] ?? 30);
const suivi: string[] = [];
let dernierPartis = 0;
const p = jouer(nom, 20261120, jours, { apresTour: (q) => {
  const s = q.s;
  if (s.stats.habitantsPartis !== dernierPartis) {
    const cal = calendrier(s.pas);
    suivi.push(`j${cal.jour} ${cal.heure.toFixed(0)}h partis=${s.stats.habitantsPartis} vivres=${s.res.vivres.toFixed(0)} dattes=${s.res.dattes.toFixed(0)} faim=${s.faim} pop=${population(s)} fontaines=${s.batiments.filter(b=>b.kind==='fontaine').map(b=>b.eauRatio.toFixed(1)).join('/')}`);
    dernierPartis = s.stats.habitantsPartis;
  }
}});
const s = p.s; const c = cacheDe(s);
console.log(objectifs(s).map(o => `${o.id}:${o.valeur}/${o.cible}`).join(' '), 'degages', partCanauxDegages(s).toFixed(2), 'corvee', s.corvee);
const par: Record<string, number> = {};
for (const b of s.batiments) par[b.kind] = (par[b.kind] ?? 0) + 1;
console.log(par, 'pop', population(s), 'libres', c.ouvriersLibres, 'postes', c.postes, 'bilan', JSON.stringify(c.bilan));
let out = '';
for (let z = 8; z < 34; z++) { let l = ''; for (let x = 4; x < 34; x++) { const i = z*N+x; let ch = '.'; if (s.canal[i]) ch = s.sable[i] > 0.3 ? 'S' : c.debit[i] > 0.3 ? '≈' : '-'; if (c.occ[i]) ch = s.batiments.find(b=>b.id===c.occ[i])!.kind[0]; if (s.cloture[i]) ch = '|'; if (s.carte.piste.includes(i)) ch = '='; l += ch; } out += l + '\n'; }
console.log(out);
console.log(suivi.slice(0, 14).join('\n'));
