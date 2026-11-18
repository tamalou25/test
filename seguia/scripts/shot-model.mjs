#!/usr/bin/env node
/**
 * shot-model.mjs — capture d'un modèle GLB de Séguia rendu par three.js dans Chromium
 * (Playwright, rendu logiciel SwiftShader : aucun GPU ni affichage requis).
 *
 * USAGE
 *   node scripts/shot-model.mjs <nom | chemin.glb> <sortie.png> [options]
 *
 *   <nom>            nom d'un modèle de public/assets/models/ (ex. maison_a)
 *   <chemin.glb>     ou un chemin explicite vers un .glb
 *   --close          gros plan rasant (caméra basse et proche)
 *   --night          éclairage de nuit : matériaux `lumiere` fortement émissifs
 *   --az <deg>       azimut de la caméra (défaut 35 : façade +Z vue de trois-quarts, côté +X)
 *   --el <deg>       élévation de la caméra (défaut 40, ou 14 avec --close)
 *   --zoom <k>       multiplie la distance de cadrage (défaut 1 ; <1 = plus près)
 *   --footprint WxD  emprise à dessiner (défaut : lue dans manifest.json, sinon aucune)
 *   --size WxH       taille de l'image (défaut 1280x800)
 *
 * RENDU (identique à ce que les conventions supposent côté moteur)
 *   sol sable #E3B98C, quadrillage d'une unité discret, emprise dessinée en tirets ;
 *   fin d'après-midi : directionnelle chaude + hémisphère, ombres portées ;
 *   tone mapping ACES, sortie sRGB ; matériaux remplacés PAR NOM :
 *     vc      -> MeshStandardMaterial vertexColors, rugosité 0,9
 *     lumiere -> vertexColors + émissif #FFC56B (fort avec --night)
 *     eau     -> turquoise #2FB5B0 légèrement brillant
 *     tissu   -> vertexColors double face
 *     autre   -> MAGENTA (signale un nom de matériau non conforme)
 *   Le terminal affiche triangles, nœuds et matériaux trouvés.
 *
 * EXEMPLES
 *   node scripts/shot-model.mjs maison_a assets_src/previews/maison_a.png
 *   node scripts/shot-model.mjs maison_a /tmp/m.png --close --az 200
 *   node scripts/shot-model.mjs caravanserail /tmp/c.png --night
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'public', 'assets', 'models');

function usage(msg) {
  if (msg) console.error('erreur : ' + msg);
  console.error('usage : node scripts/shot-model.mjs <nom|chemin.glb> <sortie.png> [--close] [--night] [--az deg] [--el deg] [--zoom k] [--footprint WxD] [--size WxH]');
  process.exit(1);
}

const args = process.argv.slice(2);
const pos = [];
const opt = { close: false, night: false, az: null, el: null, zoom: 1, footprint: null, size: [1280, 800] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--close') opt.close = true;
  else if (a === '--night') opt.night = true;
  else if (a === '--az') opt.az = parseFloat(args[++i]);
  else if (a === '--el') opt.el = parseFloat(args[++i]);
  else if (a === '--zoom') opt.zoom = parseFloat(args[++i]);
  else if (a === '--footprint') opt.footprint = args[++i].split('x').map(Number);
  else if (a === '--size') opt.size = args[++i].split('x').map(Number);
  else if (a === '-h' || a === '--help') usage();
  else if (a.startsWith('--')) usage('option inconnue ' + a);
  else pos.push(a);
}
if (pos.length !== 2) usage();

let glbPath = pos[0];
let name = path.basename(glbPath, '.glb');
if (!glbPath.endsWith('.glb')) glbPath = path.join(MODELS, glbPath + '.glb');
glbPath = path.resolve(glbPath);
if (!fs.existsSync(glbPath)) usage('fichier introuvable : ' + glbPath);
const outPath = path.resolve(pos[1]);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

if (!opt.footprint) {
  try {
    const man = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8'));
    const e = man.modeles && man.modeles[name];
    if (e && e.emprise) opt.footprint = e.emprise;
  } catch { /* pas de manifeste : pas d'emprise */ }
}

// ---------------------------------------------------------------- page de rendu
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000;overflow:hidden}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
</head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const O = ${JSON.stringify(opt)};
const [W, H] = O.size;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = O.night ? 1.0 : 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = new THREE.Color(O.night ? '#141a2e' : '#f1dfc4');
scene.background = sky;

const gltf = await new GLTFLoader().loadAsync('/model.glb');
const root = gltf.scene;
const info = { triangles: 0, nodes: [], materials: {} };
const mats = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
  lumiere: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0,
    emissive: new THREE.Color('#FFC56B'), emissiveIntensity: O.night ? 3.0 : 0.06 }),
  eau: new THREE.MeshStandardMaterial({ color: new THREE.Color('#2FB5B0'), roughness: 0.18, metalness: 0.05 }),
  tissu: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
};
const bad = new THREE.MeshBasicMaterial({ color: 0xff00ff });
root.traverse((o) => {
  if (o !== root) info.nodes.push(o.name + (o.isMesh ? '' : '/'));
  if (!o.isMesh) return;
  const n = o.material && o.material.name;
  info.materials[n] = (info.materials[n] || 0) + 1;
  o.material = mats[n] || bad;
  o.castShadow = true;
  o.receiveShadow = true;
  const g = o.geometry;
  info.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  if (!g.attributes.color) info.noColor = (info.noColor || []).concat(o.name);
});
scene.add(root);
root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
info.box = { min: box.min.toArray().map(v => +v.toFixed(3)), max: box.max.toArray().map(v => +v.toFixed(3)) };

