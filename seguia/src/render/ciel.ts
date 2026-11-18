/**
 * Lumière, ciel et atmosphère : cycle jour/nuit, saisons, tempête de sable.
 */
import * as THREE from 'three';

export interface Ambiance {
  /** heure 0..24 */
  heure: number;
  /** 0 nuit … 1 jour */
  lumiere: number;
  /** 0 fraîche, 1 chaude, 2 vents */
  saison: number;
  /** intensité de la tempête en cours (0 si aucune) */
  tempete: number;
  canicule: boolean;
}

export interface Ciel {
  groupe: THREE.Group;
  soleil: THREE.DirectionalLight;
  maj(a: Ambiance, cible: THREE.Vector3, dt: number): void;
  /** 0 jour … 1 nuit noire (pour allumer les lanternes) */
  nuit: number;
  /** force du vent 0..1 pour les animations */
  vent: number;
  definirOmbres(taille: number): void;
}

const c = (h: number) => new THREE.Color(h);

/** Interpole une liste de (position, couleur). */
function rampe(cles: [number, THREE.Color][], t: number, cible: THREE.Color): THREE.Color {
  if (t <= cles[0][0]) return cible.copy(cles[0][1]);
  for (let k = 1; k < cles.length; k++) {
    if (t <= cles[k][0]) {
      const a = cles[k - 1];
      const b = cles[k];
      return cible.copy(a[1]).lerp(b[1], (t - a[0]) / (b[0] - a[0]));
    }
  }
  return cible.copy(cles[cles.length - 1][1]);
}

// en fonction de la hauteur du soleil (0 horizon … 1 zénith)
const SOLEIL: [number, THREE.Color][] = [
  [0, c(0xffa868)],
  [0.18, c(0xffc48c)],
  [0.45, c(0xffe6c4)],
  [1, c(0xfff4e2)],
];
// en fonction de la lumière (0 nuit … 1 jour)
const ZENITH: [number, THREE.Color][] = [
  [0, c(0x121a3c)],
  [0.25, c(0x3a3f78)],
  [0.55, c(0x6f9fd0)],
  [1, c(0x8fc0e6)],
];
const HORIZON: [number, THREE.Color][] = [
  [0, c(0x2c3564)],
  [0.22, c(0xe0a07a)],
  [0.5, c(0xf3c796)],
  [1, c(0xf0dcc0)],
];
const HEMI_CIEL: [number, THREE.Color][] = [
  [0, c(0x5b72b8)],
  [0.3, c(0xb3b0d0)],
  [1, c(0xcfe2f5)],
];
const HEMI_SOL: [number, THREE.Color][] = [
  [0, c(0x3c3a5c)],
  [0.3, c(0x8a7468)],
  [1, c(0xd8a878)],
];

