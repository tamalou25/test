/**
 * REVUE : écriture sur disque (electron/saves.cjs), sous Node, dans un dossier temporaire.
 *   npx tsx tests/outils/revue-disque.ts
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const { createSaveService } = require('../../electron/saves.cjs');

const racine = fs.mkdtempSync(path.join(process.env.REVUE_TMP ?? os.tmpdir(), 'revue-saves-'));

async function scenario(nom: string, f: (dir: string) => Promise<string>) {
  const dir = path.join(racine, nom.replace(/[^a-z0-9]+/gi, '_'));
  fs.mkdirSync(dir, { recursive: true });
  try {
    console.log(`- ${nom} : ${await f(dir)}`);
  } catch (err) {
    console.log(`- ${nom} : ERREUR ${(err as Error).message}`);
  }
}

const gros = (etiquette: string, mo: number) => JSON.stringify({ etiquette, bourrage: 'x'.repeat(mo * 1024 * 1024) });
const etiquette = (t: string | null) => (t === null ? 'null' : (JSON.parse(t) as any).etiquette ?? t.slice(0, 20));

await scenario('1. écritures concurrentes : la plus ANCIENNE (grosse) est lancée en premier', async (dir) => {
  const sv = createSaveService(dir);
  await sv.write('auto', JSON.stringify({ etiquette: 'v0' }));
  // comme jeu.ts : sauver('auto') d'un état ancien puis, avant la fin, sauver('auto') d'un état plus récent
  const p1 = sv.write('auto', gros('ANCIEN (appel 1)', 40));
  const p2 = sv.write('auto', JSON.stringify({ etiquette: 'RÉCENT (appel 2)' }));
  await Promise.all([p1, p2]);
  return `fichier = ${etiquette(await sv.read('auto'))} ; .bak = ${etiquette(await sv.readBackup('auto'))}`;
});

await scenario('2. le fichier principal est abîmé, puis une nouvelle sauvegarde a lieu', async (dir) => {
  const sv = createSaveService(dir);
  await sv.write('manuel1', JSON.stringify({ etiquette: 'BON v1' }));
  await sv.write('manuel1', JSON.stringify({ etiquette: 'BON v2' })); // .bak = v1
  fs.writeFileSync(path.join(dir, 'manuel1.json'), '{"etiquette":"BON v2", tronq'); // v2 abîmé sur disque
  await sv.write('manuel1', JSON.stringify({ etiquette: 'v3' }));
  const bak = await sv.readBackup('manuel1');
  let lisible = true;
  try {
    JSON.parse(bak!);
  } catch {
    lisible = false;
  }
  return `.bak contient maintenant ${JSON.stringify(bak)} (lisible : ${lisible}) ; la bonne copie v1 est perdue`;
});

await scenario('3. mort du processus après le .bak, avant le renommage final', async (dir) => {
  const sv = createSaveService(dir);
  await sv.write('auto', JSON.stringify({ etiquette: 'v1' }));
  // simulation : on reproduit les étapes 1 et 2 à la main puis on « meurt »
  fs.writeFileSync(path.join(dir, 'auto.json.tmp-mort'), JSON.stringify({ etiquette: 'v2' }));
  fs.copyFileSync(path.join(dir, 'auto.json'), path.join(dir, 'auto.json.bak'));
  const liste = await sv.list();
  return `fichiers : ${fs.readdirSync(dir).join(', ')} ; principal = ${etiquette(await sv.read('auto'))} ; list() = ${JSON.stringify(liste.map((l: any) => l.slot))} (le .tmp orphelin n'est jamais nettoyé)`;
});

await scenario('4. mort pendant writeFileSynced (fichier temporaire partiel)', async (dir) => {
  const sv = createSaveService(dir);
  await sv.write('auto', JSON.stringify({ etiquette: 'v1' }));
  fs.writeFileSync(path.join(dir, 'auto.json.tmp-123'), '{"etiq');
  return `principal intact = ${etiquette(await sv.read('auto'))}, .bak = ${etiquette(await sv.readBackup('auto'))}`;
});

await scenario('5. dix sauvegardes concurrentes de tailles décroissantes : laquelle gagne ?', async (dir) => {
  const sv = createSaveService(dir);
  const ps = [];
  for (let k = 0; k < 10; k++) ps.push(sv.write('auto', gros(`appel ${k}`, 10 - k)));
  await Promise.all(ps);
  return `fichier = ${etiquette(await sv.read('auto'))} (attendu : appel 9, le plus récent) ; .bak = ${etiquette(await sv.readBackup('auto'))}`;
});

fs.rmSync(racine, { recursive: true, force: true });