// sol + quadrillage (texture répétée : pas de lignes en z-fighting) + emprise (ruban)
const ext = Math.max(8, Math.ceil(Math.max(size.x, size.z) * 3));
const G = ext * 4;
const cv = document.createElement('canvas');
cv.width = cv.height = 128;
const cx2 = cv.getContext('2d');
cx2.fillStyle = '#E3B98C';
cx2.fillRect(0, 0, 128, 128);
cx2.fillStyle = 'rgba(122, 82, 50, 0.16)';
cx2.fillRect(0, 0, 128, 2);
cx2.fillRect(0, 0, 2, 128);
const gtex = new THREE.CanvasTexture(cv);
gtex.colorSpace = THREE.SRGBColorSpace;
gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
gtex.repeat.set(G, G);
gtex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const off = O.footprint ? [(O.footprint[0] % 2) * 0.5, (O.footprint[1] % 2) * 0.5] : [0.5, 0.5];
// les lignes du motif sont en u = 0 : on les place sur les bords de cases
gtex.offset.set((G / 2 + off[0]) % 1 - 1 / 128, (G / 2 + off[1]) % 1 - 1 / 128);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(G, G),
  new THREE.MeshStandardMaterial({ map: gtex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
if (O.footprint) {
  const [fx, fz] = O.footprint;
  const fpMat = new THREE.MeshBasicMaterial({ color: 0x7a3d1e, transparent: true, opacity: 0.55,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
  const wdt = 0.018, dash = 0.12, gap = 0.08;
  const edges = [[[-fx/2,-fz/2],[fx/2,-fz/2]],[[fx/2,-fz/2],[fx/2,fz/2]],[[fx/2,fz/2],[-fx/2,fz/2]],[[-fx/2,fz/2],[-fx/2,-fz/2]]];
  for (const [[ax, az], [bx, bz]] of edges) {
    const L = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < L; t += dash + gap) {
      const t1 = Math.min(L, t + dash);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(t1 - t, wdt), fpMat);
      seg.rotation.x = -Math.PI / 2;
      const ang = Math.atan2(bz - az, bx - ax);
      seg.rotation.z = -ang;
      const mid = (t + t1) / 2 / L;
      seg.position.set(ax + (bx - ax) * mid, 0.001, az + (bz - az) * mid);
      seg.rotation.order = 'YXZ';
      seg.rotation.set(-Math.PI / 2, 0, -ang);
      scene.add(seg);
    }
  }
}

// éclairage
const R = Math.max(size.length() / 2, 0.25);
const sun = new THREE.DirectionalLight(O.night ? '#8fa6d8' : '#ffe0b5', O.night ? 0.7 : 2.6);
const sunDir = new THREE.Vector3(0.62, 0.62, 0.48).normalize();   // soleil bas, à droite-devant
sun.position.copy(center).addScaledVector(sunDir, R * 6);
sun.target.position.copy(center);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
const span = Math.max(R * 2.2, 1.5);
sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
sc.near = 0.01; sc.far = R * 14;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.01;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(O.night ? '#4a5a8a' : '#cfe0ee', O.night ? '#2a2018' : '#c79a6b', O.night ? 0.9 : 1.15);
scene.add(hemi);

// caméra
const fov = 30;
const cam = new THREE.PerspectiveCamera(fov, W / H, 0.01, 500);
const az = THREE.MathUtils.degToRad(O.az ?? 35);
const el = THREE.MathUtils.degToRad(O.el ?? (O.close ? 14 : 40));
const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
let target = center.clone();
let dist;
if (O.close) {
  target.y = box.min.y + size.y * 0.5;
  dist = Math.max((R / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 0.78,
    (size.y * 0.62) / Math.tan(THREE.MathUtils.degToRad(fov / 2)));
} else {
  // cadrage : la sphère englobante (et l'emprise) tient dans le champ vertical
  const fr = O.footprint ? Math.max(R, Math.hypot(O.footprint[0], O.footprint[1]) / 2 * 0.95) : R;
  dist = (fr / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 1.02;
}
dist *= O.zoom;
cam.position.copy(target).addScaledVector(dir, dist);
cam.lookAt(target);
cam.near = Math.max(0.01, dist / 100); cam.far = dist * 20; cam.updateProjectionMatrix();
renderer.render(scene, cam);
window.__info = info;
window.__done = true;
</script></body></html>`;

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = null;
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(PAGE);
  }
  if (url === '/model.glb') file = glbPath;
  else if (url.startsWith('/three/')) file = path.join(ROOT, 'node_modules', url.slice(1));
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: opt.size[0], height: opt.size[1] } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__done === true || false, null, { timeout: 120000 })
    .catch(() => { throw new Error('rendu non terminé : ' + errors.join(' | ')); });
  const info = await page.evaluate(() => window.__info);
  await page.screenshot({ path: outPath });
  console.log(`${name}: ${info.triangles} triangles | nœuds ${info.nodes.join(', ')} | matériaux ${JSON.stringify(info.materials)} | boîte ${JSON.stringify(info.box)}`);
  if (info.noColor) console.warn('ATTENTION maillages sans COLOR_0 : ' + info.noColor.join(', '));
  if (Object.keys(info.materials).some((k) => !['vc', 'lumiere', 'eau', 'tissu'].includes(k)))
    console.warn('ATTENTION matériau hors convention (rendu magenta)');
  console.log('-> ' + outPath);
} finally {
  await browser.close();
  server.close();
}
