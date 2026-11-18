// Planche de contrôle de la lumière : la vitrine du menu à différentes heures.
import { ouvrirNavigateur } from './lib/pilote.mjs';
const { page, fermer } = await ouvrirNavigateur('http://127.0.0.1:5173/?test=1', 683, 384);
await page.evaluate(() => { document.querySelector('.voile').style.display = 'none'; });
for (const h of (process.argv[2] ?? '5,6,8,13,18,19.5,20.5,23').split(',')) {
  await page.evaluate((heure) => {
    const j = window.__seguia.jeu;
    j.s.pas = 480 * 2 + Math.round(heure / 0.05);
    j.acc = -1e9; // fige le temps de la vitrine
    window.__seguia.vue({ distance: 30, azimut: 0.7 });
  }, Number(h));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `build/captures/h-${h}.png` });
}
await fermer();
