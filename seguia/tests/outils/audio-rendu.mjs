// Rendu hors ligne et mesures du moteur audio de Séguia.
// Usage : node tests/outils/audio-rendu.mjs [filtre]
//  1. compile src/audio/index.ts en IIFE (vite, configuration autonome, sans toucher vite.config.ts) ;
//  2. dans Chromium (Playwright installé globalement), rend chaque scénario sur un OfflineAudioContext,
//     en appelant maj() toutes les 50 ms via ctx.suspend()/resume() ;
//  3. écrit les WAV dans build/audio/, mesure crête, RMS, saturation, NaN, sauts, spectre ;
//  4. produit les spectrogrammes PNG (ffmpeg) et build/audio/mesures.json / mesures.md.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'build', 'audio');
const require = createRequire(path.join(ROOT, 'package.json'));
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}
const filtre = process.argv[2] ?? '';
fs.mkdirSync(OUT, { recursive: true });

// ---------- 1. compilation ----------
const { build } = await import('vite');
await build({
  configFile: false,
  root: ROOT,
  logLevel: 'warn',
  build: {
    outDir: path.join(OUT, 'bundle'),
    emptyOutDir: true,
    target: 'chrome120',
    minify: false,
    lib: { entry: path.join(ROOT, 'src/audio/index.ts'), name: 'SeguiaAudio', formats: ['iife'], fileName: () => 'seguia-audio.js' },
  },
});
const BUNDLE = path.join(OUT, 'bundle', 'seguia-audio.js');

// ---------- 2. scénarios (exécutés dans la page) ----------
const SCENARIOS_JS = String.raw`
const BASE = { saison: 0, lumiere: 0.9, tempete: 0, canicule: false, proximite: 0.5, eauProche: 0, verdureProche: 0,
  vieProche: 0, caravane: false, pause: false, vitesse: 1 };
const AMB = { general: 1, musique: 0, ambiance: 1, effets: 0 };
const EFF = { general: 1, musique: 0, ambiance: 0, effets: 1 };
const lerp = (a, b, x) => a + (b - a) * Math.min(1, Math.max(0, x));
window.SCENARIOS = {
  a_jour_proche: { duree: 30, volumes: AMB, ambiance: true,
    etat: () => ({ ...BASE, lumiere: 0.9, proximite: 0.9, eauProche: 0.8, verdureProche: 0.8, vieProche: 0.4 }) },
  a_jour_proche_mix: { duree: 30, volumes: { general: 1, musique: 1, ambiance: 1, effets: 1 }, ambiance: true,
    etat: () => ({ ...BASE, lumiere: 0.9, proximite: 0.9, eauProche: 0.8, verdureProche: 0.8, vieProche: 0.4 }) },
  b_nuit_loin: { duree: 30, volumes: AMB, ambiance: true,
    etat: () => ({ ...BASE, lumiere: 0.03, proximite: 0.1, eauProche: 0.5, verdureProche: 0.5, vieProche: 0.3 }) },
  b2_nuit_proche: { duree: 20, volumes: AMB, ambiance: true,
    etat: () => ({ ...BASE, lumiere: 0.03, proximite: 0.85, eauProche: 0.5, verdureProche: 0.7, vieProche: 0.3 }) },
  c_tempete: { duree: 40, volumes: AMB, ambiance: true,
    etat: (t) => ({ ...BASE, saison: 2, lumiere: 0.7, proximite: 0.6, eauProche: 0.6, verdureProche: 0.6, vieProche: 0.3, tempete: lerp(0, 1.2, (t - 5) / 25) }) },
  d_canicule: { duree: 30, volumes: AMB, ambiance: true,
    etat: () => ({ ...BASE, saison: 1, lumiere: 1, canicule: true, proximite: 0.6, eauProche: 0.2, verdureProche: 0.6, vieProche: 0.2 }) },
  h_caravane_village: { duree: 25, volumes: AMB, ambiance: true,
    etat: () => ({ ...BASE, lumiere: 0.8, proximite: 0.75, vieProche: 0.9, verdureProche: 0.3, caravane: true }) },
  i_vents_loin: { duree: 25, volumes: AMB, ambiance: true,
    etat: () => ({ ...BASE, saison: 2, lumiere: 0.8, proximite: 0.05 }) },
  f_canal_rafale: { duree: 4, volumes: EFF,
    etat: () => BASE, effets: Array.from({ length: 30 }, (_, i) => [0.2 + i * 0.1, 'canal', 1]) },
  g_musique: { duree: 60, volumes: { general: 1, musique: 1, ambiance: 0, effets: 0 },
    etat: () => ({ ...BASE, lumiere: 0.8 }) },
  g2_musique_pause: { duree: 30, volumes: { general: 1, musique: 1, ambiance: 0, effets: 0 },
    etat: (t) => ({ ...BASE, lumiere: 0.8, pause: t > 12, vitesse: 4 }) },
};
for (const e of ['clic','survol','poser','canal','refus','demolir','annuler','eau_arrive','recolte','pieces',
  'chantier_fini','caravane','habitant','alerte','objectif','palier','victoire']) {
  window.SCENARIOS['e_' + e] = { duree: e === 'victoire' ? 6 : 3.5, volumes: EFF, etat: () => BASE, effets: [[0.2, e, 1]] };
}
window.rendre = async (nom) => {
  const sc = window.SCENARIOS[nom];
  const sr = 44100, pas = 0.05;
  const ctx = new OfflineAudioContext(2, Math.ceil(sc.duree * sr), sr);
  const m = SeguiaAudio.creerMoteurAudio({ contexte: ctx });
  await m.demarrer();
  m.reglerVolumes(sc.volumes);
  const effets = (sc.effets || []).slice();
  const etape = (t) => {
    m.maj(sc.etat(t), pas);
    while (effets.length && effets[0][0] <= t + 1e-6) { const [, e, i] = effets.shift(); m.jouer(e, i); }
  };
  etape(0);
  const n = Math.floor(sc.duree / pas) - 1;
  for (let k = 1; k <= n; k++) {
    const t = k * pas;
    ctx.suspend(t).then(() => { etape(ctx.currentTime); ctx.resume(); });
  }
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const ms = performance.now() - t0;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const inter = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; }
  const u8 = new Uint8Array(inter.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), ms, diag: { noeudsPermanents: m.diagnostic?.noeudsPermanents, couchesActives: m.diagnostic?.couchesActives } };
};
`;

