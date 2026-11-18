/**
 * Tempête de sable : traînées de grains portées par le vent, autour du point regardé.
 */
import * as THREE from 'three';
import { DX, DZ, type Dir } from '../sim';

const NB = 900;

export interface Meteo {
  objet: THREE.LineSegments;
  /** intensite : 0 (rien) à ~1,4 ; dir : direction d'où vient le vent */
  maj(intensite: number, dir: Dir, centre: THREE.Vector3, etendue: number, dt: number): void;
}

export function creerMeteo(): Meteo {
  const pos = new Float32Array(NB * 6);
  const graines = new Float32Array(NB * 4);
  for (let k = 0; k < NB; k++) {
    graines[k * 4] = Math.random();
    graines[k * 4 + 1] = Math.random();
    graines[k * 4 + 2] = Math.random();
    graines[k * 4 + 3] = 0.6 + Math.random() * 0.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xf3d6a2, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const objet = new THREE.LineSegments(geo, mat);
  objet.frustumCulled = false;
  objet.renderOrder = 6;
  objet.visible = false;
  let lisse = 0;
  let phase = 0;
  return {
    objet,
    maj(intensite, dir, centre, etendue, dt) {
      lisse += (Math.min(1.3, intensite) - lisse) * Math.min(1, dt * 1.2);
      if (lisse < 0.02) {
        objet.visible = false;
        return;
      }
      objet.visible = true;
      mat.opacity = Math.min(0.75, 0.5 * lisse);
      // le vent souffle DEPUIS dir : les grains vont dans le sens opposé
      const vx = -DX[dir];
      const vz = -DZ[dir];
      const vitesse = 14 + 10 * lisse;
      phase += dt * vitesse;
      const e = Math.max(14, etendue);
      const long = 0.5 + 0.9 * lisse;
      for (let k = 0; k < NB; k++) {
        const a = graines[k * 4];
        const b = graines[k * 4 + 1];
        const h = graines[k * 4 + 2];
        const v = graines[k * 4 + 3];
        // position le long du vent (bouclée) et en travers
        const le = (((a * e * 2 + phase * v) % (e * 2)) + e * 2) % (e * 2) - e;
        const travers = (b * 2 - 1) * e;
        const x = centre.x + vx * le + -vz * travers;
        const z = centre.z + vz * le + vx * travers;
        const y = 0.15 + h * h * 4.5 + Math.sin(phase * 0.3 + a * 20) * 0.15;
        const l = long * v;
        const i = k * 6;
        pos[i] = x;
        pos[i + 1] = y;
        pos[i + 2] = z;
        pos[i + 3] = x + vx * l;
        pos[i + 4] = y - 0.03;
        pos[i + 5] = z + vz * l;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
