/**
 * Petits outils partagés du moteur audio (aucune dépendance au DOM hors types WebAudio).
 */

export const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);

/** Nombre fini ou valeur par défaut (protège l'automation WebAudio des NaN venus du jeu). */
export const fini = (x: unknown, d = 0): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : d;

export const alea = (a: number, b: number): number => a + Math.random() * (b - a);

export const choisir = <T>(t: readonly T[]): T => t[Math.floor(Math.random() * t.length)]!;

/** Interpolation douce de Hermite entre a et b. */
export const lisse = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Gaussienne approchée (somme de 3 uniformes), écart type ~1. */
export const gauss = (): number => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

/**
 * Marche aléatoire de rappel (Ornstein–Uhlenbeck) bornée à [0, 1] : modulation lente,
 * jamais périodique, donc sans boucle repérable.
 */
export class Marche {
  v: number;
  private z = 0;
  constructor(
    private rappel: number,
    private agitation: number,
    public moyenne = 0.5,
  ) {
    this.v = moyenne;
  }
  pas(dt: number): number {
    // variable interne non bornée, sortie compressée en tanh : ne colle jamais aux bornes
    this.z += -this.z * Math.min(1, this.rappel * dt) + gauss() * this.agitation * Math.sqrt(dt);
    this.v = clamp(this.moyenne + 0.5 * Math.tanh(this.z * 1.6));
    return this.v;
  }
}

/** Approche lissée d'une valeur (pas de saut, pas de clic). */
export function viser(p: AudioParam, v: number, t: number, tau: number): void {
  if (!Number.isFinite(v) || !Number.isFinite(t)) return;
  p.setTargetAtTime(v, t, Math.max(0.005, tau));
}

/**
 * Enveloppe percussive sans clic : montée linéaire, décroissance exponentielle, fin à zéro.
 * Renvoie l'instant où la source peut être arrêtée.
 */
export function enveloppe(p: AudioParam, t: number, attaque: number, crete: number, duree: number): number {
  const c = Math.max(1e-4, crete);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(c, t + attaque);
  p.exponentialRampToValueAtTime(Math.max(c * 1e-3, 1e-6), t + attaque + duree);
  p.linearRampToValueAtTime(0, t + attaque + duree + 0.01);
  return t + attaque + duree + 0.02;
}

/**
 * Regroupe les nœuds éphémères d'un son (effet, oiseau, bulle…) et les déconnecte
 * quand toutes ses sources sont terminées.
 */
export class Voix {
  private noeuds: AudioNode[] = [];
  private restants = 0;
  private libere = false;
  private rappels: Array<() => void> = [];
  /** Rappel exécuté à la libération (comptage de polyphonie). */
  quandFini(cb: () => void): this {
    if (this.libere) cb();
    else this.rappels.push(cb);
    return this;
  }
  n<T extends AudioNode>(x: T): T {
    this.noeuds.push(x);
    return x;
  }
  src<T extends AudioScheduledSourceNode>(x: T): T {
    this.noeuds.push(x);
    this.restants++;
    x.onended = () => {
      if (--this.restants <= 0) this.liberer();
    };
    return x;
  }
  liberer(): void {
    if (this.libere) return;
    this.libere = true;
    for (const n of this.noeuds) {
      try {
        n.disconnect();
      } catch {
        /* déjà déconnecté */
      }
    }
    this.noeuds.length = 0;
    for (const cb of this.rappels) cb();
    this.rappels.length = 0;
  }
}
