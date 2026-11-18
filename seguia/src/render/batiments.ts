/**
 * Tout ce qui est posé sur le plateau : bâtiments (modèles GLB), parcelles cultivées,
 * palmiers, brise-vent, végétation spontanée, halos de lumière.
 * L'affichage est entièrement dérivé de l'état de la simulation.
 */
import * as THREE from 'three';
import { hacher } from '../sim/rng';
import { B, N, Sol, type Batiment, type Cache, type GameState } from '../sim';
import { DEMI, hauteurEmprise, hauteurTerrain } from './monde';
import type { Modeles } from './modeles';

interface Visu {
  kind: string;
  obj: THREE.Object3D;
  eau: THREE.Object3D | null;
  eauY: number;
  anime: THREE.Object3D | null;
  echafaud: THREE.Object3D | null;
  sol: THREE.Mesh | null;
  chantierVu: number;
}

const MAX_PALMIERS = 400;
const MAX_CULTURES = 1400;
const MAX_TOUFFES = 2600;
const MAX_CLOTURES = 700;
const MAX_HALOS = 160;
const MAX_ROSEAUX = 500;
const MAX_BUISSONS = 400;
const MAX_ROCHERS = 260;
const MAX_TENTES = 8;

const blanc = new THREE.Color(1, 1, 1);
const fane = new THREE.Color(0.86, 0.74, 0.36);
const mort = new THREE.Color(0.52, 0.42, 0.28);
const solSec = new THREE.Color(0xb98e66);
const solMouille = new THREE.Color(0x6e4b33);

export interface Batiments {
  groupe: THREE.Group;
  sync(s: GameState, c: Cache, dt: number, temps: number, nuit: number, vent: number): void;
  /** recalcule la végétation spontanée (à appeler de temps en temps) */
  majVegetation(s: GameState, c: Cache): void;
  objetDe(id: number): THREE.Object3D | undefined;
  /** décor fixe de la carte (rochers, bornes de la piste) : à appeler à l'installation d'une partie */
  installerDecor(s: GameState): void;
  vider(): void;
  /** nombre d'objets affichés, pour le diagnostic */
  compte(): { batiments: number; palmiers: number; cultures: number; touffes: number };
}

function nomModele(b: Batiment): string {
  if (b.kind === 'maison') return ['maison_a', 'maison_b', 'maison_c'][b.variante % 3];
  return b.kind;
}