export function creerCiel(scene: THREE.Scene): Ciel {
  const groupe = new THREE.Group();
  const soleil = new THREE.DirectionalLight(0xffffff, 3);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  const oc = soleil.shadow.camera;
  oc.left = -30;
  oc.right = 30;
  oc.top = 30;
  oc.bottom = -30;
  oc.near = 10;
  oc.far = 150;
  soleil.shadow.bias = -0.0005;
  soleil.shadow.normalBias = 0.035;
  groupe.add(soleil);
  groupe.add(soleil.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  groupe.add(hemi);

  // dôme dégradé
  const uniDome = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBas: { value: new THREE.Color() },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: uniDome,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uBas;
        void main(){
          float h = vDir.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBas, pow(clamp(-h * 2.2, 0.0, 1.0), 0.7));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  groupe.add(dome);

  // étoiles
  const nbEtoiles = 700;
  const pe = new Float32Array(nbEtoiles * 3);
  for (let k = 0; k < nbEtoiles; k++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(1 - v * 0.95);
    pe[k * 3] = 380 * Math.sin(phi) * Math.cos(theta);
    pe[k * 3 + 1] = 380 * Math.cos(phi);
    pe[k * 3 + 2] = 380 * Math.sin(phi) * Math.sin(theta);
  }
  const ge = new THREE.BufferGeometry();
  ge.setAttribute('position', new THREE.BufferAttribute(pe, 3));
  const matEtoiles = new THREE.PointsMaterial({
    color: 0xfff4dd,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const etoiles = new THREE.Points(ge, matEtoiles);
  etoiles.renderOrder = -9;
  etoiles.frustumCulled = false;
  groupe.add(etoiles);

  const brume = new THREE.FogExp2(0xf0dcc0, 0.0012);
  scene.fog = brume;
  scene.add(groupe);

  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  const poussiere = c(0xd9a35f);
  const dir = new THREE.Vector3();
  let tempeteLisse = 0;

  const api: Ciel = {
    groupe,
    soleil,
    nuit: 0,
    vent: 0.25,
    definirOmbres(taille: number) {
      soleil.castShadow = taille > 0;
      if (taille > 0 && soleil.shadow.mapSize.x !== taille) {
        soleil.shadow.mapSize.set(taille, taille);
        soleil.shadow.map?.dispose();
        soleil.shadow.map = null as any;
      }
    },
    maj(a, cible, dt) {
      tempeteLisse += (a.tempete - tempeteLisse) * Math.min(1, dt * 0.8);
      const tp = Math.min(1, tempeteLisse);
      const lum = a.lumiere;
      // course du soleil : lever à l'est (+x), midi au sud (+z), coucher à l'ouest
      const t = Math.min(1, Math.max(0, (a.heure - 4.6) / 15.5));
      const hauteur = Math.sin(Math.PI * t);
      const jour = lum > 0.06;
      if (jour) {
        dir.set(Math.cos(Math.PI * t) * 1.0, 0.22 + hauteur * 1.1, 0.62).normalize();
        rampe(SOLEIL, hauteur, tmp);
        soleil.color.copy(tmp).lerp(poussiere, tp * 0.6);
        const monte = Math.min(1, hauteur / 0.3);
        soleil.intensity = 3.4 * Math.pow(lum, 0.7) * (0.3 + 0.7 * monte * monte * (3 - 2 * monte)) * (1 - 0.72 * tp) * (a.canicule ? 1.12 : 1);
      } else {
        // clair de lune
        dir.set(-0.45, 0.8, -0.35).normalize();
        soleil.color.set(0xa9c0ff);
        soleil.intensity = 1.5 * (1 - lum / 0.06) * (1 - 0.6 * tp);
      }
      soleil.position.copy(cible).addScaledVector(dir, 70);
      soleil.target.position.copy(cible);
      soleil.target.updateMatrixWorld();

      rampe(HEMI_CIEL, lum, hemi.color).lerp(poussiere, tp * 0.7);
      rampe(HEMI_SOL, lum, hemi.groundColor);
      hemi.intensity = (0.95 + 0.3 * lum) * (1 - 0.25 * tp);

      rampe(ZENITH, lum, tmp).lerp(poussiere, tp * 0.85);
      uniDome.uZenith.value.copy(tmp);
      rampe(HORIZON, lum, tmp2).lerp(poussiere, tp * 0.95);
      if (a.canicule) tmp2.lerp(c(0xfff0d0), 0.35);
      uniDome.uHorizon.value.copy(tmp2);
      uniDome.uBas.value.copy(tmp2).lerp(tmp, 0.25).multiplyScalar(0.82);
      brume.color.copy(tmp2);
      brume.density = 0.0012 + 0.028 * tp * tp + (a.canicule ? 0.0015 : 0);
      matEtoiles.opacity = Math.max(0, 1 - lum * 4) * (1 - tp);
      api.nuit = Math.max(0, 1 - lum * 2.2);
      api.vent = 0.22 + (a.saison === 2 ? 0.2 : 0) + 0.75 * tp;
    },
  };
  return api;
}
