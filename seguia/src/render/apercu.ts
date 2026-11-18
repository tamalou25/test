/**
 * Aides visuelles de construction : cases surlignées, fantôme du bâtiment, cadre de sélection.
 */
import * as THREE from 'three';
import { N, type Carte } from '../sim';
import { DEMI, hauteurTerrain, NIVEAU } from './monde';
import type { Modeles } from './modeles';

const MAX_CASES = 600;

export const TEINTE = {
  ok: 0x6fd08c,
  refus: 0xe0544a,
  eau: 0x3fc1c9,
  alerte: 0xf0b232,
  neutre: 0xfff4d6,
  gomme: 0xd9534f,
};

export interface Apercu {
  groupe: THREE.Group;
  /** surligne des cases : [indice de case, teinte] */
  cases(liste: [number, number][], carte: Carte): void;
  /** fantôme d'un bâtiment à poser ; nom vide pour l'effacer */
  fantome(nom: string, x: number, z: number, w: number, d: number, rot: number, valide: boolean, carte: Carte): void;
  /** cadre autour d'une emprise sélectionnée (w = 0 pour l'effacer) */
  selection(x: number, z: number, w: number, d: number, carte: Carte | null): void;
  maj(temps: number): void;
}

export function creerApercu(modeles: Modeles): Apercu {
  const groupe = new THREE.Group();
  const geoCase = new THREE.PlaneGeometry(0.94, 0.94);
  geoCase.rotateX(-Math.PI / 2);
  const matCase = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
  });
  const casesMesh = new THREE.InstancedMesh(geoCase, matCase, MAX_CASES);
  casesMesh.count = 0;
  casesMesh.frustumCulled = false;
  casesMesh.renderOrder = 8;
  groupe.add(casesMesh);

  const m4 = new THREE.Matrix4();
  const coul = new THREE.Color();
  const fantomes = new Map<string, THREE.Object3D>();
  let fantomeCourant: THREE.Object3D | null = null;

  const matCadre = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.9, depthTest: false, fog: false });
  const cadre = new THREE.Group();
  const barres: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.05), matCadre);
    b.renderOrder = 9;
    barres.push(b);
    cadre.add(b);
  }
  cadre.visible = false;
  groupe.add(cadre);

  return {
    groupe,
    cases(liste, carte) {
      const n = Math.min(MAX_CASES, liste.length);
      for (let k = 0; k < n; k++) {
        const [i, teinte] = liste[k];
        const tx = i % N;
        const tz = Math.floor(i / N);
        m4.makeTranslation(tx + 0.5 - DEMI, hauteurTerrain(carte, tx + 0.5, tz + 0.5) + 0.09, tz + 0.5 - DEMI);
        casesMesh.setMatrixAt(k, m4);
        casesMesh.setColorAt(k, coul.set(teinte));
      }
      casesMesh.count = n;
      casesMesh.instanceMatrix.needsUpdate = true;
      if (casesMesh.instanceColor) casesMesh.instanceColor.needsUpdate = true;
    },
    fantome(nom, x, z, w, d, rot, valide, carte) {
      if (fantomeCourant) fantomeCourant.visible = false;
      fantomeCourant = null;
      if (!nom || !modeles.a(nom)) return;
      let f = fantomes.get(nom);
      if (!f) {
        f = modeles.instancier(nom);
        fantomes.set(nom, f);
        groupe.add(f);
      }
      const mat = valide ? modeles.mats.fantomeOk : modeles.mats.fantomeRefus;
      f.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = mat;
          m.castShadow = false;
          m.receiveShadow = false;
          m.renderOrder = 7;
        }
      });
      f.position.set(x + w / 2 - DEMI, carte.elev[z * N + x] * NIVEAU + 0.02, z + d / 2 - DEMI);
      f.rotation.y = (-rot * Math.PI) / 2;
      f.visible = true;
      fantomeCourant = f;
    },
    selection(x, z, w, d, carte) {
      if (!carte || w <= 0) {
        cadre.visible = false;
        return;
      }
      cadre.visible = true;
      const y = carte.elev[z * N + x] * NIVEAU + 0.1;
      const cx = x + w / 2 - DEMI;
      const cz = z + d / 2 - DEMI;
      const lx = w + 0.1;
      const lz = d + 0.1;
      barres[0].scale.set(lx, 1, 1);
      barres[0].position.set(cx, y, cz - lz / 2);
      barres[1].scale.set(lx, 1, 1);
      barres[1].position.set(cx, y, cz + lz / 2);
      barres[2].scale.set(lz, 1, 1);
      barres[2].rotation.y = Math.PI / 2;
      barres[2].position.set(cx - lx / 2, y, cz);
      barres[3].scale.set(lz, 1, 1);
      barres[3].rotation.y = Math.PI / 2;
      barres[3].position.set(cx + lx / 2, y, cz);
    },
    maj(temps) {
      matCase.opacity = 0.42 + 0.12 * Math.sin(temps * 4);
      matCadre.opacity = 0.7 + 0.25 * Math.sin(temps * 3.5);
    },
  };
}
