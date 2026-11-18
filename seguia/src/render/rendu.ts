/**
 * Assemble la scène du diorama et la tient à jour d'après l'état de la simulation.
 */
import * as THREE from 'three';
import { calendrier, canicule, N, tempeteEnCours, type Cache, type GameState } from '../sim';
import { creerAgents, type Agents } from './agents';
import { creerApercu, type Apercu } from './apercu';
import { creerBatiments, type Batiments } from './batiments';
import { CameraRig } from './camera';
import { creerCanaux, type Canaux } from './canaux';
import { creerCiel, type Ciel } from './ciel';
import { creerMeteo, type Meteo } from './meteo';
import { creerMateriaux, Modeles } from './modeles';
import { DEMI, hauteurTerrain, NIVEAU } from './monde';
import { creerPost, type Post, type Qualite } from './post';
import { creerTerrain, type Terrain } from './terrain';

export interface ReglagesRendu {
  qualite: Qualite;
}

export class Rendu {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly ciel: Ciel;
  readonly modeles: Modeles;
  readonly post: Post;
  terrain: Terrain | null = null;
  canaux: Canaux | null = null;
  batiments: Batiments;
  agents: Agents;
  apercu: Apercu;
  meteo: Meteo;
  /** vitesse du jeu (0 en pause) : cadence des animations de personnages */
  vitesseJeu = 1;
  private canvas: HTMLCanvasElement;
  private temps = 0;
  private derniereTopo = '';
  private chronoEtat = 0;
  private chronoVegetation = 0;
  private rayon = new THREE.Raycaster();
  private souris = new THREE.Vector2();
  private qualite: Qualite = 'equilibre';
  carteCourante: GameState['carte'] | null = null;
  /** images par seconde lissées */
  ips = 60;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.ciel = creerCiel(this.scene);
    this.modeles = new Modeles(creerMateriaux());
    this.batiments = creerBatiments(this.modeles);
    this.scene.add(this.batiments.groupe);
    this.agents = creerAgents(this.modeles);
    this.scene.add(this.agents.groupe);
    this.apercu = creerApercu(this.modeles);
    this.scene.add(this.apercu.groupe);
    this.meteo = creerMeteo();
    this.scene.add(this.meteo.objet);
    this.post = creerPost(this.renderer, this.scene, this.rig.camera);
    this.definirQualite('equilibre');
    this.redimensionner();
  }

  async chargerModeles(surProgres?: (fait: number, total: number) => void) {
    await this.modeles.charger('./assets/models/', surProgres);
  }

  definirQualite(q: Qualite) {
    this.qualite = q;
    this.post.definirQualite(q);
    this.ciel.definirOmbres(q === 'leger' ? 1024 : q === 'equilibre' ? 2048 : 4096);
    this.redimensionner();
  }

  get qualiteCourante(): Qualite {
    return this.qualite;
  }

  redimensionner() {
    const l = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const ratio = this.qualite === 'leger' ? Math.min(1, dpr) : this.qualite === 'equilibre' ? Math.min(1.25, dpr) : Math.min(2, dpr);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(l, h, false);
    this.rig.redimensionner(l / h);
    this.post.redimensionner(l, h, ratio);
  }

  /** (Re)construit le décor pour une partie. */
  installer(s: GameState, c: Cache) {
    if (this.terrain) {
      this.scene.remove(this.terrain.groupe);
      this.terrain.liberer();
    }
    if (this.canaux) {
      this.scene.remove(this.canaux.groupe);
      this.canaux.liberer();
    }
    this.batiments.vider();
    this.agents.vider();
    this.terrain = creerTerrain(s.carte);
    this.scene.add(this.terrain.groupe);
    this.canaux = creerCanaux(this.terrain.texEtat);
    this.scene.add(this.canaux.groupe);
    this.carteCourante = s.carte;
    this.derniereTopo = '';
    this.chronoEtat = 0;
    this.chronoVegetation = 0;
    this.terrain.majEtat(s, c);
    this.batiments.installerDecor(s);
    // vue de départ : la source et ses abords
    const sx = (s.carte.sourceCase % N) + 0.5 - DEMI;
    const sz = Math.floor(s.carte.sourceCase / N) + 0.5 - DEMI;
    this.rig.definir({ x: sx * 0.75, z: sz * 0.75 + 1.5, distance: 38, azimut: 0.5, inclinaison: 0 }, true);
  }

  /** Signature du tracé des séguias et de la topologie, pour ne reconstruire qu'au besoin. */
  private signature(s: GameState, c: Cache): string {
    let h = 0;
    for (let i = 0; i < s.canal.length; i++) {
      if (s.canal[i]) h = (Math.imul(h, 31) + i * 4 + s.canal[i] + (c.parent[i] + 3) * 7919) | 0;
    }
    return h + ':' + c.nbOrdre;
  }

  maj(s: GameState, c: Cache, dt: number) {
    this.temps += dt;
    this.ips += (1 / Math.max(1e-3, dt) - this.ips) * 0.05;
    const cal = calendrier(s.pas);
    const tp = tempeteEnCours(s);
    const sig = this.signature(s, c);
    if (this.canaux && sig !== this.derniereTopo) {
      this.derniereTopo = sig;
      this.canaux.reconstruire(s, c);
    }
    this.chronoEtat -= dt;
    if (this.terrain && this.chronoEtat <= 0) {
      this.chronoEtat = 0.12;
      this.terrain.majEtat(s, c);
    }
    this.chronoVegetation -= dt;
    if (this.chronoVegetation <= 0) {
      this.chronoVegetation = 0.6;
      this.batiments.majVegetation(s, c);
    }
    const hSol = this.carteCourante
      ? hauteurTerrain(this.carteCourante, this.rig.cible.x + DEMI, this.rig.cible.z + DEMI)
      : 0.5;
    this.rig.maj(dt, Math.min(1.6, hSol) + 0.1);
    this.ciel.maj(
      { heure: cal.heure, lumiere: cal.lumiere, saison: cal.saison, tempete: tp ? tp.intensite : 0, canicule: canicule(s) },
      this.rig.pointVise,
      dt,
    );
    const u = this.modeles.mats.uniformes;
    u.uTemps.value = this.temps;
    u.uVent.value = this.ciel.vent;
    if (this.canaux) this.canaux.uniformes.uTemps.value = this.temps;
    if (this.terrain) this.terrain.uniformes.uTemps.value = this.temps;
    this.batiments.sync(s, c, dt, this.temps, this.ciel.nuit, this.ciel.vent);
    this.agents.maj(s, c, dt, this.vitesseJeu);
    this.apercu.maj(this.temps);
    this.meteo.maj(tp ? tp.intensite : 0, tp ? tp.dir : s.carte.ventDominant, this.rig.pointVise, this.rig.distanceCourante * 0.7, dt);
    this.post.regler(this.rig.proximite, this.ciel.nuit, tp ? tp.intensite : 0);
    this.renderer.toneMappingExposure = 1.12 - 0.08 * this.ciel.nuit;
  }

  /** compteurs de la dernière image (appels de dessin, triangles) */
  dernier = { appels: 0, triangles: 0 };

  rendre() {
    this.renderer.info.reset();
    this.post.rendre();
    this.dernier.appels = this.renderer.info.render.calls;
    this.dernier.triangles = this.renderer.info.render.triangles;
  }

  /** Rayon depuis un point de l'écran (coordonnées client). */
  private viser(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    this.souris.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.rig.camera.updateMatrixWorld(); // la caméra a pu bouger depuis la dernière image rendue
    this.rayon.setFromCamera(this.souris, this.rig.camera);
    return this.rayon.ray;
  }

  /** Case du plateau sous le curseur (-1 si aucune). Teste les terrasses de la plus haute à la plus basse. */
  caseSous(clientX: number, clientY: number): number {
    const carte = this.carteCourante;
    if (!carte) return -1;
    const ray = this.viser(clientX, clientY);
    if (Math.abs(ray.direction.y) < 1e-6) return -1;
    for (let e = 3; e >= 0; e--) {
      const t = (e * NIVEAU - ray.origin.y) / ray.direction.y;
      if (t <= 0) continue;
      const x = Math.floor(ray.origin.x + ray.direction.x * t + DEMI);
      const z = Math.floor(ray.origin.z + ray.direction.z * t + DEMI);
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      if (carte.elev[z * N + x] === e) return z * N + x;
    }
    return -1;
  }

  /** Point du sol (au niveau moyen) sous le curseur, pour le zoom et le déplacement. */
  pointSol(clientX: number, clientY: number, niveau = 0.5): THREE.Vector3 | null {
    const ray = this.viser(clientX, clientY);
    if (ray.direction.y >= -1e-4) return null;
    const t = (niveau - ray.origin.y) / ray.direction.y;
    if (t <= 0 || t > 600) return null;
    return new THREE.Vector3().copy(ray.origin).addScaledVector(ray.direction, t);
  }

  /** Position à l'écran (coordonnées client) d'un point du monde. */
  ecran(x: number, y: number, z: number): { x: number; y: number; devant: boolean } {
    this.rig.camera.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).project(this.rig.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, devant: v.z < 1 };
  }

  /** Position à l'écran du centre d'une case. */
  ecranCase(i: number, dessus = 0): { x: number; y: number; devant: boolean } {
    const carte = this.carteCourante!;
    const tx = i % N;
    const tz = Math.floor(i / N);
    return this.ecran(tx + 0.5 - DEMI, carte.elev[i] * NIVEAU + dessus, tz + 0.5 - DEMI);
  }

  infos() {
    return { appels: this.dernier.appels, triangles: this.dernier.triangles, ips: Math.round(this.ips), ...this.batiments.compte() };
  }
}
