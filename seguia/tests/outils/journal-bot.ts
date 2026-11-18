// Produit le journal des commandes d'un bot, pour le rejouer à l'identique dans l'application empaquetée.
// usage : npx tsx tests/outils/journal-bot.ts <etape|grenier|negligent> <jours> <sortie.json>
import { writeFileSync } from 'node:fs';
import { empreinte, GRAINE_SCENARIO } from '../../src/sim';
import { resume } from '../bots/lib';
import { jouer, type NomStrategie } from '../bots/strategies';
const [nom, jours, sortie] = [process.argv[2] as NomStrategie, Number(process.argv[3]), process.argv[4]];
const p = jouer(nom, GRAINE_SCENARIO, jours, { consigner: true });
writeFileSync(
  sortie,
  JSON.stringify({ strategie: nom, graine: GRAINE_SCENARIO, jours, pasFinal: p.s.pas, empreinte: empreinte(p.s), resume: resume(p), faits: p.faits, commandes: p.journalCommandes }),
);
console.log(nom, 'commandes', p.journalCommandes!.length, 'pas final', p.s.pas, 'empreinte', empreinte(p.s), 'victoire j', resume(p).victoireJour);
