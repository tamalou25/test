/**
 * Tampons générés une seule fois au démarrage : bruits (blanc, brun) et réponse
 * impulsionnelle de la réverbération. Aucun échantillon externe.
 */

/** Rend le tampon bouclable sans saut : retire la pente qui sépare le début de la fin. */
function raccorder(d: Float32Array): void {
  const n = d.length;
  const delta = d[n - 1]! - d[0]!;
  for (let i = 0; i < n; i++) d[i]! -= (delta * i) / (n - 1);
}

function normaliserRms(d: Float32Array, cible: number): void {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i]! * d[i]!;
  const rms = Math.sqrt(s / d.length) || 1;
  const k = cible / rms;
  for (let i = 0; i < d.length; i++) d[i]! *= k;
}

/** Bruit blanc stéréo décorrélé (deux canaux indépendants : espace, « air »). */
export function bruitBlanc(ctx: BaseAudioContext, secondes: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * secondes);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    normaliserRms(d, 0.3);
  }
  return b;
}

/** Bruit brun (intégrateur à fuite), raccordé pour boucler sans discontinuité. */
export function bruitBrun(ctx: BaseAudioContext, secondes: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * secondes);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = y;
    }
    // retire la moyenne puis raccorde
    let m = 0;
    for (let i = 0; i < n; i++) m += d[i]!;
    m /= n;
    for (let i = 0; i < n; i++) d[i]! -= m;
    raccorder(d);
    normaliserRms(d, 0.3);
  }
  return b;
}

/**
 * Réponse impulsionnelle d'une petite cour en terre : pré-délai court, queue de bruit
 * qui s'assombrit avec le temps (filtre passe-bas variable), décroissance exponentielle.
 */
export function reponseImpulsionnelle(ctx: BaseAudioContext, duree = 2.0): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * duree);
  const b = ctx.createBuffer(2, n, sr);
  const predelai = Math.floor(0.012 * sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = predelai; i < n; i++) {
      const t = (i - predelai) / sr;
      const a = 0.85 - 0.75 * (t / duree); // de clair à sombre
      lp += a * (Math.random() * 2 - 1 - lp);
      const env = Math.exp((-6.9 * t) / duree) * Math.min(1, t / 0.004);
      d[i] = lp * env;
    }
  }
  return b;
}
