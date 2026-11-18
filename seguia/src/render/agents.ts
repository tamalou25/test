/**
 * La vie du diorama : habitants qui vont au travail, à la fontaine, rentrent le soir ;
 * chameaux des caravanes qui suivent la piste et s'abreuvent au bassin.
 * Purement visuel : rien ici ne modifie la simulation (hasard par Math.random).
 */
import * as THREE from 'three';
import { BATIMENTS, calendrier, DX, DZ, N, population, Sol, tempeteEnCours, type Batiment, type Cache, type GameState } from '../sim';
import { DEMI, hauteurTerrain } from './monde';
import type { Modeles } from './modeles';

const MAX_HABITANTS = 64;
const MAX_CHAMEAUX = 40;

const TEINTES = [0xf2e8d5, 0x2e4a8f, 0xe6a21e, 0xb8402e, 0x2a9d8f, 0xf2e8d5, 0x8a6bb0, 0xd8c7a0].map((h) => new THREE.Color(h));

interface Marcheur {
  x: number;
  z: number;
  chemin: number[];
  etape: number;
  etat: 'marche' | 'occupe' | 'cache';
  minuteur: number;
  maison: number;
  teinte: THREE.Color;
  phase: number;
  angle: number;
  decalX: number;
  decalZ: number;
  vitesse: number;
  /** après le trajet en cours : se cacher (rentrer) */
  rentre: boolean;
}

interface ChameauVisu {
  x: number;
  z: number;
  angle: number;
  phase: number;
  vu: boolean;
  bouge: number;
}

export interface Agents {
  groupe: THREE.Group;
  maj(s: GameState, c: Cache, dt: number, vitesseJeu: number): void;
  vider(): void;
  /** activité près d'un point (pour le son) : 0..1 */
  viePres(x: number, z: number, rayon: number): number;
}

