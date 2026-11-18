/**
 * Moteur audio procédural de Séguia (WebAudio pur, aucun fichier son).
 *
 * Graphe :
 *   ambiance ─┐                         ┌─> réverbération (convolution IR générée) ─┐
 *   musique ──┼─> bus (volumes) ─┬──────┘                                          │
 *   effets ───┘                  └─> général ─> compresseur ─> limiteur doux ─> sortie (fondu) ─> destination
 *
 * `creerMoteurAudio({ contexte })` accepte un contexte injecté (OfflineAudioContext pour les
 * rendus de contrôle). Sans AudioContext disponible, le moteur reste muet et ne lève jamais.
 */
import type { EtatSonore, MoteurAudio, NomEffet, Volumes } from './types';
import { bruitBlanc, bruitBrun, reponseImpulsionnelle } from './bruit';
import { Ambiance } from './ambiance';
import { Musique } from './musique';
import { Effets } from './effets';
import { clamp, fini, viser } from './outils';

export type { EtatSonore, MoteurAudio, NomEffet, Volumes } from './types';

export interface OptionsMoteurAudio {
  /** Contexte à utiliser au lieu d'en créer un (ex. OfflineAudioContext). */
  contexte?: BaseAudioContext;
}

/** Diagnostic exposé en plus de l'interface (outils de mesure). */
export interface DiagnosticAudio {
  noeudsPermanents: number;
  couchesActives: number;
  contexte: BaseAudioContext | null;
}

const VOLUMES_DEFAUT: Volumes = { general: 1, musique: 1, ambiance: 1, effets: 1 };

/** Courbe perceptive des curseurs (0..1 → gain). */
const courbe = (v: number): number => {
  const x = clamp(fini(v, 0));
  return x * x;
};

function limiteurDoux(): Float32Array<ArrayBuffer> {
  // linéaire jusqu'à 0,7 puis genou en tanh ; la sortie ne dépasse jamais ~0,92
  const n = 4097;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

class Coeur {
  readonly general: GainNode;
  readonly sortie: GainNode;
  readonly busMusique: GainNode;
  readonly busAmbiance: GainNode;
  readonly busEffets: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private ambiance: Ambiance;
  private musique: Musique;
  private effets: Effets;
  private acc = 0;
  readonly nbPermanents: number;

  constructor(
    readonly ctx: BaseAudioContext,
    volumes: Volumes,
  ) {
    const g = (v = 1): GainNode => {
      const x = ctx.createGain();
      x.gain.value = v;
      return x;
    };
    this.sortie = g(0);
    this.sortie.gain.setValueAtTime(0, ctx.currentTime);
    this.sortie.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5);
    const lim = ctx.createWaveShaper();
    lim.curve = limiteurDoux();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.3;
    this.general = g(courbe(volumes.general));
    this.general.connect(comp).connect(lim).connect(this.sortie).connect(ctx.destination);

    // réverbération commune
    const envoi = g(1);
    const conv = ctx.createConvolver();
    conv.buffer = reponseImpulsionnelle(ctx, 2.0);
    const retour = g(0.55);
    envoi.connect(conv).connect(retour).connect(this.general);

    this.busMusique = g(courbe(volumes.musique));
    this.busAmbiance = g(courbe(volumes.ambiance));
    this.busEffets = g(courbe(volumes.effets));
    const sendM = g(0.45);
    const sendA = g(0.12);
    const sendE = g(0.18);
    this.busMusique.connect(this.general);
    this.busMusique.connect(sendM).connect(envoi);
    this.busAmbiance.connect(this.general);
    this.busAmbiance.connect(sendA).connect(envoi);
    this.busEffets.connect(this.general);
    this.busEffets.connect(sendE).connect(envoi);

    // sources de bruit partagées, générées une fois (longueurs premières entre elles)
    const blancT = bruitBlanc(ctx, 7.3);
    const brunT = bruitBrun(ctx, 9.1);
    const boucle = (b: AudioBuffer): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.start();
      this.sources.push(s);
      return s;
    };
    const blanc = boucle(blancT);
    const brun = boucle(brunT);

    this.ambiance = new Ambiance(ctx, blanc, brun, this.busAmbiance, blancT);
    this.musique = new Musique(ctx, this.busMusique);
    this.effets = new Effets(ctx, this.busEffets, envoi, blancT, this.musique);
    // sortie(4) + réverb(3) + bus(3) + envois(3) + sources(2)
    this.nbPermanents = 15 + this.ambiance.nbPermanents + this.musique.nbPermanents;
  }

  get couchesActives(): number {
    return this.ambiance.couchesActives;
  }

  maj(e: EtatSonore, dt: number): void {
    this.acc += clamp(fini(dt, 0), 0, 0.5);
    // 20 Hz suffisent : tout est lissé et programmé avec avance
    if (this.acc < 0.045) return;
    const pas = Math.min(this.acc, 0.5);
    this.acc = 0;
    const t = this.ctx.currentTime;
    this.ambiance.maj(e, t, pas);
    this.musique.maj(e, t, pas);
  }

  jouer(nom: NomEffet, intensite: number): void {
    this.effets.jouer(nom, intensite);
  }

  reglerVolumes(v: Volumes): void {
    const t = this.ctx.currentTime;
    viser(this.general.gain, courbe(v.general), t, 0.05);
    viser(this.busMusique.gain, courbe(v.musique), t, 0.05);
    viser(this.busAmbiance.gain, courbe(v.ambiance), t, 0.05);
    viser(this.busEffets.gain, courbe(v.effets), t, 0.05);
  }

  fondu(cible: number, duree: number): void {
    const p = this.sortie.gain;
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(cible, t + duree);
  }

  detruire(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* */
      }
    }
    this.musique.detruire();
    try {
      this.sortie.disconnect();
    } catch {
      /* */
    }
  }
}

