/**
 * Le bloc de désert : dessus (terrasses, rampes, dunes, rochers), tranche à strates, socle.
 * Le sol réagit à la simulation par une petite texture d'état (humidité, sable, débit).
 */
import * as THREE from 'three';
import { bruit, hacher } from '../sim/rng';
import { N, Sol, type Carte, type GameState } from '../sim';
import type { Cache } from '../sim';
import { DEMI, hauteurTerrain, RAMPE, SOCLE } from './monde';

const DECOUPE = [0, RAMPE, 0.5, 1 - RAMPE];
const PAR_CASE = DECOUPE.length;
const COTE = N * PAR_CASE + 1;

const C = (hex: number) => new THREE.Color(hex);
const COUL = {
  sable: C(0xefcb9d),
  sable2: C(0xe4b585),
  reg: C(0xddb489),
  reg2: C(0xcfa37a),
  roche: C(0xb9785a),
  roche2: C(0x8a5440),
  dune: C(0xeccb9c),
  dune2: C(0xe2b782),
  piste: C(0xe3ceac),
  talus: C(0xb98660),
};

const STRATES = [C(0xd9a877), C(0xc48f62), C(0xb07a55), C(0x9a6648), C(0x8a5a42), C(0x70483a), C(0x5c3b31)];

function coordGrille(k: number): number {
  const t = Math.floor(k / PAR_CASE);
  return t + (k === COTE - 1 ? 0 : DECOUPE[k % PAR_CASE]);
}

function couleurDeCase(carte: Carte, tx: number, tz: number, fx: number, fz: number, cible: THREE.Color) {
  const x = Math.min(N - 1, Math.max(0, tx));
  const z = Math.min(N - 1, Math.max(0, tz));
  const i = z * N + x;
  const s = carte.sol[i];
  const n = bruit(fx * 1.7, fz * 1.7, 7);
  if (s === Sol.Roche) cible.copy(COUL.roche).lerp(COUL.roche2, 0.25 + 0.6 * n);
  else if (s === Sol.Dune) cible.copy(COUL.dune).lerp(COUL.dune2, n);
  else if (s === Sol.Piste) cible.copy(COUL.piste).lerp(COUL.sable2, 0.25 * n);
  else if (s === Sol.Reg) cible.copy(COUL.reg).lerp(COUL.reg2, 0.15 + 0.5 * n);
  else cible.copy(COUL.sable).lerp(COUL.sable2, 0.55 * n);
  // chaque terrasse a sa nuance : plus claire en haut
  if (s !== Sol.Roche) cible.multiplyScalar(0.93 + 0.035 * carte.elev[i]);
}

const cA = new THREE.Color();
const cB = new THREE.Color();
const cC = new THREE.Color();
const cD = new THREE.Color();

function couleurSol(carte: Carte, fx: number, fz: number, pente: number, hauteur: number, cible: THREE.Color) {
  // mélange doux entre les centres des quatre cases voisines : pas de damier
  const gx = fx - 0.5;
  const gz = fz - 0.5;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  let u = gx - x0;
  let v = gz - z0;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  couleurDeCase(carte, x0, z0, fx, fz, cA);
  couleurDeCase(carte, x0 + 1, z0, fx, fz, cB);
  couleurDeCase(carte, x0, z0 + 1, fx, fz, cC);
  couleurDeCase(carte, x0 + 1, z0 + 1, fx, fz, cD);
  cA.lerp(cB, u);
  cC.lerp(cD, u);
  cible.copy(cA).lerp(cC, v);
  const tx = Math.min(N - 1, Math.max(0, Math.floor(fx - 1e-6)));
  const tz = Math.min(N - 1, Math.max(0, Math.floor(fz - 1e-6)));
  const s = carte.sol[tz * N + tx];
  const grain = hacher(Math.floor(fx * 9), Math.floor(fz * 9), 3);
  if (s === Sol.Roche) {
    // strates de grès : bandes horizontales selon la hauteur
    const bande = Math.sin(hauteur * 11.0 + bruit(fx / 2, fz / 2, 19) * 3.0) * 0.5 + 0.5;
    cible.copy(COUL.roche).lerp(COUL.roche2, 0.15 + 0.55 * bande);
    if (pente < 0.12) cible.lerp(COUL.dune2, 0.35); // replats ensablés
  } else if (pente > 0.2) {
    // les talus montrent la terre des terrasses
    cible.lerp(COUL.talus, Math.min(1, (pente - 0.2) * 2.2));
  }
  cible.multiplyScalar(0.96 + 0.08 * grain);
}