// ---------- 3. analyse ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function analyser(inter, sr, ambiance) {
  const n = inter.length / 2;
  let crete = 0, somme = 0, sat = 0, nan = 0, saut = 0, sautT = 0;
  const diffs = [];
  for (let i = 0; i < inter.length; i++) {
    const x = inter[i];
    if (!Number.isFinite(x)) { nan++; continue; }
    const a = Math.abs(x);
    if (a > crete) crete = a;
    if (a >= 0.999) sat++;
    somme += x * x;
    if (i >= 2) {
      const d = Math.abs(x - inter[i - 2]);
      if (d > saut) { saut = d; sautT = Math.floor(i / 2) / sr; }
      if ((i & 63) === 0) diffs.push(d);
    }
  }
  diffs.sort((a, b) => a - b);
  const p999 = diffs[Math.floor(diffs.length * 0.999)] ?? 0;
  // RMS glissante 400 ms (max et min hors 1re seconde) : stabilité du niveau
  const fen = Math.floor(0.4 * sr);
  let rmsMax = 0, rmsMin = Infinity;
  for (let d = sr; d + fen <= n; d += fen) {
    let s = 0;
    for (let i = d; i < d + fen; i++) s += inter[2 * i] * inter[2 * i] + inter[2 * i + 1] * inter[2 * i + 1];
    const r = Math.sqrt(s / (2 * fen));
    rmsMax = Math.max(rmsMax, r); rmsMin = Math.min(rmsMin, r);
  }
  // spectre moyen (mono, Hann 4096, pas 4096)
  const N = 4096;
  const P = new Float64Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  let trames = 0;
  for (let d = 0; d + N <= n; d += N) {
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = ((inter[2 * (d + i)] + inter[2 * (d + i) + 1]) / 2) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    trames++;
  }
  let tot = 0, g = 0, m = 0, a = 0, cen = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    tot += P[k]; cen += P[k] * f;
    if (f < 250) g += P[k]; else if (f < 4000) m += P[k]; else a += P[k];
  }
  const rms = Math.sqrt(somme / inter.length);
  return {
    secondes: +(n / sr).toFixed(2),
    creteDb: +db(crete).toFixed(1),
    rmsDb: +db(rms).toFixed(1),
    rms400maxDb: +db(rmsMax).toFixed(1),
    rms400minDb: rmsMin === Infinity ? null : +db(rmsMin).toFixed(1),
    saturesPct: +((100 * sat) / inter.length).toFixed(4),
    nan,
    centreHz: tot ? Math.round(cen / tot) : 0,
    grave: tot ? +((100 * g) / tot).toFixed(1) : 0,
    medium: tot ? +((100 * m) / tot).toFixed(1) : 0,
    aigu: tot ? +((100 * a) / tot).toFixed(1) : 0,
    sautMax: +saut.toFixed(4),
    sautP999: +p999.toFixed(4),
    sautRatio: p999 ? +(saut / p999).toFixed(1) : null,
    sautT: +sautT.toFixed(3),
    ambiance: !!ambiance,
  };
}