function etatSain(e: EtatSonore): EtatSonore {
  const s = fini(e?.saison, 0);
  return {
    saison: (s === 1 || s === 2 ? s : 0) as 0 | 1 | 2,
    lumiere: clamp(fini(e?.lumiere, 1)),
    tempete: clamp(fini(e?.tempete, 0), 0, 1.4),
    canicule: !!e?.canicule,
    proximite: clamp(fini(e?.proximite, 0.5)),
    eauProche: clamp(fini(e?.eauProche, 0)),
    verdureProche: clamp(fini(e?.verdureProche, 0)),
    vieProche: clamp(fini(e?.vieProche, 0)),
    caravane: !!e?.caravane,
    pause: !!e?.pause,
    vitesse: clamp(fini(e?.vitesse, 1), 1, 4),
  };
}

class MoteurWebAudio implements MoteurAudio {
  private _demarre = false;
  private coeur: Coeur | null = null;
  private volumes: Volumes = { ...VOLUMES_DEFAUT };
  private detruit = false;
  private suspendu = false;
  private jeton = 0;
  private avertis = false;

  constructor(private options: OptionsMoteurAudio) {}

  get demarre(): boolean {
    return this._demarre;
  }

  /** Diagnostic (non requis par l'interface). */
  get diagnostic(): DiagnosticAudio {
    return {
      noeudsPermanents: this.coeur?.nbPermanents ?? 0,
      couchesActives: this.coeur?.couchesActives ?? 0,
      contexte: this.coeur?.ctx ?? null,
    };
  }

  async demarrer(): Promise<void> {
    if (this._demarre || this.detruit) return;
    this._demarre = true;
    try {
      let ctx: BaseAudioContext | undefined = this.options.contexte;
      if (!ctx) {
        const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const Ctor = g.AudioContext ?? g.webkitAudioContext;
        if (!Ctor) return; // moteur muet
        ctx = new Ctor({ latencyHint: 'playback' });
      }
      this.coeur = new Coeur(ctx, this.volumes);
      if (this.suspendu) {
        this.coeur.sortie.gain.cancelScheduledValues(0);
        this.coeur.sortie.gain.setValueAtTime(0, ctx.currentTime);
      }
      if (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext && ctx.state === 'suspended') {
        await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 1000))]);
      }
    } catch (err) {
      this.coeur = null;
      this.avertir(err);
    }
  }

  private avertir(err: unknown): void {
    if (this.avertis) return;
    this.avertis = true;
    try {
      console.warn('[audio] moteur muet :', err);
    } catch {
      /* */
    }
  }

  private sur(f: (c: Coeur) => void): void {
    const c = this.coeur;
    if (!c || this.detruit) return;
    try {
      f(c);
    } catch (err) {
      this.avertir(err);
    }
  }

  maj(etat: EtatSonore, dt: number): void {
    this.sur((c) => c.maj(etatSain(etat), dt));
  }

  jouer(effet: NomEffet, intensite = 1): void {
    if (this.suspendu) return;
    this.sur((c) => c.jouer(effet, fini(intensite, 1)));
  }

  reglerVolumes(v: Volumes): void {
    this.volumes = {
      general: fini(v?.general, this.volumes.general),
      musique: fini(v?.musique, this.volumes.musique),
      ambiance: fini(v?.ambiance, this.volumes.ambiance),
      effets: fini(v?.effets, this.volumes.effets),
    };
    this.sur((c) => c.reglerVolumes(this.volumes));
  }

  suspendre(): void {
    if (this.suspendu) return;
    this.suspendu = true;
    const j = ++this.jeton;
    this.sur((c) => {
      c.fondu(0, 0.15);
      const ctx = c.ctx;
      if (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext) {
        // une fois le fondu fini, on gèle le contexte pour libérer le CPU
        setTimeout(() => {
          if (j === this.jeton && this.suspendu && ctx.state === 'running') ctx.suspend().catch(() => undefined);
        }, 200);
      }
    });
  }

  reprendre(): void {
    if (!this.suspendu) return;
    this.suspendu = false;
    ++this.jeton;
    this.sur((c) => {
      const ctx = c.ctx;
      if (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext && ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => this.coeur === c && !this.suspendu && c.fondu(1, 0.15))
          .catch(() => undefined);
      } else {
        c.fondu(1, 0.15);
      }
    });
  }

  detruire(): void {
    if (this.detruit) return;
    this.detruit = true;
    const c = this.coeur;
    this.coeur = null;
    if (!c) return;
    try {
      c.detruire();
      const ctx = c.ctx;
      if (!this.options.contexte && typeof AudioContext !== 'undefined' && ctx instanceof AudioContext) {
        ctx.close().catch(() => undefined);
      }
    } catch {
      /* */
    }
  }
}

/**
 * Crée le moteur audio. Rien n'est alloué avant `demarrer()` (à appeler au premier geste).
 * Sans WebAudio (Node, navigateur restreint), le moteur est muet et respecte l'interface.
 */
export function creerMoteurAudio(options: OptionsMoteurAudio = {}): MoteurAudio {
  return new MoteurWebAudio(options ?? {});
}