function geoTouffe(): THREE.BufferGeometry {
  // herbe : fines lames arquées, claires à la pointe
  const p: number[] = [];
  const c: number[] = [];
  const idx: number[] = [];
  const bas = new THREE.Color(0x6f9a3a);
  const hautC = new THREE.Color(0xc4d86e);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.4;
    const r = 0.03 + 0.05 * ((k * 37) % 7) / 7;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const lx = Math.cos(a + 1.57) * 0.022;
    const lz = Math.sin(a + 1.57) * 0.022;
    const h = 0.13 + 0.09 * ((k * 53) % 5) / 5;
    const base = p.length / 3;
    p.push(ox - lx, 0, oz - lz, ox + lx, 0, oz + lz, ox * 2.4, h, oz * 2.4);
    c.push(bas.r, bas.g, bas.b, bas.r, bas.g, bas.b, hautC.r, hautC.g, hautC.b);
    idx.push(base, base + 1, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // normales vers le haut : la végétation basse prend la lumière comme le sol
  const n = g.getAttribute('normal');
  for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  return g;
}

function geoPlant(): THREE.BufferGeometry {
  // plant de potager : rosette de feuilles basses et large
  const g = new THREE.IcosahedronGeometry(0.1, 0);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.05, 0);
  const col: number[] = [];
  const pos = g.getAttribute('position');
  const a = new THREE.Color(0x4f8a34);
  const b = new THREE.Color(0xb4d968);
  const t = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    t.copy(a).lerp(b, Math.min(1, Math.max(0, pos.getY(k) / 0.11)));
    col.push(t.r, t.g, t.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function geoSolParcelle(sillons: boolean): THREE.BufferGeometry {
  // jardin : planche de terre avec sillons ; palmeraie : simple bourrelet d'irrigation
  const morceaux: THREE.BufferGeometry[] = [];
  if (sillons) {
    const dalle = new THREE.BoxGeometry(1.84, 0.022, 1.84);
    dalle.translate(0, 0.011, 0);
    morceaux.push(dalle);
  }
  const hb = sillons ? 0.06 : 0.05;
  for (const [x, z, w, d] of [
    [0, -0.93, 1.94, 0.08],
    [0, 0.93, 1.94, 0.08],
    [-0.93, 0, 0.08, 1.86],
    [0.93, 0, 0.08, 1.86],
  ]) {
    const bord = new THREE.BoxGeometry(w, hb, d);
    bord.translate(x, hb / 2, z);
    morceaux.push(bord);
  }
  if (sillons) {
    for (let k = 0; k < 6; k++) {
      const s = new THREE.BoxGeometry(1.7, 0.03, 0.15);
      s.translate(0, 0.035, -0.72 + k * 0.288);
      morceaux.push(s);
    }
  }
  return fusionner(morceaux);
}

function fusionner(liste: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const p: number[] = [];
  const n: number[] = [];
  const idx: number[] = [];
  for (const g of liste) {
    const base = p.length / 3;
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    for (let k = 0; k < gp.count; k++) {
      p.push(gp.getX(k), gp.getY(k), gp.getZ(k));
      n.push(gn.getX(k), gn.getY(k), gn.getZ(k));
    }
    const gi = g.getIndex()!;
    for (let k = 0; k < gi.count; k++) idx.push(base + gi.getX(k));
    g.dispose();
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  r.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  r.setIndex(idx);
  return r;
}

function textureHalo(): THREE.Texture {
  const t = 64;
  const d = new Uint8Array(t * t * 4);
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const r = Math.hypot(x - t / 2 + 0.5, y - t / 2 + 0.5) / (t / 2);
      const v = Math.max(0, 1 - r);
      const k = (y * t + x) * 4;
      d[k] = 255;
      d[k + 1] = 190;
      d[k + 2] = 110;
      d[k + 3] = Math.round(255 * v * v);
    }
  }
  const tex = new THREE.DataTexture(d, t, t, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function creerBatiments(modeles: Modeles): Batiments {
  const groupe = new THREE.Group();
  const visus = new Map<number, Visu>();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const axeY = new THREE.Vector3(0, 1, 0);
  const coul = new THREE.Color();

  // --- matériau des palmes : balancement au vent ---
  const uniPalmes = { uTemps: modeles.mats.uniformes.uTemps, uVent: modeles.mats.uniformes.uVent };
  const matPalmes = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  matPalmes.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniPalmes);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTemps;\nuniform float uVent;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 org = instanceMatrix[3].xyz;
          #else
            vec3 org = vec3(0.0);
          #endif
          float r = length(position.xz);
          float phase = org.x * 1.7 + org.z * 2.9 + uTemps * (1.1 + 2.4 * uVent);
          float amp = (0.035 + 0.16 * uVent) * r;
          transformed.y += sin(phase + r * 2.5) * amp;
          transformed.x += (sin(phase * 0.7) * 0.5 + 0.9 * uVent) * amp * 0.9;
          transformed.z += cos(phase * 0.9) * amp * 0.5;
        }`,
      );
  };

  // --- palmiers instanciés ---
  interface Lot {
    mesh: THREE.InstancedMesh;
  }
  const lotsPalmier: Lot[] = [];
  let palmierPret = false;
  function preparerPalmiers() {
    if (palmierPret) return;
    palmierPret = true;
    let pieces = modeles.pieces('palmier');
    if (pieces.length === 0) {
      const tronc = new THREE.CylinderGeometry(0.07, 0.11, 2.6, 6);
      tronc.translate(0, 1.3, 0);
      const cT: number[] = [];
      for (let k = 0; k < tronc.getAttribute('position').count; k++) cT.push(0.48, 0.33, 0.21);
      tronc.setAttribute('color', new THREE.Float32BufferAttribute(cT, 3));
      const tete = new THREE.ConeGeometry(1.0, 0.7, 8);
      tete.translate(0, 2.8, 0);
      const cP: number[] = [];
      for (let k = 0; k < tete.getAttribute('position').count; k++) cP.push(0.31, 0.56, 0.23);
      tete.setAttribute('color', new THREE.Float32BufferAttribute(cP, 3));
      pieces = [
        { geometrie: tronc, materiau: 'vc' },
        { geometrie: tete, materiau: 'palmes' },
      ];
    } else {
      const palmes = modeles.pieces('palmier', 'palmes');
      const ensemble = new Set(palmes.map((p) => p.geometrie.uuid));
      void ensemble;
      // on retrouve les pièces du nœud « palmes » pour leur donner le matériau animé
      const tronc = modeles.pieces('palmier', 'tronc');
      if (palmes.length && tronc.length) {
        pieces = [...tronc.map((p) => ({ ...p })), ...palmes.map((p) => ({ geometrie: p.geometrie, materiau: 'palmes' }))];
      }
    }
    for (const p of pieces) {
      const mat = p.materiau === 'palmes' ? matPalmes : modeles.materiau(p.materiau);
      const mesh = new THREE.InstancedMesh(p.geometrie, mat, MAX_PALMIERS);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      groupe.add(mesh);
      lotsPalmier.push({ mesh });
    }
  }

  // --- cultures, touffes, clôtures, halos ---
  const cultures = new THREE.InstancedMesh(geoPlant(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), MAX_CULTURES);
  cultures.castShadow = true;
  cultures.receiveShadow = true;
  cultures.count = 0;
  cultures.frustumCulled = false;
  groupe.add(cultures);

  const touffes = new THREE.InstancedMesh(
    geoTouffe(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    MAX_TOUFFES,
  );
  touffes.count = 0;
  touffes.receiveShadow = true;
  touffes.frustumCulled = false;
  groupe.add(touffes);

  const lotsCloture: THREE.InstancedMesh[] = [];
  const lotsHaie: THREE.InstancedMesh[] = [];
  let cloturesPretes = false;
  function preparerClotures() {
    if (cloturesPretes) return;
    cloturesPretes = true;
    const faire = (nom: string, repli: number, hauteur: number, cible: THREE.InstancedMesh[]) => {
      let pieces = modeles.pieces(nom);
      if (pieces.length === 0) {
        const g = new THREE.BoxGeometry(1.0, hauteur, 0.12);
        g.translate(0, hauteur / 2, 0);
        const cc = new THREE.Color(repli);
        const arr: number[] = [];
        for (let k = 0; k < g.getAttribute('position').count; k++) arr.push(cc.r, cc.g, cc.b);
        g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
        pieces = [{ geometrie: g, materiau: 'vc' }];
      }
      for (const p of pieces) {
        const mesh = new THREE.InstancedMesh(p.geometrie, modeles.materiau(p.materiau), MAX_CLOTURES);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.frustumCulled = false;
        groupe.add(mesh);
        cible.push(mesh);
      }
    };
    faire('brise_vent', 0xb9975a, 0.55, lotsCloture);
    faire('haie', 0x5c8a4a, 0.6, lotsHaie);
  }

  // --- petits éléments de décor instanciés à partir des modèles ---
  const lots = new Map<string, THREE.InstancedMesh[]>();
  function lotDe(nom: string, max: number, ombre = true): THREE.InstancedMesh[] {
    let l = lots.get(nom);
    if (l) return l;
    l = [];
    for (const p of modeles.pieces(nom)) {
      const mesh = new THREE.InstancedMesh(p.geometrie, modeles.materiau(p.materiau), max);
      mesh.count = 0;
      mesh.castShadow = ombre;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      groupe.add(mesh);
      l.push(mesh);
    }
    lots.set(nom, l);
    return l;
  }
  function poserLot(l: THREE.InstancedMesh[], n: number, x: number, y: number, z: number, angle: number, echelle: number) {
    v3.set(x, y, z);
    q.setFromAxisAngle(axeY, angle);
    sc.set(echelle, echelle, echelle);
    m4.compose(v3, q, sc);
    for (const mesh of l) mesh.setMatrixAt(n, m4);
  }
  function finirLot(l: THREE.InstancedMesh[], n: number) {
    for (const mesh of l) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function installerDecor(s: GameState) {
    const carte = s.carte;
    const noms = ['rocher_a', 'rocher_b', 'rocher_c'];
    const compte = [0, 0, 0];
    const poser = (k: number, fx: number, fz: number, angle: number, echelle: number) => {
      const l = lotDe(noms[k], MAX_ROCHERS);
      if (!l.length || compte[k] >= MAX_ROCHERS) return;
      poserLot(l, compte[k]++, fx - DEMI, hauteurTerrain(carte, fx, fz) - 0.02, fz - DEMI, angle, echelle);
    };
    const surPiste = new Set(carte.piste);
    for (let i = 0; i < N * N; i++) {
      const tx = i % N;
      const tz = Math.floor(i / N);
      const h = hacher(tx, tz, 61);
      const sol = carte.sol[i];
      if (surPiste.has(i)) continue;
      // cailloux épars sur le reg, pierres au pied des rochers
      if ((sol === Sol.Reg && h < 0.11) || (sol === Sol.Sable && h < 0.012)) {
        poser(Math.floor(h * 997) % 3, tx + 0.2 + 0.6 * hacher(tx, tz, 62), tz + 0.2 + 0.6 * hacher(tx, tz, 63), h * 60, 0.25 + 0.5 * hacher(tx, tz, 64));
      }
    }
    // bornes de pierre de part et d'autre de la piste, une case sur trois
    carte.piste.forEach((i, k) => {
      if (k % 3 !== 1 || k + 1 >= carte.piste.length) return;
      const tx = i % N;
      const tz = Math.floor(i / N);
      const j = carte.piste[k + 1];
      const dx = (j % N) - tx;
      const dz = Math.floor(j / N) - tz;
      for (const cote of [-1, 1]) {
        const fx = tx + 0.5 + -dz * cote * 0.46;
        const fz = tz + 0.5 + dx * cote * 0.46;
        poser(2, fx, fz, k * 1.7, 0.2 + 0.12 * hacher(k, cote, 65));
      }
    });
    noms.forEach((nom, k) => finirLot(lotDe(nom, MAX_ROCHERS), compte[k]));
  }

  const geoHalo = new THREE.PlaneGeometry(1, 1);
  geoHalo.rotateX(-Math.PI / 2);
  const matHalo = new THREE.MeshBasicMaterial({
    map: textureHalo(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    fog: false,
  });
  const halos = new THREE.InstancedMesh(geoHalo, matHalo, MAX_HALOS);
  halos.count = 0;
  halos.frustumCulled = false;
  halos.renderOrder = 5;
  groupe.add(halos);

  const geoJardin = geoSolParcelle(true);
  const geoPalmeraie = geoSolParcelle(false);
  const geoPoteau = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
  geoPoteau.translate(0, 0.5, 0);
  const matPoteau = new THREE.MeshStandardMaterial({ color: 0x7a5536, roughness: 0.9 });

  let signatureClotures = '';
  let signatureHalos = '';

  function creerVisu(s: GameState, b: Batiment): Visu {
    const y = hauteurEmprise(s.carte, b.x, b.z);
    const cxm = b.x + b.w / 2 - DEMI;
    const czm = b.z + b.d / 2 - DEMI;
    let obj: THREE.Object3D;
    let sol: THREE.Mesh | null = null;
    if (b.kind === 'jardin' || b.kind === 'palmeraie') {
      obj = new THREE.Group();
      sol = new THREE.Mesh(
        b.kind === 'jardin' ? geoJardin : geoPalmeraie,
        new THREE.MeshStandardMaterial({ color: solSec.clone(), roughness: 1 }),
      );
      sol.receiveShadow = true;
      sol.castShadow = true;
      obj.add(sol);
    } else {
      obj = modeles.instancier(nomModele(b), b.w, b.d);
      if (!modeles.a(nomModele(b)) && b.kind === 'maison' && modeles.a('maison_a')) obj = modeles.instancier('maison_a');
      obj.rotation.y = (-b.rot * Math.PI) / 2;
    }
    obj.position.set(cxm, y, czm);
    obj.userData.batiment = b.id;
    groupe.add(obj);
    const eau = obj.getObjectByName('eau') ?? null;
    const anime = obj.getObjectByName('bras') ?? obj.getObjectByName('roue') ?? null;
    // échafaudage pendant le chantier
    let echafaud: THREE.Object3D | null = null;
    if (b.chantier < 1 && sol === null) {
      echafaud = new THREE.Group();
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const p = new THREE.Mesh(geoPoteau, matPoteau);
        p.position.set(sx * (b.w / 2 - 0.08), 0, sz * (b.d / 2 - 0.08));
        p.scale.y = 1.25;
        p.castShadow = true;
        echafaud.add(p);
      }
      echafaud.position.set(cxm, y, czm);
      groupe.add(echafaud);
    }
    return { kind: b.kind, obj, eau, eauY: eau ? eau.position.y : 0, anime, echafaud, sol, chantierVu: -1 };
  }

  function retirer(v: Visu) {
    groupe.remove(v.obj);
    if (v.echafaud) groupe.remove(v.echafaud);
    if (v.sol) (v.sol.material as THREE.Material).dispose();
  }

  function sync(s: GameState, c: Cache, dt: number, temps: number, nuit: number, _vent: number) {
    preparerPalmiers();
    preparerClotures();
    // --- bâtiments : retraits et ajouts ---
    const presents = new Set<number>();
    for (const b of s.batiments) presents.add(b.id);
    for (const [id, v] of visus) {
      if (!presents.has(id)) {
        retirer(v);
        visus.delete(id);
      }
    }
    let nPalm = 0;
    let nCult = 0;
    let nHalo = 0;
    let sigHalos = '';
    for (const b of s.batiments) {
      let v = visus.get(b.id);
      if (!v) {
        v = creerVisu(s, b);
        visus.set(b.id, v);
      }
      const y = v.obj.position.y;
      // chantier : le bâtiment sort de terre
      if (v.sol === null && v.chantierVu !== b.chantier) {
        v.chantierVu = b.chantier;
        const k = b.chantier >= 1 ? 1 : 0.1 + 0.9 * b.chantier;
        v.obj.scale.set(1, k, 1);
        if (v.echafaud) {
          if (b.chantier >= 1) {
            groupe.remove(v.echafaud);
            v.echafaud = null;
          }
        }
      }
      // eau des bassins, citernes, fontaines
      if (v.eau) {
        if (b.kind === 'bassin' || b.kind === 'citerne') {
          const r = b.stock / (b.kind === 'bassin' ? B.bassinCapacite : B.citerneCapacite);
          v.eau.visible = r > 0.015 && b.chantier >= 1;
          v.eau.position.y = v.eauY - (1 - Math.min(1, r)) * 0.11;
        } else if (b.kind === 'fontaine' || b.kind === 'hammam') {
          v.eau.visible = b.chantier >= 1 && b.eauRatio >= 0.5;
        }
      }
      if (v.anime && b.chantier >= 1 && !b.pause && b.personnel > 0) {
        if (b.kind === 'puits') v.anime.rotation.x = Math.sin(temps * 1.6 + b.id) * 0.36;
        else if (b.kind === 'noria') v.anime.rotation.z -= dt * (0.6 + 1.2 * b.eauRatio);
      }
      const cxm = v.obj.position.x;
      const czm = v.obj.position.z;
      if (b.kind === 'jardin' && v.sol) {
        const mouille = b.chantier >= 1 ? Math.min(1, b.pause ? 0 : b.eauRatio) : 0;
        (v.sol.material as THREE.MeshStandardMaterial).color.copy(solSec).lerp(solMouille, 0.25 + 0.75 * mouille);
        v.sol.scale.y = b.chantier >= 1 ? 1 : 0.3 + 0.7 * b.chantier;
        if (b.chantier >= 1 && !b.pause) {
          const taille = b.sante <= 0 ? 0.35 : 0.3 + 0.95 * b.croissance;
          if (b.sante <= 0) coul.copy(mort);
          else coul.copy(fane).lerp(blanc, Math.min(1, b.sante * 1.4));
          for (let rz = 0; rz < 6; rz++) {
            for (let rx = 0; rx < 6; rx++) {
              if (nCult >= MAX_CULTURES) break;
              const h = hacher(b.id * 7 + rx, rz, 11);
              if (b.sante <= 0 && h > 0.45) continue;
              v3.set(cxm - 0.72 + rx * 0.288 + (h - 0.5) * 0.07, y + 0.045, czm - 0.72 + rz * 0.288);
              q.setFromAxisAngle(axeY, h * 6.28);
              const t = taille * (0.75 + 0.5 * h);
              sc.set(t, t * (0.8 + 0.5 * hacher(rx, rz, b.id)), t);
              m4.compose(v3, q, sc);
              cultures.setMatrixAt(nCult, m4);
              cultures.setColorAt(nCult, coul);
              nCult++;
            }
          }
        }
      } else if (b.kind === 'palmeraie' && v.sol) {
        const mouille = b.chantier >= 1 ? Math.min(1, b.pause ? 0 : b.eauRatio) : 0;
        (v.sol.material as THREE.MeshStandardMaterial).color.copy(solSec).lerp(solMouille, 0.2 + 0.6 * mouille);
        if (b.chantier >= 1) {
          if (b.sante <= 0) coul.copy(mort);
          else coul.copy(fane).lerp(blanc, Math.min(1, b.sante * 1.5));
          for (let k = 0; k < 5; k++) {
            if (nPalm >= MAX_PALMIERS) break;
            const h1 = hacher(b.id, k, 21);
            const h2 = hacher(b.id, k, 22);
            const h3 = hacher(b.id, k, 23);
            const px = k === 4 ? 0 : k % 2 ? 0.48 : -0.48;
            const pz = k === 4 ? 0 : k < 2 ? -0.48 : 0.48;
            v3.set(cxm + px + (h1 - 0.5) * 0.3, y + 0.03, czm + pz + (h2 - 0.5) * 0.3);
            q.setFromAxisAngle(axeY, h3 * 6.28);
            const t = (0.2 + 0.8 * b.croissance) * (0.82 + 0.36 * h1) * (b.sante <= 0 ? 0.8 : 1);
            sc.set(t, t * (0.9 + 0.25 * h2), t);
            m4.compose(v3, q, sc);
            for (const lot of lotsPalmier) {
              lot.mesh.setMatrixAt(nPalm, m4);
              lot.mesh.setColorAt(nPalm, coul);
            }
            nPalm++;
          }
        }
      } else if (b.chantier >= 1 && nHalo < MAX_HALOS) {
        // halo de lumière au sol, la nuit
        const taille = b.kind === 'caravanserail' ? 6.5 : b.kind === 'fanal' ? 9 : b.kind === 'hammam' ? 5 : b.kind === 'maison' ? 3.6 : 0;
        if (taille > 0 && (b.kind !== 'maison' || b.habitants > 0)) {
          v3.set(cxm, y + 0.06, czm);
          q.identity();
          sc.set(taille, 1, taille);
          m4.compose(v3, q, sc);
          halos.setMatrixAt(nHalo, m4);
          nHalo++;
          sigHalos += b.id + ',';
        }
      }
    }
    for (const lot of lotsPalmier) {
      lot.mesh.count = nPalm;
      lot.mesh.instanceMatrix.needsUpdate = true;
      if (lot.mesh.instanceColor) lot.mesh.instanceColor.needsUpdate = true;
    }
    cultures.count = nCult;
    cultures.instanceMatrix.needsUpdate = true;
    if (cultures.instanceColor) cultures.instanceColor.needsUpdate = true;
    halos.count = nHalo;
    if (sigHalos !== signatureHalos) {
      signatureHalos = sigHalos;
      halos.instanceMatrix.needsUpdate = true;
    }
    matHalo.opacity = 0.55 * nuit;
    halos.visible = nuit > 0.02;
    modeles.mats.lumiere.emissiveIntensity = 0.15 + 2.6 * nuit;

    // --- clôtures : seulement si le tracé a changé ---
    let sig = '';
    for (let i = 0; i < s.cloture.length; i++) if (s.cloture[i]) sig += i + ':' + s.cloture[i] + ':' + Math.round(s.clotureEtat[i] * 4) + ';';
    if (sig !== signatureClotures) {
      signatureClotures = sig;
      let nC = 0;
      let nH = 0;
      const vent = s.carte.ventDominant;
      for (let i = 0; i < s.cloture.length; i++) {
        const type = s.cloture[i];
        if (!type) continue;
        const tx = i % N;
        const tz = Math.floor(i / N);
        const a = (dx: number, dz: number) => {
          const x = tx + dx;
          const z = tz + dz;
          return x >= 0 && z >= 0 && x < N && z < N && s.cloture[z * N + x] !== 0;
        };
        const ew = a(1, 0) || a(-1, 0);
        const ns = a(0, 1) || a(0, -1);
        const leLongDeZ = ns && !ew ? true : ew && !ns ? false : vent === 1 || vent === 3;
        v3.set(tx + 0.5 - DEMI, hauteurTerrain(s.carte, tx + 0.5, tz + 0.5), tz + 0.5 - DEMI);
        q.setFromAxisAngle(axeY, leLongDeZ ? Math.PI / 2 : 0);
        sc.set(1, 0.55 + 0.45 * s.clotureEtat[i], 1);
        m4.compose(v3, q, sc);
        if (type === 1 && nC < MAX_CLOTURES) {
          for (const l of lotsCloture) l.setMatrixAt(nC, m4);
          nC++;
        } else if (type === 2 && nH < MAX_CLOTURES) {
          for (const l of lotsHaie) l.setMatrixAt(nH, m4);
          nH++;
        }
      }
      for (const l of lotsCloture) {
        l.count = nC;
        l.instanceMatrix.needsUpdate = true;
      }
      for (const l of lotsHaie) {
        l.count = nH;
        l.instanceMatrix.needsUpdate = true;
      }
    }
    void c;
  }

  function majVegetation(s: GameState, c: Cache) {
    let n = 0;
    const { sol } = s.carte;
    for (let i = 0; i < N * N && n < MAX_TOUFFES; i++) {
      const h = s.humidite[i];
      if (h < 0.42 || s.canal[i] || c.occ[i] || s.cloture[i] || s.sable[i] > 0.4) continue;
      if (sol[i] !== Sol.Sable && sol[i] !== Sol.Reg) continue;
      const tx = i % N;
      const tz = Math.floor(i / N);
      const nb = h > 0.8 ? 4 : h > 0.6 ? 3 : 2;
      for (let k = 0; k < nb && n < MAX_TOUFFES; k++) {
        const fx = tx + 0.12 + 0.76 * hacher(i, k, 31);
        const fz = tz + 0.12 + 0.76 * hacher(i, k, 32);
        const r = hacher(i, k, 33);
        v3.set(fx - DEMI, hauteurTerrain(s.carte, fx, fz) + 0.005, fz - DEMI);
        q.setFromAxisAngle(axeY, r * 6.28);
        const t = (0.55 + 1.1 * r) * Math.min(1.25, (h - 0.3) * 2.2);
        sc.set(t, t * (0.8 + 0.8 * hacher(i, k, 34)), t);
        m4.compose(v3, q, sc);
        touffes.setMatrixAt(n, m4);
        n++;
      }
    }
    touffes.count = n;
    touffes.instanceMatrix.needsUpdate = true;

    // roseaux au bord des séguias en eau, buissons sur les terres bien arrosées
    const roseaux = lotDe('roseaux', MAX_ROSEAUX, false);
    const buissons = lotDe('buisson', MAX_BUISSONS);
    let nr = 0;
    let nb2 = 0;
    for (let i = 0; i < N * N; i++) {
      const tx = i % N;
      const tz = Math.floor(i / N);
      if (s.canal[i] && roseaux.length && nr < MAX_ROSEAUX && c.debit[i] > 2 && s.sable[i] < 0.3 && s.humidite[i] > 0.7) {
        const h = hacher(i, 1, 41);
        if (h < 0.42 && !c.occ[i]) {
          // sur la berge, du côté tiré au hasard
          const cote = h < 0.21 ? -1 : 1;
          const parent = c.parent[i];
          const leLongDeZ = parent >= 0 ? parent % N === tx : true;
          const fx = tx + 0.5 + (leLongDeZ ? cote * 0.33 : (hacher(i, 2, 41) - 0.5) * 0.6);
          const fz = tz + 0.5 + (leLongDeZ ? (hacher(i, 2, 41) - 0.5) * 0.6 : cote * 0.33);
          poserLot(roseaux, nr++, fx - DEMI, hauteurTerrain(s.carte, fx, fz), fz - DEMI, h * 40, 0.7 + 0.7 * hacher(i, 3, 41));
        }
      } else if (!s.canal[i] && !c.occ[i] && !s.cloture[i] && buissons.length && nb2 < MAX_BUISSONS && s.humidite[i] > 0.62 && s.sable[i] < 0.3) {
        const h = hacher(i, 4, 43);
        if (h < 0.16 && (sol[i] === Sol.Sable || sol[i] === Sol.Reg)) {
          const fx = tx + 0.2 + 0.6 * hacher(i, 5, 43);
          const fz = tz + 0.2 + 0.6 * hacher(i, 6, 43);
          poserLot(buissons, nb2++, fx - DEMI, hauteurTerrain(s.carte, fx, fz), fz - DEMI, h * 50, 0.7 + 0.8 * hacher(i, 7, 43));
        }
      }
    }
    finirLot(roseaux, nr);
    finirLot(buissons, nb2);

    // tentes des caravaniers pendant la halte, sur des cases libres près de l'arrêt
    const tentes = lotDe('tente', MAX_TENTES);
    let nt = 0;
    if (tentes.length) {
      for (const car of s.caravanes) {
        if (car.phase !== 'commerce' && car.phase !== 'abreuvage') continue;
        const arret = s.carte.piste[Math.max(0, Math.min(s.carte.piste.length - 1, Math.round(car.pos)))];
        const ax = arret % N;
        const az = Math.floor(arret / N);
        const voulu = Math.min(3, 1 + Math.floor(car.chameaux / 8));
        let poses = 0;
        for (let r = 2; r <= 5 && poses < voulu; r++) {
          for (let k = 0; k < 16 && poses < voulu; k++) {
            const a = (k / 16) * Math.PI * 2 + car.id;
            const tx = Math.round(ax + Math.cos(a) * r);
            const tz = Math.round(az + Math.sin(a) * r);
            if (tx < 0 || tz < 0 || tx >= N - 1 || tz >= N - 1) continue;
            let libre = true;
            for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
              const j = (tz + dz) * N + tx + dx;
              if (c.occ[j] || s.canal[j] || s.cloture[j] || s.carte.sol[j] !== Sol.Sable && s.carte.sol[j] !== Sol.Reg) libre = false;
              if (s.carte.elev[j] !== s.carte.elev[tz * N + tx]) libre = false;
            }
            if (!libre || nt >= MAX_TENTES) continue;
            poserLot(tentes, nt++, tx + 1 - DEMI, s.carte.elev[tz * N + tx] * 0.45, tz + 1 - DEMI, a, 0.8);
            poses++;
          }
        }
      }
    }
    finirLot(tentes, nt);
  }

  return {
    groupe,
    sync,
    majVegetation,
    objetDe: (id) => visus.get(id)?.obj,
    installerDecor,
    vider() {
      for (const v of visus.values()) retirer(v);
      visus.clear();
      signatureClotures = '§';
      signatureHalos = '§';
      for (const lot of lotsPalmier) lot.mesh.count = 0;
      cultures.count = 0;
      touffes.count = 0;
      halos.count = 0;
    },
    compte: () => ({ batiments: visus.size, palmiers: lotsPalmier[0]?.mesh.count ?? 0, cultures: cultures.count, touffes: touffes.count }),
  };
}
