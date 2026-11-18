/**
 * Post-traitement : flou de maquette (tilt-shift), halo des lumières la nuit, vignette.
 * Trois préréglages : léger (rendu direct), équilibré, soigné.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export type Qualite = 'leger' | 'equilibre' | 'soigne';

const ShaderMaquette = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uForce: { value: 0 },
    uCentre: { value: 0.5 },
    uBande: { value: 0.2 },
    uAspect: { value: 1.6 },
    uVignette: { value: 0.35 },
    uTeinte: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uForce; uniform float uCentre; uniform float uBande; uniform float uAspect; uniform float uVignette;
    uniform vec3 uTeinte;
    void main(){
      float d = abs(vUv.y - uCentre);
      float flou = smoothstep(uBande, uBande + 0.38, d) * uForce;
      vec4 col = texture2D(tDiffuse, vUv);
      if (flou > 0.0004) {
        vec2 px = vec2(flou / uAspect, flou);
        vec4 acc = col * 0.2;
        acc += texture2D(tDiffuse, vUv + px * vec2( 0.000,  1.000)) * 0.1;
        acc += texture2D(tDiffuse, vUv + px * vec2( 0.000, -1.000)) * 0.1;
        acc += texture2D(tDiffuse, vUv + px * vec2( 0.866,  0.500)) * 0.1;
        acc += texture2D(tDiffuse, vUv + px * vec2(-0.866,  0.500)) * 0.1;
        acc += texture2D(tDiffuse, vUv + px * vec2( 0.866, -0.500)) * 0.1;
        acc += texture2D(tDiffuse, vUv + px * vec2(-0.866, -0.500)) * 0.1;
        acc += texture2D(tDiffuse, vUv + px * vec2( 0.500,  0.000)) * 0.05;
        acc += texture2D(tDiffuse, vUv + px * vec2(-0.500,  0.000)) * 0.05;
        acc += texture2D(tDiffuse, vUv + px * vec2( 0.000,  0.500)) * 0.05;
        acc += texture2D(tDiffuse, vUv + px * vec2( 0.000, -0.500)) * 0.05;
        col = acc;
      }
      vec2 c = vUv - 0.5;
      float v = 1.0 - uVignette * smoothstep(0.35, 0.95, length(c * vec2(1.0, 1.15)) * 1.35);
      col.rgb *= v * uTeinte;
      gl_FragColor = col;
    }`,
};

export interface Post {
  rendre(): void;
  redimensionner(l: number, h: number, ratio: number): void;
  definirQualite(q: Qualite): void;
  /** force du flou de maquette 0..1 (liée au zoom), halo 0..1 (lié à la nuit) */
  regler(proximite: number, nuit: number, tempete: number): void;
  qualite: Qualite;
}

export function creerPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Post {
  let qualite: Qualite = 'equilibre';
  let largeur = 1;
  let hauteur = 1;
  // cible en demi-flottants si la carte graphique le permet (halos plus propres), sinon 8 bits
  const flottants = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const cibleRendu = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: flottants ? THREE.HalfFloatType : THREE.UnsignedByteType });
  const composer = new EffectComposer(renderer, cibleRendu);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.0, 0.6, 0.92);
  composer.addPass(bloom);
  const maquette = new ShaderPass(ShaderMaquette);
  composer.addPass(maquette);
  composer.addPass(new OutputPass());

  const api: Post = {
    qualite,
    rendre() {
      if (qualite === 'leger') renderer.render(scene, camera);
      else composer.render();
    },
    redimensionner(l, h, ratio) {
      largeur = l;
      hauteur = h;
      composer.setPixelRatio(ratio);
      composer.setSize(l, h);
      maquette.uniforms.uAspect.value = l / h;
    },
    definirQualite(q) {
      qualite = q;
      api.qualite = q;
      bloom.enabled = q !== 'leger';
    },
    regler(proximite, nuit, tempete) {
      // flou plus marqué de près ; quasi nul en vue d'ensemble
      const p2 = proximite * proximite;
      maquette.uniforms.uForce.value = (qualite === 'soigne' ? 0.0075 : 0.0055) * (0.06 + 0.94 * p2);
      maquette.uniforms.uBande.value = 0.2 + 0.14 * (1 - proximite);
      maquette.uniforms.uCentre.value = 0.47;
      maquette.uniforms.uVignette.value = 0.3 + 0.25 * nuit + 0.2 * Math.min(1, tempete);
      bloom.strength = 0.08 + 0.55 * nuit;
      bloom.threshold = 0.98 - 0.18 * nuit;
      void largeur;
      void hauteur;
    },
  };
  return api;
}
