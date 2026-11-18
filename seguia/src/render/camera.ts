/**
 * Caméra de maquette : orbite autour d'un point du plateau, zoom vers le curseur,
 * inclinaison qui s'abaisse quand on s'approche pour regarder les détails.
 */
import * as THREE from 'three';

export interface Vue {
  x: number;
  z: number;
  distance: number;
  azimut: number;
  /** décalage d'inclinaison choisi par le joueur (radians) */
  inclinaison: number;
}

const DEG = Math.PI / 180;
export const DIST_MIN = 5.5;
export const DIST_MAX = 82;

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  /** valeurs visées */
  cible = new THREE.Vector3(0, 0.6, 0);
  distance = 52;
  azimut = 35 * DEG;
  inclinaison = 0;
  /** valeurs lissées */
  private cCible = new THREE.Vector3(0, 0.6, 0);
  private cDistance = 52;
  private cAzimut = 35 * DEG;
  private cInclinaison = 0;
  /** demi-étendue autorisée pour la cible */
  limite = 23;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 900);
    this.appliquer();
  }

  /** Inclinaison au-dessus de l'horizon selon la distance : rasante de près, plongeante de loin. */
  private elevation(dist: number, decal: number): number {
    const t = Math.min(1, Math.max(0, (dist - 8) / 50));
    const lisse = t * t * (3 - 2 * t);
    const base = (24 + 28 * lisse) * DEG;
    return Math.min(84 * DEG, Math.max(14 * DEG, base + decal));
  }

  get proximite(): number {
    return 1 - Math.min(1, Math.max(0, (this.cDistance - DIST_MIN) / (60 - DIST_MIN)));
  }

  get distanceCourante(): number {
    return this.cDistance;
  }

  get azimutCourant(): number {
    return this.cAzimut;
  }

  get pointVise(): THREE.Vector3 {
    return this.cCible;
  }

  vue(): Vue {
    return { x: this.cible.x, z: this.cible.z, distance: this.distance, azimut: this.azimut, inclinaison: this.inclinaison };
  }

  definir(v: Partial<Vue>, immediat = false) {
    if (v.x !== undefined) this.cible.x = v.x;
    if (v.z !== undefined) this.cible.z = v.z;
    if (v.distance !== undefined) this.distance = v.distance;
    if (v.azimut !== undefined) this.azimut = v.azimut;
    if (v.inclinaison !== undefined) this.inclinaison = v.inclinaison;
    this.borner();
    if (immediat) {
      this.cCible.copy(this.cible);
      this.cDistance = this.distance;
      this.cAzimut = this.azimut;
      this.cInclinaison = this.inclinaison;
      this.appliquer();
    }
  }

  private borner() {
    this.distance = Math.min(DIST_MAX, Math.max(DIST_MIN, this.distance));
    this.cible.x = Math.min(this.limite, Math.max(-this.limite, this.cible.x));
    this.cible.z = Math.min(this.limite, Math.max(-this.limite, this.cible.z));
    this.inclinaison = Math.min(30 * DEG, Math.max(-12 * DEG, this.inclinaison));
  }

  /** Déplacement dans le repère de l'écran (droite, avant), en unités du monde. */
  deplacer(droite: number, avant: number) {
    const s = Math.sin(this.azimut);
    const c = Math.cos(this.azimut);
    // vecteur « avant » au sol (de la caméra vers la cible) et vecteur « droite »
    this.cible.x += -s * avant + c * droite;
    this.cible.z += -c * avant - s * droite;
    this.borner();
  }

  tourner(dAzimut: number, dInclinaison: number) {
    this.azimut += dAzimut;
    this.inclinaison += dInclinaison;
    this.borner();
  }

  /** Zoom d'un facteur (< 1 : on s'approche) en gardant `point` (au sol) sous le curseur. */
  zoomer(facteur: number, point?: THREE.Vector3) {
    const avant = this.distance;
    this.distance = Math.min(DIST_MAX, Math.max(DIST_MIN, this.distance * facteur));
    const reel = this.distance / avant;
    if (point) {
      this.cible.x = point.x + (this.cible.x - point.x) * reel;
      this.cible.z = point.z + (this.cible.z - point.z) * reel;
    }
    this.borner();
  }

  maj(dt: number, hauteurSol = 0.6) {
    const k = 1 - Math.exp(-dt * 9);
    this.cible.y += (hauteurSol - this.cible.y) * Math.min(1, dt * 3);
    this.cCible.lerp(this.cible, k);
    this.cDistance += (this.distance - this.cDistance) * k;
    this.cAzimut += (this.azimut - this.cAzimut) * k;
    this.cInclinaison += (this.inclinaison - this.cInclinaison) * k;
    this.appliquer();
  }

  private appliquer() {
    const el = this.elevation(this.cDistance, this.cInclinaison);
    const d = this.cDistance;
    const horizontal = Math.cos(el) * d;
    this.camera.position.set(
      this.cCible.x + Math.sin(this.cAzimut) * horizontal,
      this.cCible.y + Math.sin(el) * d,
      this.cCible.z + Math.cos(this.cAzimut) * horizontal,
    );
    this.camera.lookAt(this.cCible);
    this.camera.near = Math.max(0.3, d * 0.05);
    this.camera.far = d + 700;
    this.camera.updateProjectionMatrix();
  }

  redimensionner(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
