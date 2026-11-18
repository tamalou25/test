// Statistiques d'une image PNG via ImageMagick (convert) : moyenne, écart-type, nombre de couleurs.
import { spawnSync } from 'node:child_process';

export function pngStats(file) {
  const r = spawnSync(
    'convert',
    [file, '-format', '%[fx:mean] %[fx:standard_deviation] %k %w %h', 'info:'],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`convert a échoué : ${r.stderr}`);
  const [mean, std, colors, w, h] = r.stdout.trim().split(/\s+/).map(Number);
  return { mean, std, colors, width: w, height: h };
}

/** Image « vivante » : ni noire, ni uniforme. */
export function looksRendered(s) {
  return s.mean > 0.05 && s.std > 0.02 && s.colors > 16;
}
