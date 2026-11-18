import { creerPartie, N, Sol, GRAINE_SCENARIO, cacheDe } from '../../src/sim';
const graine = Number(process.argv[2] ?? GRAINE_SCENARIO);
const s = creerPartie(graine);
const c = cacheDe(s);
const piste = new Set(s.carte.piste);
let out = '';
for (let z = 0; z < N; z++) {
  let l = '';
  for (let x = 0; x < N; x++) {
    const i = z * N + x;
    let ch = String(s.carte.elev[i]);
    if (s.carte.sol[i] === Sol.Roche) ch = '#';
    else if (s.carte.sol[i] === Sol.Dune) ch = '~';
    if (piste.has(i)) ch = '=';
    if (c.occ[i]) ch = s.batiments.find(b => b.id === c.occ[i])!.kind === 'source' ? 'S' : 'M';
    if (i === s.carte.sourceCase) ch = 'o';
    l += ch;
  }
  out += l + '\n';
}
console.log(out);
console.log('vent dominant', s.carte.ventDominant, 'piste', s.carte.piste.length, 'cases');
