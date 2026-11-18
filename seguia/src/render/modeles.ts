/**
 * Chargement des modèles GLB (couleurs de sommets) et matériaux partagés.
 * Convention des matériaux par nom : vc, lumiere, eau, tissu (voir assets_src/CONVENTIONS.md).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface Materiaux {
  vc: THREE.MeshStandardMaterial;
  lumiere: THREE.MeshStandardMaterial;
  eau: THREE.MeshStandardMaterial;
  tissu: THREE.MeshStandardMaterial;
  fantomeOk: THREE.MeshBasicMaterial;
  fantomeRefus: THREE.MeshBasicMaterial;
  uniformes: { uTemps: { value: number }; uVent: { value: number } };
}

export function creerMateriaux(): Materiaux {
  const uniformes = { uTemps: { value: 0 }, uVent: { value: 0.3 } };
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const lumiere = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    emissive: 0xffb04a,
    emissiveIntensity: 0,
  });
  const eau = new THREE.MeshStandardMaterial({ color: 0x2fb5b0, roughness: 0.12, metalness: 0.05 });
  const tissu = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  tissu.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniformes);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTemps;\nuniform float uVent;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 pm = modelMatrix * vec4(position, 1.0);
          float phase = pm.x * 3.1 + pm.z * 2.3 + uTemps * (1.6 + 3.0 * uVent);
          transformed.y += sin(phase) * 0.012 * (0.4 + uVent);
          transformed.x += cos(phase * 0.8) * 0.008 * uVent;
        }`,
      );
  };
  const fantomeOk = new THREE.MeshBasicMaterial({ color: 0x7ad07a, transparent: true, opacity: 0.55, depthWrite: false });
  const fantomeRefus = new THREE.MeshBasicMaterial({ color: 0xd9534f, transparent: true, opacity: 0.55, depthWrite: false });
  return { vc, lumiere, eau, tissu, fantomeOk, fantomeRefus, uniformes };
}

export interface Piece {
  geometrie: THREE.BufferGeometry;
  materiau: string;
}

export class Modeles {
  private scenes = new Map<string, THREE.Object3D>();
  readonly mats: Materiaux;
  manquants: string[] = [];

  constructor(mats: Materiaux) {
    this.mats = mats;
  }

  private mat(nom: string): THREE.Material {
    if (nom === 'lumiere') return this.mats.lumiere;
    if (nom === 'eau') return this.mats.eau;
    if (nom === 'tissu') return this.mats.tissu;
    return this.mats.vc;
  }

  /** Charge tous les modèles du manifeste. Les fichiers absents sont notés dans `manquants`. */
  async charger(base: string, surProgres?: (fait: number, total: number) => void): Promise<void> {
    let noms: string[] = [];
    try {
      const rep = await fetch(base + 'manifest.json');
      const manifeste = await rep.json();
      noms = Object.keys(manifeste.modeles ?? {});
    } catch {
      this.manquants.push('manifest.json');
      return;
    }
    const chargeur = new GLTFLoader();
    let fait = 0;
    await Promise.all(
      noms.map(async (nom) => {
        try {
          const gltf = await chargeur.loadAsync(base + nom + '.glb');
          const racine = gltf.scene;
          racine.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const ancien = m.material as THREE.Material;
            const nomMat = ancien?.name ?? 'vc';
            m.userData.materiau = nomMat.split('.')[0];
            m.material = this.mat(m.userData.materiau);
            m.castShadow = m.userData.materiau !== 'eau';
            m.receiveShadow = true;
            ancien?.dispose?.();
          });
          this.scenes.set(nom, racine);
        } catch {
          this.manquants.push(nom);
        }
        fait++;
        surProgres?.(fait, noms.length);
      }),
    );
  }

  a(nom: string): boolean {
    return this.scenes.has(nom);
  }

  /** Copie d'un modèle (géométries et matériaux partagés). Boîte de remplacement si le modèle manque. */
  instancier(nom: string, w = 1, d = 1): THREE.Object3D {
    const src = this.scenes.get(nom);
    if (src) return src.clone(true);
    const g = new THREE.Group();
    const boite = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.2, 0.7, d - 0.2),
      new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.9 }),
    );
    boite.position.y = 0.35;
    boite.castShadow = true;
    boite.receiveShadow = true;
    g.add(boite);
    return g;
  }

  /**
   * Géométries d'un nœud (et de ses descendants), ramenées dans le repère du modèle :
   * de quoi construire des InstancedMesh. `noeud` vide : tout le modèle.
   */
  pieces(nom: string, noeud = ''): Piece[] {
    const src = this.scenes.get(nom);
    if (!src) return [];
    src.updateMatrixWorld(true);
    const depart = noeud ? src.getObjectByName(noeud) : src;
    if (!depart) return [];
    const inverse = new THREE.Matrix4().copy(src.matrixWorld).invert();
    const res: Piece[] = [];
    depart.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
      res.push({ geometrie: g, materiau: m.userData.materiau ?? 'vc' });
    });
    return res;
  }

  /** Position d'un nœud dans le repère du modèle (pivot d'animation). */
  pivot(nom: string, noeud: string): THREE.Vector3 {
    const src = this.scenes.get(nom);
    const v = new THREE.Vector3();
    if (!src) return v;
    src.updateMatrixWorld(true);
    const o = src.getObjectByName(noeud);
    if (!o) return v;
    o.getWorldPosition(v);
    return src.worldToLocal(v);
  }

  materiau(nom: string): THREE.Material {
    return this.mat(nom);
  }
}
