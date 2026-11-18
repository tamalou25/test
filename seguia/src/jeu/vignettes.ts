/**
 * Miniatures des bâtiments pour la barre de construction : chaque modèle est rendu une fois,
 * au chargement, dans un petit canevas à part.
 */
import * as THREE from 'three';
import { BATIMENTS, type BatimentKind } from '../sim';
import type { Modeles } from '../render/modeles';

export function genererVignettes(modeles: Modeles): Record<string, string> {
  const res: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer;
  const L = 124;
  const H = 92;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return res;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(L, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0xd8a878, 1.5));
  const soleil = new THREE.DirectionalLight(0xfff0d8, 3);
  soleil.position.set(-2.5, 4, 3);
  scene.add(soleil);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const boite = new THREE.Box3();
  const centre = new THREE.Vector3();
  const taille = new THREE.Vector3();
  for (const def of Object.values(BATIMENTS)) {
    if (!def.constructible) continue;
    const nom = def.kind === 'maison' ? 'maison_a' : def.kind;
    if (!modeles.a(nom)) continue;
    const obj = modeles.instancier(nom);
    scene.add(obj);
    boite.setFromObject(obj);
    boite.getCenter(centre);
    boite.getSize(taille);
    const rayon = Math.max(taille.x, taille.z) * 0.62 + taille.y * 0.38;
    const demiH = Math.max(0.42, rayon * 0.78);
    camera.top = demiH;
    camera.bottom = -demiH;
    camera.left = (-demiH * L) / H;
    camera.right = (demiH * L) / H;
    camera.position.set(centre.x + 6, centre.y + 5.2, centre.z + 7);
    camera.lookAt(centre.x, centre.y, centre.z);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    res[def.kind as BatimentKind] = renderer.domElement.toDataURL('image/png');
    scene.remove(obj);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return res;
}