function couleurStrate(y: number, u: number, cible: THREE.Color) {
  const ondule = Math.sin(u * 0.35) * 0.12 + bruit(u * 0.4, y * 3, 17) * 0.35;
  const t = Math.max(0, Math.min(0.999, (0.9 - y + ondule) / (SOCLE + 1.6)));
  const f = t * (STRATES.length - 1);
  const a = Math.floor(f);
  const b = Math.min(STRATES.length - 1, a + 1);
  const bande = f - a;
  cible.copy(STRATES[a]).lerp(STRATES[b], bande > 0.82 ? (bande - 0.82) / 0.18 : 0);
  cible.multiplyScalar(0.92 + 0.14 * hacher(Math.floor(u * 3), Math.floor(y * 14), 5));
}

export interface Terrain {
  groupe: THREE.Group;
  /** à appeler quand humidité, sable ou débits ont changé */
  majEtat(s: GameState, c: Cache): void;
  /** surcouche d'information (vent, eau potable…) : valeurs 0..1 par case, ou null pour l'éteindre */
  surcouche(valeurs: Float32Array | null, teinteBasse?: number, teinteHaute?: number): void;
  texEtat: THREE.DataTexture;
  uniformes: { uTemps: { value: number } };
  liberer(): void;
}

export function creerTerrain(carte: Carte): Terrain {
  const groupe = new THREE.Group();

  // --- hauteurs ---
  const haut = new Float32Array(COTE * COTE);
  for (let kz = 0; kz < COTE; kz++) {
    for (let kx = 0; kx < COTE; kx++) haut[kz * COTE + kx] = hauteurTerrain(carte, coordGrille(kx), coordGrille(kz));
  }

  // --- dessus ---
  const pos = new Float32Array(COTE * COTE * 3);
  const col = new Float32Array(COTE * COTE * 3);
  const tmp = new THREE.Color();
  for (let kz = 0; kz < COTE; kz++) {
    for (let kx = 0; kx < COTE; kx++) {
      const k = kz * COTE + kx;
      const fx = coordGrille(kx);
      const fz = coordGrille(kz);
      pos[k * 3] = fx - DEMI;
      pos[k * 3 + 1] = haut[k];
      pos[k * 3 + 2] = fz - DEMI;
      const g = (a: number, b: number) => haut[Math.min(COTE - 1, Math.max(0, b)) * COTE + Math.min(COTE - 1, Math.max(0, a))];
      const pente = Math.max(Math.abs(g(kx + 1, kz) - g(kx - 1, kz)), Math.abs(g(kx, kz + 1) - g(kx, kz - 1)));
      couleurSol(carte, fx, fz, pente, haut[k], tmp);
      col[k * 3] = tmp.r;
      col[k * 3 + 1] = tmp.g;
      col[k * 3 + 2] = tmp.b;
    }
  }
  const indices = new Uint32Array((COTE - 1) * (COTE - 1) * 6);
  let q = 0;
  for (let kz = 0; kz < COTE - 1; kz++) {
    for (let kx = 0; kx < COTE - 1; kx++) {
      const a = kz * COTE + kx;
      const b = a + 1;
      const c = a + COTE;
      const d = c + 1;
      // diagonale alternée pour éviter un grain directionnel
      if ((kx + kz) % 2 === 0) {
        indices[q++] = a; indices[q++] = c; indices[q++] = b;
        indices[q++] = b; indices[q++] = c; indices[q++] = d;
      } else {
        indices[q++] = a; indices[q++] = c; indices[q++] = d;
        indices[q++] = a; indices[q++] = d; indices[q++] = b;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  // --- texture d'état : R humidité, G sable, B débit, A libre ---
  const donnees = new Uint8Array(N * N * 4);
  const texEtat = new THREE.DataTexture(donnees, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  texEtat.magFilter = THREE.LinearFilter;
  texEtat.minFilter = THREE.LinearFilter;
  texEtat.wrapS = texEtat.wrapT = THREE.ClampToEdgeWrapping;
  texEtat.colorSpace = THREE.NoColorSpace;
  texEtat.needsUpdate = true;

  const donneesSur = new Uint8Array(N * N * 4);
  const texSur = new THREE.DataTexture(donneesSur, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  texSur.magFilter = THREE.NearestFilter;
  texSur.minFilter = THREE.NearestFilter;
  texSur.colorSpace = THREE.NoColorSpace;
  texSur.needsUpdate = true;

  const uniformes = {
    uEtat: { value: texEtat },
    uSur: { value: texSur },
    uSurForce: { value: 0 },
    uTemps: { value: 0 },
  };

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniformes);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCarte;\nvarying float vHaut;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCarte = (position.xz + vec2(22.0)) / 44.0;\nvHaut = position.y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vCarte;
        varying float vHaut;
        uniform sampler2D uEtat;
        uniform sampler2D uSur;
        uniform float uSurForce;
        float hachT(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float bruitT(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hachT(i), hachT(i + vec2(1.0, 0.0)), f.x), mix(hachT(i + vec2(0.0, 1.0)), hachT(i + vec2(1.0, 1.0)), f.x), f.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec4 etat = texture2D(uEtat, vCarte);
          vec2 pm = vCarte * 44.0;
          float n1 = bruitT(pm * 2.3);
          float n2 = bruitT(pm * 9.0);
          float hum = etat.r + (n1 - 0.5) * 0.16;
          // terre mouillée puis tapis vert
          vec3 mouille = diffuseColor.rgb * vec3(0.62, 0.55, 0.50);
          diffuseColor.rgb = mix(diffuseColor.rgb, mouille, smoothstep(0.10, 0.42, hum));
          vec3 herbe = mix(vec3(0.33, 0.47, 0.16), vec3(0.50, 0.60, 0.22), n2);
          herbe = mix(herbe, vec3(0.24, 0.40, 0.15), smoothstep(0.75, 1.0, hum) * 0.6);
          float vert = smoothstep(0.38, 0.62, hum) * (0.72 + 0.28 * n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, herbe, vert * 0.88);
          // sable fraîchement déposé : clair, en rides
          float rides = 0.5 + 0.5 * sin(pm.x * 5.0 + pm.y * 9.0 + n1 * 6.0);
          vec3 depot = mix(vec3(0.94, 0.82, 0.62), vec3(0.88, 0.73, 0.52), rides);
          diffuseColor.rgb = mix(diffuseColor.rgb, depot, smoothstep(0.06, 0.55, etat.g + (n2 - 0.5) * 0.1) * 0.93);
          // surcouche d'information
          vec4 sur = texture2D(uSur, vCarte);
          diffuseColor.rgb = mix(diffuseColor.rgb, sur.rgb, sur.a * uSurForce);
        }`,
      );
  };
  const dessus = new THREE.Mesh(geo, mat);
  dessus.receiveShadow = true;
  dessus.castShadow = true;
  dessus.name = 'terrain';
  groupe.add(dessus);

  // --- tranche du bloc (strates) ---
  const pT: number[] = [];
  const cT: number[] = [];
  const iT: number[] = [];
  const bas = -SOCLE;
  const ajouterFace = (fixe: 'x' | 'z', valeur: number, sens: number) => {
    // une bande verticale subdivisée par segment de bord
    const lignes = 7;
    const base = pT.length / 3;
    for (let k = 0; k < COTE; k++) {
      const t = coordGrille(k);
      const fx = fixe === 'x' ? valeur : t;
      const fz = fixe === 'z' ? valeur : t;
      const kx = fixe === 'x' ? (valeur === 0 ? 0 : COTE - 1) : k;
      const kz = fixe === 'z' ? (valeur === 0 ? 0 : COTE - 1) : k;
      const h = haut[kz * COTE + kx];
      for (let l = 0; l <= lignes; l++) {
        const y = h + (bas - h) * (l / lignes);
        pT.push(fx - DEMI, y, fz - DEMI);
        couleurStrate(y, t + (fixe === 'x' ? 100 : 0) + valeur, tmp);
        // le haut de la tranche reprend la teinte du sable
        if (l === 0) tmp.lerp(COUL.sable2, 0.5);
        cT.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let k = 0; k < COTE - 1; k++) {
      for (let l = 0; l < lignes; l++) {
        const a = base + k * (lignes + 1) + l;
        const b = a + 1;
        const c = a + (lignes + 1);
        const d = c + 1;
        if (sens > 0) iT.push(a, b, c, c, b, d);
        else iT.push(a, c, b, b, c, d);
      }
    }
  };
  ajouterFace('z', N, 1); // face sud (vers +z)
  ajouterFace('z', 0, -1);
  ajouterFace('x', N, -1);
  ajouterFace('x', 0, 1);
  const geoT = new THREE.BufferGeometry();
  geoT.setAttribute('position', new THREE.Float32BufferAttribute(pT, 3));
  geoT.setAttribute('color', new THREE.Float32BufferAttribute(cT, 3));
  geoT.setIndex(iT);
  geoT.computeVertexNormals();
  const tranche = new THREE.Mesh(geoT, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  tranche.receiveShadow = true;
  tranche.castShadow = true;
  groupe.add(tranche);

  // --- socle de bois sombre ---
  const socle = new THREE.Mesh(
    new THREE.BoxGeometry(N + 1.6, 0.7, N + 1.6),
    new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.55 }),
  );
  socle.position.y = bas - 0.35;
  socle.receiveShadow = true;
  socle.castShadow = true;
  groupe.add(socle);
  const liseret = new THREE.Mesh(
    new THREE.BoxGeometry(N + 1.0, 0.08, N + 1.0),
    new THREE.MeshStandardMaterial({ color: 0xc8823a, roughness: 0.35, metalness: 0.6 }),
  );
  liseret.position.y = bas + 0.02;
  groupe.add(liseret);

  // --- galerie de la foggara, visible en coupe sur la tranche la plus proche de la source ---
  groupe.add(creerFoggara(carte));

  let surTeinteBasse = new THREE.Color(0x2e8b57);
  let surTeinteHaute = new THREE.Color(0xc0392b);

  return {
    groupe,
    texEtat,
    uniformes,
    majEtat(s, c) {
      for (let i = 0; i < N * N; i++) {
        const k = i * 4;
        donnees[k] = Math.round(Math.min(1, s.humidite[i]) * 255);
        donnees[k + 1] = Math.round(Math.min(1, s.sable[i]) * 255);
        donnees[k + 2] = Math.round(Math.min(1, c.debit[i] / 80) * 255);
        donnees[k + 3] = 255;
      }
      texEtat.needsUpdate = true;
    },
    surcouche(valeurs, teinteBasse, teinteHaute) {
      if (!valeurs) {
        uniformes.uSurForce.value = 0;
        return;
      }
      if (teinteBasse !== undefined) surTeinteBasse = new THREE.Color(teinteBasse);
      if (teinteHaute !== undefined) surTeinteHaute = new THREE.Color(teinteHaute);
      const t = new THREE.Color();
      for (let i = 0; i < N * N; i++) {
        const v = valeurs[i];
        const k = i * 4;
        if (v < 0) {
          donneesSur[k + 3] = 0;
          continue;
        }
        t.copy(surTeinteBasse).lerp(surTeinteHaute, v);
        donneesSur[k] = Math.round(t.r * 255);
        donneesSur[k + 1] = Math.round(t.g * 255);
        donneesSur[k + 2] = Math.round(t.b * 255);
        donneesSur[k + 3] = 150;
      }
      texSur.needsUpdate = true;
      uniformes.uSurForce.value = 1;
    },
    liberer() {
      geo.dispose();
      geoT.dispose();
      mat.dispose();
      texEtat.dispose();
      texSur.dispose();
    },
  };
}

/** Galerie souterraine et puits d'aération dessinés sur la tranche, du bord jusqu'à l'aplomb de la source. */
function creerFoggara(carte: Carte): THREE.Group {
  const g = new THREE.Group();
  const sx = carte.sourceCase % N;
  const sz = Math.floor(carte.sourceCase / N);
  // tranche la plus proche de la source
  const dist = [sz, N - 1 - sx, N - 1 - sz, sx]; // nord, est, sud, ouest
  let face = 0;
  for (let k = 1; k < 4; k++) if (dist[k] < dist[face]) face = k;
  const sombre = new THREE.MeshStandardMaterial({ color: 0x2a1c18, roughness: 1 });
  const eau = new THREE.MeshStandardMaterial({ color: 0x2fb5b0, emissive: 0x1a7f7c, emissiveIntensity: 0.6, roughness: 0.3 });
  const yGalerie = carte.elev[carte.sourceCase] * 0.45 - 0.95;
  const debord = 0.03;
  // axe le long de la tranche
  const le = (t: number, y: number, ep: number): THREE.Vector3 => {
    if (face === 0) return new THREE.Vector3(t - DEMI, y, -DEMI - ep);
    if (face === 2) return new THREE.Vector3(t - DEMI, y, DEMI + ep);
    if (face === 1) return new THREE.Vector3(DEMI + ep, y, t - DEMI);
    return new THREE.Vector3(-DEMI - ep, y, t - DEMI);
  };
  const long = face === 0 || face === 2 ? sx : sz;
  const debut = Math.max(1.5, long - 15);
  const fin = Math.min(N - 1.5, long + 1.5);
  const boite = (t0: number, t1: number, y0: number, y1: number, m: THREE.Material, ep = debord) => {
    const a = le(t0, y0, ep);
    const b = le(t1, y1, ep);
    const horizontal = face === 0 || face === 2;
    const geo = new THREE.BoxGeometry(
      horizontal ? Math.abs(t1 - t0) : 0.06,
      Math.abs(y1 - y0),
      horizontal ? 0.06 : Math.abs(t1 - t0),
    );
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    g.add(mesh);
  };
  // galerie légèrement en pente
  const segments = 12;
  for (let k = 0; k < segments; k++) {
    const t0 = debut + ((fin - debut) * k) / segments;
    const t1 = debut + ((fin - debut) * (k + 1)) / segments;
    const y = yGalerie - 0.35 * (1 - k / segments);
    boite(t0, t1 + 0.02, y, y + 0.34, sombre);
    boite(t0, t1 + 0.02, y + 0.02, y + 0.09, eau, debord + 0.02);
  }
  // puits d'aération jusqu'à la surface
  for (let k = 0; k < 5; k++) {
    const t = debut + 1 + ((fin - debut - 2) * k) / 4;
    const fx = face === 0 || face === 2 ? t : face === 1 ? N - 0.01 : 0.01;
    const fz = face === 0 || face === 2 ? (face === 0 ? 0.01 : N - 0.01) : t;
    const ySol = hauteurTerrain(carte, fx, fz);
    const yBas = yGalerie - 0.35 * (1 - k / 4) + 0.3;
    boite(t - 0.11, t + 0.11, yBas, ySol, sombre);
  }
  return g;
}
