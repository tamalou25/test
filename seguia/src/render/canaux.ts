/**
 * Séguias : berges (terre ou maçonnerie) et ruban d'eau animé.
 * La géométrie n'est reconstruite que lorsque le tracé change ; le débit est lu dans la texture d'état.
 */
import * as THREE from 'three';
import { DX, DZ, N, type Cache, type GameState } from '../sim';
import { DEMI, hauteurTerrain } from './monde';

const DEMI_EAU = 0.17;
const BERGE = 0.085;
const FIN_PLAT = 0.5 - 0.15; // distance au centre où commence la rampe

export interface Canaux {
  groupe: THREE.Group;
  reconstruire(s: GameState, c: Cache): void;
  uniformes: { uTemps: { value: number } };
  liberer(): void;
}

export function creerCanaux(texEtat: THREE.DataTexture): Canaux {
  const groupe = new THREE.Group();
  const uniformes = { uTemps: { value: 0 }, uEtat: { value: texEtat } };

  const matEau = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.0 });
  matEau.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniformes);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aCentre;\nattribute vec2 aDir;\nvarying vec2 vCentre;\nvarying vec2 vDir;\nvarying vec2 vPlan;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCentre = aCentre;\nvDir = aDir;\nvPlan = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vCentre;
        varying vec2 vDir;
        varying vec2 vPlan;
        uniform sampler2D uEtat;
        uniform float uTemps;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec4 etat = texture2D(uEtat, vCentre);
        float q = etat.b;
        float enEau = smoothstep(0.004, 0.05, q);
        float le = dot(vPlan, vDir);
        float travers = dot(vPlan, vec2(-vDir.y, vDir.x));
        float t = uTemps * (0.5 + 2.2 * q);
        float onde = sin((le - t) * 9.0 + sin(travers * 17.0 + le * 2.1 + uTemps * 0.7) * 2.2) * 0.6
                   + sin((le - t * 1.4) * 21.0 + travers * 9.0) * 0.4;
        float stries = smoothstep(0.45, 1.0, onde) * (0.06 + 0.20 * q) * enEau * step(0.01, dot(vDir, vDir));
        vec3 eau = mix(vec3(0.05, 0.36, 0.40), vec3(0.16, 0.70, 0.68), 0.30 + 0.70 * min(1.0, q * 2.0));
        vec3 lit = vec3(0.34, 0.24, 0.17);
        diffuseColor.rgb = mix(lit, eau + stries, enEau);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.76, 0.56), smoothstep(0.15, 0.7, etat.g));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.16, smoothstep(0.004, 0.05, texture2D(uEtat, vCentre).b) * (1.0 - smoothstep(0.15, 0.7, texture2D(uEtat, vCentre).g)));`,
      );
  };
  const matBerge = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

  let meshEau: THREE.Mesh | null = null;
  let meshBerge: THREE.Mesh | null = null;

  const terre = new THREE.Color(0x8a5c3d);
  const terre2 = new THREE.Color(0x73492f);
  const pierre = new THREE.Color(0xc2b099);
  const pierre2 = new THREE.Color(0xa8957c);

  function reconstruire(s: GameState, c: Cache) {
    if (meshEau) {
      groupe.remove(meshEau);
      meshEau.geometry.dispose();
    }
    if (meshBerge) {
      groupe.remove(meshBerge);
      meshBerge.geometry.dispose();
    }
    const carte = s.carte;
    const pE: number[] = [];
    const cenE: number[] = [];
    const dirE: number[] = [];
    const iE: number[] = [];
    const pB: number[] = [];
    const cB: number[] = [];
    const iB: number[] = [];
    const tmp = new THREE.Color();

    const y = (fx: number, fz: number) => hauteurTerrain(carte, fx, fz);

    /** quadrilatère d'eau : 4 coins (x, z) dans l'ordre, hauteur prise sur le terrain */
    const quadEau = (pts: [number, number][], cx0: number, cz0: number, dx: number, dz: number, dessus = 0.035) => {
      const base = pE.length / 3;
      for (const [fx, fz] of pts) {
        pE.push(fx - DEMI, y(fx, fz) + dessus, fz - DEMI);
        cenE.push((cx0 + 0.5) / N, (cz0 + 0.5) / N);
        dirE.push(dx, dz);
      }
      iE.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    /** bande de berge : dessus + flanc extérieur */
    const quadBerge = (pts: [number, number][], maconne: boolean, h: number) => {
      const base = pB.length / 3;
      for (const [fx, fz] of pts) {
        pB.push(fx - DEMI, y(fx, fz) + h, fz - DEMI);
        const n = Math.abs(Math.sin(fx * 12.9898 + fz * 78.233) * 43758.5453) % 1;
        tmp.copy(maconne ? pierre : terre).lerp(maconne ? pierre2 : terre2, n);
        cB.push(tmp.r, tmp.g, tmp.b);
      }
      iB.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    for (let i = 0; i < N * N; i++) {
      if (!s.canal[i]) continue;
      const tx = i % N;
      const tz = Math.floor(i / N);
      const cxm = tx + 0.5;
      const czm = tz + 0.5;
      const maconne = s.canal[i] === 2;
      const hB = maconne ? 0.085 : 0.06;
      const e = DEMI_EAU;
      const b = BERGE;
      // direction du courant dans la case : du parent vers la case
      const parent = c.parent[i];
      let dirX = 0;
      let dirZ = 0;
      if (parent >= 0) {
        dirX = tx - (parent % N);
        dirZ = tz - Math.floor(parent / N);
      } else if (c.rang[i] >= 0) {
        for (let k = 0; k < 4; k++) {
          if (c.enfant[i * 4 + k] >= 0) {
            dirX = DX[k];
            dirZ = DZ[k];
            break;
          }
        }
      }
      // connexions visuelles : toute séguia voisine, et le bâtiment source
      const lie: boolean[] = [false, false, false, false];
      for (let k = 0; k < 4; k++) {
        const nx = tx + DX[k];
        const nz = tz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (s.canal[j]) lie[k] = true;
        else if (i === carte.sourceCase && c.occ[j]) {
          const bat = s.batiments.find((q) => q.id === c.occ[j]);
          if (bat && bat.kind === 'source') lie[k] = true;
        }
      }
      // carré central
      quadEau(
        [
          [cxm - e, czm - e],
          [cxm - e, czm + e],
          [cxm + e, czm + e],
          [cxm + e, czm - e],
        ],
        tx,
        tz,
        dirX,
        dirZ,
      );
      // coins de berge
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const x0 = cxm + sx * e;
        const x1 = cxm + sx * (e + b);
        const z0 = czm + sz * e;
        const z1 = czm + sz * (e + b);
        const pts: [number, number][] = [
          [Math.min(x0, x1), Math.min(z0, z1)],
          [Math.min(x0, x1), Math.max(z0, z1)],
          [Math.max(x0, x1), Math.max(z0, z1)],
          [Math.max(x0, x1), Math.min(z0, z1)],
        ];
        quadBerge(pts, maconne, hB);
      }
      for (let k = 0; k < 4; k++) {
        const ux = DX[k];
        const uz = DZ[k];
        // vecteur transverse
        const vx = -uz;
        const vz = ux;
        if (!lie[k]) {
          // berge qui ferme le côté
          const a0: [number, number] = [cxm + ux * e - vx * e, czm + uz * e - vz * e];
          const a1: [number, number] = [cxm + ux * e + vx * e, czm + uz * e + vz * e];
          const b1: [number, number] = [cxm + ux * (e + b) + vx * e, czm + uz * (e + b) + vz * e];
          const b0: [number, number] = [cxm + ux * (e + b) - vx * e, czm + uz * (e + b) - vz * e];
          quadBerge(ordonner([a0, a1, b1, b0]), maconne, hB);
          continue;
        }
        // sens du courant dans ce bras
        const versEnfant = c.enfant[i * 4 + k] >= 0;
        const versParent = parent >= 0 && (parent % N) - tx === ux && Math.floor(parent / N) - tz === uz;
        const sx = versEnfant ? ux : versParent ? -ux : 0;
        const sz = versEnfant ? uz : versParent ? -uz : 0;
        // deux tronçons : plat jusqu'à la rampe, puis rampe jusqu'à la limite de case
        const troncons: [number, number][] = [
          [e, FIN_PLAT],
          [FIN_PLAT, 0.5],
        ];
        for (const [d0, d1] of troncons) {
          const p0: [number, number] = [cxm + ux * d0 - vx * e, czm + uz * d0 - vz * e];
          const p1: [number, number] = [cxm + ux * d0 + vx * e, czm + uz * d0 + vz * e];
          const p2: [number, number] = [cxm + ux * d1 + vx * e, czm + uz * d1 + vz * e];
          const p3: [number, number] = [cxm + ux * d1 - vx * e, czm + uz * d1 - vz * e];
          quadEau(ordonner([p0, p1, p2, p3]), tx, tz, sx, sz);
          for (const cote of [-1, 1]) {
            const q0: [number, number] = [cxm + ux * d0 + vx * cote * e, czm + uz * d0 + vz * cote * e];
            const q1: [number, number] = [cxm + ux * d0 + vx * cote * (e + b), czm + uz * d0 + vz * cote * (e + b)];
            const q2: [number, number] = [cxm + ux * d1 + vx * cote * (e + b), czm + uz * d1 + vz * cote * (e + b)];
            const q3: [number, number] = [cxm + ux * d1 + vx * cote * e, czm + uz * d1 + vz * cote * e];
            quadBerge(ordonner([q0, q1, q2, q3]), maconne, hB);
          }
        }
      }
    }

    if (pE.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pE, 3));
      g.setAttribute('aCentre', new THREE.Float32BufferAttribute(cenE, 2));
      g.setAttribute('aDir', new THREE.Float32BufferAttribute(dirE, 2));
      g.setIndex(iE);
      g.computeVertexNormals();
      meshEau = new THREE.Mesh(g, matEau);
      meshEau.receiveShadow = true;
      groupe.add(meshEau);
      const gb = new THREE.BufferGeometry();
      gb.setAttribute('position', new THREE.Float32BufferAttribute(pB, 3));
      gb.setAttribute('color', new THREE.Float32BufferAttribute(cB, 3));
      gb.setIndex(iB);
      gb.computeVertexNormals();
      meshBerge = new THREE.Mesh(gb, matBerge);
      meshBerge.receiveShadow = true;
      meshBerge.castShadow = true;
      groupe.add(meshBerge);
    } else {
      meshEau = null;
      meshBerge = null;
    }
  }

  return {
    groupe,
    reconstruire,
    uniformes,
    liberer() {
      meshEau?.geometry.dispose();
      meshBerge?.geometry.dispose();
      matEau.dispose();
      matBerge.dispose();
    },
  };
}

/** Remet 4 points en ordre tel que la face regarde vers le haut (sens trigonométrique vu du dessus, y vers le haut). */
function ordonner(p: [number, number][]): [number, number][] {
  // aire signée dans le plan (x, z) ; three.js : face avant = sens antihoraire vu de face.
  let aire = 0;
  for (let k = 0; k < 4; k++) {
    const a = p[k];
    const b = p[(k + 1) % 4];
    aire += a[0] * b[1] - b[0] * a[1];
  }
  // Une normale vers +y demande une aire signée négative dans le plan (x, z).
  return aire < 0 ? p : [p[0], p[3], p[2], p[1]];
}