function ecrireWav(fichier, inter, sr) {
  const n = inter.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, Number.isFinite(inter[i]) ? inter[i] : 0));
    b.writeInt16LE(Math.round(x * 32767), 44 + i * 2);
  }
  fs.writeFileSync(fichier, b);
}

// ---------- 4. exécution ----------
const navigateur = await playwright.chromium.launch({ headless: true });
const page = await navigateur.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(m.text()); });
await page.setContent('<!doctype html><title>audio</title>');
await page.addScriptTag({ path: BUNDLE });
await page.addScriptTag({ content: SCENARIOS_JS });
const noms = (await page.evaluate(() => Object.keys(window.SCENARIOS))).filter((n) => n.includes(filtre));
const resultats = {};
for (const nom of noms) {
  const { b64, ms, diag } = await page.evaluate((n) => window.rendre(n), nom);
  const buf = Buffer.from(b64, 'base64');
  const inter = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const amb = await page.evaluate((n) => !!window.SCENARIOS[n].ambiance, nom);
  const r = analyser(inter, 44100, amb);
  r.renduMs = Math.round(ms);
  r.diag = diag;
  resultats[nom] = r;
  ecrireWav(path.join(OUT, nom + '.wav'), inter, 44100);
  console.log(nom.padEnd(22), JSON.stringify(r));
}
await navigateur.close();
if (erreurs.length) console.log('ERREURS PAGE :', erreurs);

// spectrogrammes
for (const nom of ['a_jour_proche', 'a_jour_proche_mix', 'c_tempete', 'g_musique', 'b2_nuit_proche', 'h_caravane_village', 'f_canal_rafale']) {
  if (!resultats[nom]) continue;
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, nom + '.wav'), '-lavfi',
      'aresample=24000,showspectrumpic=s=1400x600:legend=1:scale=log:fscale=lin:color=intensity', path.join(OUT, nom + '.png')]);
  } catch (e) {
    console.log('ffmpeg', nom, String(e).slice(0, 200));
  }
}

const anc = fs.existsSync(path.join(OUT, 'mesures.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'mesures.json'), 'utf8')) : {};
const tout = { ...anc, ...resultats };
fs.writeFileSync(path.join(OUT, 'mesures.json'), JSON.stringify(tout, null, 2));
const lignes = ['| scénario | durée s | crête dBFS | RMS dBFS | RMS 400ms min/max | saturés % | NaN | centre Hz | grave/médium/aigu % | saut max (ratio p99.9) |', '|---|---|---|---|---|---|---|---|---|---|'];
for (const [n, r] of Object.entries(tout)) {
  lignes.push(`| ${n} | ${r.secondes} | ${r.creteDb} | ${r.rmsDb} | ${r.rms400minDb ?? '–'} / ${r.rms400maxDb} | ${r.saturesPct} | ${r.nan} | ${r.centreHz} | ${r.grave}/${r.medium}/${r.aigu} | ${r.sautMax} (${r.sautRatio}) |`);
}
fs.writeFileSync(path.join(OUT, 'mesures.md'), lignes.join('\n') + '\n');
console.log(lignes.join('\n'));