export function creerAgents(modeles: Modeles): Agents {
  const groupe = new THREE.Group();
  const m4 = new THREE.Matrix4();
  const m4b = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const axeY = new THREE.Vector3(0, 1, 0);
  const axeX = new THREE.Vector3(1, 0, 0);
  const blanc = new THREE.Color(1, 1, 1);

  let lotsRobe: THREE.InstancedMesh[] = [];
  let lotsTete: THREE.InstancedMesh[] = [];
  let lotsCorps: THREE.InstancedMesh[] = [];
  interface LotPatte {
    mesh: THREE.InstancedMesh;
    pivot: THREE.Vector3;
    dephasage: number;
  }
  let lotsPatte: LotPatte[] = [];
  let pret = false;

  function instancier(geo: THREE.BufferGeometry, mat: THREE.Material, max: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    groupe.add(mesh);
    return mesh;
  }

  function preparer() {
    if (pret) return;
    pret = true;
    // habitants
    let robe = modeles.pieces('habitant', 'robe');
    let tete = modeles.pieces('habitant', 'tete');
    if (!robe.length) {
      const g = new THREE.ConeGeometry(0.11, 0.38, 7);
      g.translate(0, 0.19, 0);
      const col: number[] = [];
      for (let k = 0; k < g.getAttribute('position').count; k++) col.push(1, 1, 1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      robe = [{ geometrie: g, materiau: 'vc' }];
      const t = new THREE.SphereGeometry(0.065, 7, 5);
      t.translate(0, 0.43, 0);
      const colT: number[] = [];
      for (let k = 0; k < t.getAttribute('position').count; k++) colT.push(0.69, 0.47, 0.31);
      t.setAttribute('color', new THREE.Float32BufferAttribute(colT, 3));
      tete = [{ geometrie: t, materiau: 'vc' }];
    }
    lotsRobe = robe.map((p) => instancier(p.geometrie, modeles.materiau(p.materiau), MAX_HABITANTS + 16));
    lotsTete = tete.map((p) => instancier(p.geometrie, modeles.materiau(p.materiau), MAX_HABITANTS + 16));
    // chameaux
    let corps = [...modeles.pieces('chameau', 'corps'), ...modeles.pieces('chameau', 'charge')];
    if (!corps.length) {
      const g = new THREE.BoxGeometry(0.3, 0.3, 0.8);
      g.translate(0, 0.5, 0);
      const col: number[] = [];
      for (let k = 0; k < g.getAttribute('position').count; k++) col.push(0.79, 0.63, 0.42);
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      corps = [{ geometrie: g, materiau: 'vc' }];
    }
    lotsCorps = corps.map((p) => instancier(p.geometrie, modeles.materiau(p.materiau), MAX_CHAMEAUX));
    const pattes = ['patte_avg', 'patte_ard', 'patte_avd', 'patte_arg'];
    lotsPatte = [];
    pattes.forEach((nom, k) => {
      const pivot = modeles.pivot('chameau', nom);
      for (const p of modeles.pieces('chameau', nom)) {
        lotsPatte.push({
          mesh: instancier(p.geometrie, modeles.materiau(p.materiau), MAX_CHAMEAUX),
          pivot,
          dephasage: k < 2 ? 0 : Math.PI,
        });
      }
    });
  }

  const marcheurs: Marcheur[] = [];
  const chameaux = new Map<number, ChameauVisu[]>();
  let chronoRecensement = 0;

  /* ---------- déplacements sur la grille ---------- */

  function praticable(s: GameState, c: Cache, i: number): boolean {
    const sol = s.carte.sol[i];
    if (sol === Sol.Roche || sol === Sol.Dune) return false;
    if (c.occ[i]) return false;
    if (s.cloture[i]) return false;
    return true;
  }

  const venu = new Int32Array(N * N);
  const cout = new Int32Array(N * N);
  const COUT_CANAL = 7;
  // file à seaux (les coûts d'un pas valent 1 ou COUT_CANAL)
  const seaux: number[][] = Array.from({ length: COUT_CANAL + 1 }, () => []);

  /**
   * Chemin le moins coûteux entre deux cases. Marcher dans une séguia coûte cher : les habitants
   * l'enjambent pour traverser mais ne la suivent pas. Tableau vide si aucun chemin.
   */
  function chemin(s: GameState, c: Cache, depart: number, arrivee: number): number[] {
    if (depart === arrivee) return [arrivee];
    venu.fill(-2);
    cout.fill(1 << 30);
    for (const q of seaux) q.length = 0;
    cout[depart] = 0;
    venu[depart] = -1;
    seaux[0].push(depart);
    let courant = 0;
    let restant = 1;
    while (restant > 0) {
      const seau = seaux[courant % seaux.length];
      if (seau.length === 0) {
        courant++;
        continue;
      }
      const i = seau.pop()!;
      restant--;
      if (cout[i] !== courant) continue; // entrée périmée
      if (i === arrivee) break;
      const x = i % N;
      const z = (i / N) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const nz = z + DZ[k];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (!praticable(s, c, j) && j !== arrivee) continue;
        const nc = courant + (s.canal[j] ? COUT_CANAL : 1);
        if (nc >= cout[j]) continue;
        cout[j] = nc;
        venu[j] = i;
        seaux[nc % seaux.length].push(j);
        restant++;
      }
    }
    if (venu[arrivee] === -2) return [];
    const r: number[] = [];
    let i = arrivee;
    while (i !== -1) {
      r.push(i);
      i = venu[i];
    }
    r.reverse();
    return r;
  }

  /** Une case praticable au contact d'un bâtiment. */
  function abord(s: GameState, c: Cache, b: Batiment): number {
    const candidats: number[] = [];
    for (let dx = -1; dx <= b.w; dx++) {
      for (let dz = -1; dz <= b.d; dz++) {
        const dedansX = dx >= 0 && dx < b.w;
        const dedansZ = dz >= 0 && dz < b.d;
        if (dedansX === dedansZ) continue; // on veut les bords, pas les coins ni l'intérieur
        const x = b.x + dx;
        const z = b.z + dz;
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const i = z * N + x;
        if (praticable(s, c, i)) candidats.push(i);
      }
    }
    // on ne stationne pas dans une séguia s'il y a une autre place
    const auSec = candidats.filter((i) => !s.canal[i]);
    if (auSec.length) return auSec[Math.floor(Math.random() * auSec.length)];
    if (!candidats.length) return -1;
    return candidats[Math.floor(Math.random() * candidats.length)];
  }

  function caseDe(m: Marcheur): number {
    return Math.min(N - 1, Math.max(0, Math.floor(m.z))) * N + Math.min(N - 1, Math.max(0, Math.floor(m.x)));
  }

  function choisirDestination(s: GameState, c: Cache, m: Marcheur, jour: boolean, abri: boolean) {
    const maison = s.batiments.find((b) => b.id === m.maison);
    let cible = -1;
    m.rentre = false;
    if (!jour || abri) {
      if (maison) cible = abord(s, c, maison);
      m.rentre = true;
    } else {
      // corvée : aller vers une séguia ensablée
      if (s.corvee || Math.random() < 0.15) {
        const ensables: number[] = [];
        for (let k = 0; k < c.nbOrdre; k++) if (s.sable[c.ordre[k]] > 0.15) ensables.push(c.ordre[k]);
        if (ensables.length) cible = ensables[Math.floor(Math.random() * ensables.length)];
      }
      if (cible < 0) {
        const lieux = s.batiments.filter(
          (b) =>
            b.chantier < 1 ||
            (BATIMENTS[b.kind].ouvriers > 0 && b.personnel > 0 && !b.pause) ||
            b.kind === 'fontaine' ||
            b.kind === 'bassin' ||
            b.kind === 'source',
        );
        if (lieux.length && Math.random() < 0.85) {
          // les lieux de travail attirent plus que les lieux de passage
          const poids = lieux.map((b) => (b.chantier < 1 ? 3 : BATIMENTS[b.kind].ouvriers > 0 ? 2 : 1));
          let tirage = Math.random() * poids.reduce((a, b) => a + b, 0);
          let choisi = lieux[0];
          for (let k = 0; k < lieux.length; k++) {
            tirage -= poids[k];
            if (tirage <= 0) {
              choisi = lieux[k];
              break;
            }
          }
          cible = abord(s, c, choisi);
        } else if (maison) {
          cible = abord(s, c, maison);
        }
      }
    }
    if (cible < 0) {
      m.etat = 'occupe';
      m.minuteur = 2 + Math.random() * 3;
      return;
    }
    const ch = chemin(s, c, caseDe(m), cible);
    if (ch.length === 0) {
      m.etat = 'occupe';
      m.minuteur = 2 + Math.random() * 4;
      return;
    }
    m.chemin = ch;
    m.etape = 1;
    m.etat = 'marche';
  }

  function recenser(s: GameState, c: Cache) {
    const pop = Math.min(MAX_HABITANTS, population(s));
    // départs : maisons disparues ou population en baisse
    for (let k = marcheurs.length - 1; k >= 0; k--) {
      const m = marcheurs[k];
      if (!s.batiments.some((b) => b.id === m.maison) || marcheurs.length > pop) marcheurs.splice(k, 1);
    }
    // arrivées : un marcheur par habitant, rattaché à sa maison
    if (marcheurs.length < pop) {
      const parMaison = new Map<number, number>();
      for (const m of marcheurs) parMaison.set(m.maison, (parMaison.get(m.maison) ?? 0) + 1);
      for (const b of s.batiments) {
        if (b.kind !== 'maison') continue;
        let deja = parMaison.get(b.id) ?? 0;
        while (deja < b.habitants && marcheurs.length < pop) {
          const dep = abord(s, c, b);
          const i = dep >= 0 ? dep : b.z * N + b.x;
          marcheurs.push({
            x: (i % N) + 0.5,
            z: Math.floor(i / N) + 0.5,
            chemin: [],
            etape: 0,
            etat: 'occupe',
            minuteur: Math.random() * 3,
            maison: b.id,
            teinte: TEINTES[Math.floor(Math.random() * TEINTES.length)],
            phase: Math.random() * 6,
            angle: Math.random() * 6,
            decalX: (Math.random() - 0.5) * 0.44,
            decalZ: (Math.random() - 0.5) * 0.44,
            vitesse: 0.75 + Math.random() * 0.4,
            rentre: false,
          });
          deja++;
        }
      }
    }
  }

  function poserHabitant(n: number, x: number, y: number, z: number, angle: number, teinte: THREE.Color, penche: number) {
    v3.set(x - DEMI, y, z - DEMI);
    q.setFromAxisAngle(axeY, angle);
    if (penche) {
      const q2 = new THREE.Quaternion().setFromAxisAngle(axeX, penche);
      q.multiply(q2);
    }
    sc.set(1, 1, 1);
    m4.compose(v3, q, sc);
    for (const l of lotsRobe) {
      l.setMatrixAt(n, m4);
      l.setColorAt(n, teinte);
    }
    for (const l of lotsTete) {
      l.setMatrixAt(n, m4);
      l.setColorAt(n, blanc);
    }
  }

  /** Point de la piste à l'indice flottant `pos` (coordonnées de case). */
  function pointPiste(s: GameState, pos: number): { x: number; z: number; ax: number; az: number } {
    const p = s.carte.piste;
    const k = Math.min(p.length - 2, Math.max(0, Math.floor(pos)));
    const f = Math.min(1, Math.max(0, pos - k));
    const a = p[k];
    const b = p[k + 1];
    const ax = (a % N) + 0.5;
    const az = Math.floor(a / N) + 0.5;
    const bx = (b % N) + 0.5;
    const bz = Math.floor(b / N) + 0.5;
    return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, ax: bx - ax, az: bz - az };
  }

  /** Emplacements d'abreuvage autour des bassins : au pied des longs côtés. */
  function placesBassin(s: GameState, c: Cache): { x: number; z: number; angle: number }[] {
    const places: { x: number; z: number; angle: number }[] = [];
    for (const b of s.batiments) {
      if (b.kind !== 'bassin' || b.chantier < 1) continue;
      const centreX = b.x + b.w / 2;
      const centreZ = b.z + b.d / 2;
      const ajouter = (x: number, z: number) => {
        const tx = Math.floor(x);
        const tz = Math.floor(z);
        if (tx < 0 || tz < 0 || tx >= N || tz >= N) return;
        if (!praticable(s, c, tz * N + tx) && s.carte.sol[tz * N + tx] !== Sol.Piste) return;
        places.push({ x, z, angle: Math.atan2(centreX - x, centreZ - z) });
      };
      for (let k = 0; k < b.w * 2; k++) {
        ajouter(b.x + 0.25 + k * 0.5, b.z - 0.42);
        ajouter(b.x + 0.25 + k * 0.5, b.z + b.d + 0.42);
      }
      for (let k = 0; k < b.d * 2; k++) {
        ajouter(b.x - 0.42, b.z + 0.25 + k * 0.5);
        ajouter(b.x + b.w + 0.42, b.z + 0.25 + k * 0.5);
      }
    }
    return places;
  }

  function maj(s: GameState, c: Cache, dt: number, vitesseJeu: number) {
    preparer();
    const cal = calendrier(s.pas);
    const jour = cal.lumiere > 0.2;
    const abri = !!tempeteEnCours(s);
    const pasTemps = dt * Math.min(4, Math.max(0, vitesseJeu));
    chronoRecensement -= dt;
    if (chronoRecensement <= 0) {
      chronoRecensement = 0.8;
      recenser(s, c);
    }

    // --- habitants ---
    let n = 0;
    for (const m of marcheurs) {
      if (m.etat === 'cache') {
        m.minuteur -= pasTemps;
        if (m.minuteur <= 0 && jour && !abri) {
          m.etat = 'occupe';
          m.minuteur = Math.random() * 2;
        }
        continue;
      }
      if (m.etat === 'occupe') {
        m.minuteur -= pasTemps;
        if (m.minuteur <= 0) choisirDestination(s, c, m, jour, abri);
      } else if (m.etat === 'marche') {
        const cible = m.chemin[m.etape];
        if (cible === undefined) {
          if (m.rentre) {
            m.etat = 'cache';
            m.minuteur = 4 + Math.random() * 6;
            continue;
          }
          m.etat = 'occupe';
          m.minuteur = 5 + Math.random() * 9;
        } else {
          const cx = (cible % N) + 0.5 + m.decalX;
          const cz = Math.floor(cible / N) + 0.5 + m.decalZ;
          const dx = cx - m.x;
          const dz = cz - m.z;
          const d = Math.hypot(dx, dz);
          const avance = m.vitesse * pasTemps * 0.9;
          if (d <= avance) {
            m.x = cx;
            m.z = cz;
            m.etape++;
          } else {
            m.x += (dx / d) * avance;
            m.z += (dz / d) * avance;
            const vise = Math.atan2(dx, dz);
            let ecart = vise - m.angle;
            while (ecart > Math.PI) ecart -= 2 * Math.PI;
            while (ecart < -Math.PI) ecart += 2 * Math.PI;
            m.angle += ecart * Math.min(1, pasTemps * 8);
            m.phase += avance * 16;
          }
        }
      }
      if (n >= MAX_HABITANTS) continue;
      const y = hauteurTerrain(s.carte, m.x, m.z);
      const marche = m.etat === 'marche';
      const saut = marche ? Math.abs(Math.sin(m.phase)) * 0.025 : 0;
      const penche = marche ? 0 : Math.sin(m.phase * 0.25 + performance.now() / 380) * 0.16 + 0.1;
      poserHabitant(n, m.x, y + saut, m.z, m.angle, m.teinte, penche);
      n++;
    }

    // --- caravanes ---
    let nc = 0;
    const vivants = new Set<number>();
    const places = placesBassin(s, c);
    let placeLibre = 0;
    for (const car of s.caravanes) {
      if (car.phase === 'annoncee') continue;
      vivants.add(car.id);
      let liste = chameaux.get(car.id);
      if (!liste) {
        liste = [];
        for (let k = 0; k < car.chameaux; k++) liste.push({ x: 0, z: 0, angle: 0, phase: Math.random() * 6, vu: false, bouge: 0 });
        chameaux.set(car.id, liste);
      }
      const halte = car.phase === 'abreuvage' || car.phase === 'commerce';
      for (let k = 0; k < liste.length; k++) {
        const ch = liste[k];
        const posLigne = car.pos - k * 1.05 - (halte ? 0.6 : 0);
        let tx: number;
        let tz: number;
        let ta: number | null = null;
        if (halte && placeLibre < places.length) {
          const pl = places[placeLibre++];
          tx = pl.x;
          tz = pl.z;
          ta = pl.angle;
        } else {
          const p = pointPiste(s, Math.max(0, posLigne));
          tx = p.x + (halte ? ((k % 3) - 1) * 0.5 : 0);
          tz = p.z + (halte ? (((k * 7) % 3) - 1) * 0.5 : 0);
        }
        if (!ch.vu) {
          if (posLigne < 0 && !halte) continue; // pas encore entré sur le plateau
          const p0 = pointPiste(s, Math.max(0, posLigne));
          ch.x = p0.x;
          ch.z = p0.z;
          ch.angle = Math.atan2(p0.ax, p0.az);
          ch.vu = true;
        }
        if (posLigne >= s.carte.piste.length - 1.02 && !halte) {
          ch.vu = false; // sorti du plateau
          continue;
        }
        const dx = tx - ch.x;
        const dz = tz - ch.z;
        const d = Math.hypot(dx, dz);
        const vmax = 2.2 * pasTemps;
        let deplace = 0;
        if (d > 0.02) {
          deplace = Math.min(d, vmax);
          ch.x += (dx / d) * deplace;
          ch.z += (dz / d) * deplace;
          const vise = Math.atan2(dx, dz);
          let ecart = vise - ch.angle;
          while (ecart > Math.PI) ecart -= 2 * Math.PI;
          while (ecart < -Math.PI) ecart += 2 * Math.PI;
          ch.angle += ecart * Math.min(1, pasTemps * 5);
        } else if (ta !== null) {
          let ecart = ta - ch.angle;
          while (ecart > Math.PI) ecart -= 2 * Math.PI;
          while (ecart < -Math.PI) ecart += 2 * Math.PI;
          ch.angle += ecart * Math.min(1, pasTemps * 3);
        }
        ch.bouge += ((deplace > 0.0005 ? 1 : 0) - ch.bouge) * Math.min(1, dt * 6);
        ch.phase += deplace * 7;
        if (nc >= MAX_CHAMEAUX) continue;
        const y = hauteurTerrain(s.carte, ch.x, ch.z);
        v3.set(ch.x - DEMI, y + Math.abs(Math.sin(ch.phase)) * 0.012 * ch.bouge, ch.z - DEMI);
        q.setFromAxisAngle(axeY, ch.angle);
        sc.set(1, 1, 1);
        m4.compose(v3, q, sc);
        for (const l of lotsCorps) l.setMatrixAt(nc, m4);
        for (const lp of lotsPatte) {
          const a = Math.sin(ch.phase + lp.dephasage) * 0.5 * ch.bouge;
          m4b.makeTranslation(lp.pivot.x, lp.pivot.y, lp.pivot.z);
          m4b.multiply(new THREE.Matrix4().makeRotationX(a));
          m4b.multiply(new THREE.Matrix4().makeTranslation(-lp.pivot.x, -lp.pivot.y, -lp.pivot.z));
          m4b.premultiply(m4);
          lp.mesh.setMatrixAt(nc, m4b);
        }
        nc++;
        // un chamelier pour trois bêtes
        if (k % 3 === 0 && n < MAX_HABITANTS + 16) {
          const cote = 0.32;
          poserHabitant(
            n,
            ch.x + Math.cos(ch.angle) * cote,
            y + Math.abs(Math.sin(ch.phase * 1.3)) * 0.02 * ch.bouge,
            ch.z - Math.sin(ch.angle) * cote,
            ch.angle,
            TEINTES[1],
            0,
          );
          n++;
        }
      }
    }
    for (const id of chameaux.keys()) if (!vivants.has(id)) chameaux.delete(id);

    for (const l of [...lotsRobe, ...lotsTete]) {
      l.count = n;
      l.instanceMatrix.needsUpdate = true;
      if (l.instanceColor) l.instanceColor.needsUpdate = true;
    }
    for (const l of lotsCorps) {
      l.count = nc;
      l.instanceMatrix.needsUpdate = true;
    }
    for (const lp of lotsPatte) {
      lp.mesh.count = nc;
      lp.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    groupe,
    maj,
    vider() {
      marcheurs.length = 0;
      chameaux.clear();
      chronoRecensement = 0;
    },
    viePres(x, z, rayon) {
      let k = 0;
      for (const m of marcheurs) {
        if (m.etat === 'cache') continue;
        if (Math.hypot(m.x - DEMI - x, m.z - DEMI - z) < rayon) k++;
      }
      for (const liste of chameaux.values()) for (const ch of liste) if (ch.vu && Math.hypot(ch.x - DEMI - x, ch.z - DEMI - z) < rayon) k += 0.5;
      return Math.min(1, k / 10);
    },
  };
}
