/**
 * Lit d'ambiance : couches continues (vent, eau, palmes, grillons, rumeur, chaleur, tempête)
 * nourries par deux sources de bruit bouclées partagées, plus des évènements épars
 * (bulles, oiseaux, clochettes, pilon) programmés avec une petite avance.
 *
 * Une couche dont le niveau cible est nul depuis quelques secondes est débranchée de sa
 * source : Chromium ne calcule plus ses filtres (économie CPU). Elle est rebranchée à gain
 * nul, puis remonte en douceur.
 */
import type { EtatSonore } from './types';
import { alea, choisir, clamp, lisse, Marche, viser, Voix, enveloppe } from './outils';
import { bulle, cloche, eclat, oiseau } from './timbres';

const SEUIL = 0.0004;

class Couche {
  private branche = false;
  private silence = 0;
  readonly niveau: GainNode;
  constructor(
    ctx: BaseAudioContext,
    private source: AudioNode,
    private entree: AudioNode,
    sortie: AudioNode,
    dernier: AudioNode,
  ) {
    this.niveau = ctx.createGain();
    this.niveau.gain.value = 0;
    dernier.connect(this.niveau).connect(sortie);
  }
  get active(): boolean {
    return this.branche;
  }
  regler(cible: number, t: number, tau: number, dt: number): void {
    if (cible > SEUIL) {
      this.silence = 0;
      if (!this.branche) {
        this.niveau.gain.cancelScheduledValues(t);
        this.niveau.gain.setValueAtTime(0, t);
        this.source.connect(this.entree);
        this.branche = true;
      }
      viser(this.niveau.gain, cible, t, tau);
    } else if (this.branche) {
      viser(this.niveau.gain, 0, t, tau);
      this.silence += dt;
      if (this.silence > tau * 6 + 0.5) {
        this.source.disconnect(this.entree);
        this.branche = false;
      }
    }
  }
  /** Modulation rapide supplémentaire (syllabes, grains) sur un niveau déjà calculé. */
  fluctuer(v: number, t: number, tau: number): void {
    if (this.branche) viser(this.niveau.gain, v, t, tau);
  }
}

/** Flux d'évènements de Poisson à taux variable (par amincissement). */
class Flux {
  prochain = 0;
  constructor(private tauxMax: number) {}
  /** Appelle `tirer(t)` pour chaque évènement accepté dans la fenêtre [now, horizon]. */
  avancer(now: number, horizon: number, taux: number, tirer: (t: number) => void): void {
    if (this.prochain < now) this.prochain = now + alea(0, 1 / this.tauxMax);
    while (this.prochain < horizon) {
      if (Math.random() < taux / this.tauxMax) tirer(this.prochain);
      this.prochain += -Math.log(1 - Math.random()) / this.tauxMax;
    }
  }
}

export class Ambiance {
  private couches: Couche[] = [];
  private ventGrave: Couche;
  private ventSiffle: Couche;
  private ventSiffleF: BiquadFilterNode;
  private eau: Couche;
  private eauF: BiquadFilterNode;
  private palmes: Couche;
  private village: Couche;
  private villageF: BiquadFilterNode;
  private grillonA: Couche;
  private grillonB: Couche;
  private pulsA: GainNode;
  private pulsB: GainNode;
  private chaleur: Couche;
  private cigales: Couche;
  private grondement: Couche;
  private souffle: Couche;
  private sifflTempete: Couche;
  private sifflTempeteF: BiquadFilterNode;
  private grains: Couche;
  /** panoramiques fixes partagés par les évènements épars */
  private pans: StereoPannerNode[] = [];
  private evenements: GainNode;
  readonly nbPermanents: number;

  private mRafale = new Marche(0.25, 0.32);
  private mSiffle = new Marche(0.4, 0.5);
  private mEau = new Marche(1.5, 1.2);
  private mVillage = new Marche(0.8, 0.8);
  private mCigale = new Marche(0.12, 0.3, 0.6);
  private mTempete = new Marche(0.6, 0.7);
  private mChaleur = new Marche(0.1, 0.2);

  private fBulles = new Flux(40);
  private fOiseaux = new Flux(1.2);
  private fCloches = new Flux(0.8);
  private fPilon = new Flux(0.3);
  private fGrillonA = 0;
  private fGrillonB = 0;
  private finPilon = 0;
  private finOiseau = 0;
  private enCours = 0;

  constructor(
    private ctx: BaseAudioContext,
    blanc: AudioNode,
    brun: AudioNode,
    sortie: AudioNode,
    private bruitTampon: AudioBuffer,
  ) {
    let nb = 0;
    const filtre = (type: BiquadFilterType, f: number, q = 0.707): BiquadFilterNode => {
      const x = ctx.createBiquadFilter();
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q;
      nb++;
      return x;
    };
    const couche = (src: AudioNode, ...chaine: AudioNode[]): Couche => {
      for (let i = 0; i < chaine.length - 1; i++) chaine[i]!.connect(chaine[i + 1]!);
      const c = new Couche(ctx, src, chaine[0]!, sortie, chaine[chaine.length - 1]!);
      nb++;
      this.couches.push(c);
      return c;
    };

    // Vent : grave (bruit brun) + sifflement (bande étroite mobile)
    this.ventGrave = couche(brun, filtre('lowpass', 380, 0.5));
    this.ventSiffleF = filtre('bandpass', 900, 7);
    this.ventSiffle = couche(blanc, this.ventSiffleF);
    // Eau courante : nappe de bruit en bande, à laquelle s'ajoutent les bulles
    this.eauF = filtre('bandpass', 1400, 0.9);
    this.eau = couche(blanc, filtre('highpass', 300), this.eauF);
    // Palmes : froissement aigu
    this.palmes = couche(blanc, filtre('highpass', 2800, 0.6), filtre('lowpass', 9000));
    // Rumeur de village : bande de voix, modulée au rythme des syllabes
    this.villageF = filtre('bandpass', 520, 1.4);
    this.village = couche(brun, this.villageF);
    // Grillons : deux sinus aigus, impulsions programmées
    const grillon = (f: number, pan: number): [Couche, GainNode] => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.start();
      const p = ctx.createGain();
      p.gain.value = 0;
      const sp = ctx.createStereoPanner();
      sp.pan.value = pan;
      nb += 3;
      o.connect(p);
      return [couche(o, p, sp), p];
    };
    [this.grillonA, this.pulsA] = grillon(4420, -0.55);
    [this.grillonB, this.pulsB] = grillon(4980, 0.5);
    // Canicule : aigu ténu + cigales lointaines (bande de bruit modulée en amplitude)
    const ton = ctx.createOscillator();
    ton.frequency.value = 7600;
    ton.start();
    nb++;
    this.chaleur = couche(ton, filtre('lowpass', 12000));
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 47;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(am.gain);
    lfo.start();
    nb += 3;
    this.cigales = couche(blanc, filtre('bandpass', 4900, 3.5), am, filtre('lowpass', 6500));
    // Tempête : grondement, souffle, sifflements, grains
    this.grondement = couche(brun, filtre('lowpass', 160, 0.6));
    this.souffle = couche(blanc, filtre('bandpass', 1800, 0.5));
    this.sifflTempeteF = filtre('bandpass', 1100, 11);
    this.sifflTempete = couche(blanc, this.sifflTempeteF);
    this.grains = couche(blanc, filtre('highpass', 4200, 0.7));

    // Évènements épars
    this.evenements = ctx.createGain();
    this.evenements.connect(sortie);
    nb++;
    for (const p of [-0.75, -0.35, 0, 0.35, 0.75]) {
      const sp = ctx.createStereoPanner();
      sp.pan.value = p;
      sp.connect(this.evenements);
      this.pans.push(sp);
      nb++;
    }
    this.nbPermanents = nb;
  }

  private pan(): StereoPannerNode {
    return choisir(this.pans);
  }

  /** Nombre de couches actuellement branchées (diagnostic CPU). */
  get couchesActives(): number {
    return this.couches.filter((c) => c.active).length;
  }

  maj(e: EtatSonore, t: number, dt: number): void {
    const ctx = this.ctx;
    const proche = clamp(e.proximite);
    const loin = 1 - proche;
    const jour = lisse(0.25, 0.65, e.lumiere);
    const nuit = 1 - lisse(0.05, 0.35, e.lumiere);
    const vents = e.saison === 2 ? 1 : 0;
    const T = clamp(e.tempete, 0, 1.4);
    const couvre = 1 - 0.9 * lisse(0.15, 1, T); // le reste s'efface sous la tempête
    const eau = clamp(e.eauProche) * Math.pow(proche, 1.3);
    const verdure = clamp(e.verdureProche);
    const vie = clamp(e.vieProche);

    const rafale = this.mRafale.pas(dt);
    const sif = this.mSiffle.pas(dt);
    const me = this.mEau.pas(dt);
    const mv = this.mVillage.pas(dt);
    const mc = this.mCigale.pas(dt);
    const mt = this.mTempete.pas(dt);
    const mch = this.mChaleur.pas(dt);

    // ---- vent ----
    const ventBase = (0.15 + 0.85 * loin) * (1 + 0.7 * vents) * (0.85 + 0.15 * jour);
    const g = 0.55 + 0.9 * rafale;
    this.ventGrave.regler(0.09 * ventBase * g, t, 0.8, dt);
    this.ventSiffle.regler(0.022 * ventBase * g * g * (0.5 + 0.8 * vents) * couvre, t, 0.9, dt);
    viser(this.ventSiffleF.frequency, 600 + 1000 * sif, t, 0.6);

    // ---- eau ----
    this.eau.regler(0.46 * eau * (0.7 + 0.6 * me) * couvre, t, 0.25, dt);
    viser(this.eauF.frequency, 1000 + 900 * me, t, 0.15);

    // ---- palmes ----
    this.palmes.regler(0.11 * verdure * (0.25 + 0.75 * proche) * (0.3 + 0.9 * rafale) * (0.6 + 0.6 * vents) * couvre, t, 0.5, dt);

    // ---- village ----
    const vVillage = 0.3 * vie * proche * (0.25 + 0.75 * jour) * couvre;
    this.village.regler(vVillage, t, 0.4, dt);
    if (vVillage > SEUIL) {
      this.village.fluctuer(vVillage * alea(0.45, 1.25), t, 0.07);
      viser(this.villageF.frequency, 380 + 420 * mv, t, 0.12);
    }

    // ---- grillons ----
    const vGrillon = 0.05 * nuit * (0.45 + 0.55 * verdure) * (0.35 + 0.65 * proche) * couvre;
    this.grillonA.regler(vGrillon, t, 1.2, dt);
    this.grillonB.regler(vGrillon * 0.7, t, 1.2, dt);

    // ---- canicule ----
    const can = e.canicule ? jour * (0.5 + 0.5 * lisse(0, 0.3, e.lumiere)) : 0;
    this.chaleur.regler(0.004 * can * (0.6 + 0.8 * mch) * couvre, t, 1.5, dt);
    this.cigales.regler(0.45 * can * (0.3 + 0.7 * verdure) * (0.2 + 1.1 * mc) * couvre, t, 1.2, dt);

    // ---- tempête ----
    this.grondement.regler(0.1 * T, t, 0.8, dt);
    this.souffle.regler(0.1 * T * (0.6 + 0.8 * rafale), t, 0.5, dt);
    this.sifflTempete.regler(0.04 * T * (0.3 + 1.2 * mt * mt), t, 0.3, dt);
    viser(this.sifflTempeteF.frequency, 500 + 1300 * mt, t, 0.4);
    const vGrains = 0.07 * T * T;
    this.grains.regler(vGrains, t, 0.3, dt);
    if (vGrains > SEUIL) this.grains.fluctuer(vGrains * alea(0.3, 1.6), t, 0.03);

    // ---- évènements épars ----
    const horizon = t + 0.25;
    const limite = this.enCours < 24;
    const tauxBulles = 30 * eau * (0.5 + me) * couvre;
    this.fBulles.avancer(t, horizon, tauxBulles, (te) => {
      if (!limite) return;
      const grosse = Math.random() < 0.2;
      const f = grosse ? alea(260, 480) : alea(520, 1500);
      this.compter(bulle(ctx, te, f, (grosse ? 0.14 : 0.1) * eau * alea(0.4, 1), grosse ? alea(0.05, 0.09) : alea(0.015, 0.045), this.pan()));
    });

    const tauxOiseaux = 0.55 * verdure * jour * (0.35 + 0.65 * proche) * couvre * (e.canicule ? 0.35 : 1);
    this.fOiseaux.avancer(t, horizon, tauxOiseaux, (te) => {
      if (!limite || te < this.finOiseau) return;
      const o = oiseau(ctx, te, 0.07 * (0.35 + 0.65 * proche) * alea(0.5, 1), this.pan());
      this.finOiseau = te + o.duree * 0.6; // deux chants peuvent se chevaucher un peu, pas plus
      this.compter(o.voix);
    });

    const tauxCloches = e.caravane ? 0.3 * (0.35 + 0.65 * proche) * (1 - 0.6 * lisse(0, 1, T)) : 0;
    this.fCloches.avancer(t, horizon, tauxCloches, (te) => {
      if (!limite) return;
      const f = choisir([610, 740, 880, 1020]);
      const n = Math.floor(alea(2, 5));
      const sp = this.pan();
      let tc = te;
      for (let i = 0; i < n; i++) {
        this.compter(cloche(ctx, tc, f * alea(0.995, 1.005), 0.03 * (0.4 + 0.6 * proche) * alea(0.5, 1), sp));
        tc += alea(0.3, 0.65);
      }
    });

    const tauxPilon = 0.12 * vie * proche * jour * couvre;
    this.fPilon.avancer(t, horizon, tauxPilon, (te) => {
      if (!limite || te < this.finPilon) return;
      const n = Math.floor(alea(3, 8));
      const per = alea(0.55, 0.75);
      const sp = this.pan();
      const a = 0.09 * vie * proche;
      for (let i = 0; i < n; i++) this.pilon(te + i * per + alea(0, 0.03), a * alea(0.7, 1), sp);
      this.finPilon = te + n * per + 1;
    });

    // grillons : trains de 2 à 4 impulsions
    if (this.grillonA.active) this.fGrillonA = this.stridule(this.pulsA, this.fGrillonA, t, horizon, 0.7);
    if (this.grillonB.active) this.fGrillonB = this.stridule(this.pulsB, this.fGrillonB, t, horizon, 1.1);
  }

  private compter(v: Voix | { voix: Voix }): void {
    this.enCours++;
    (v instanceof Voix ? v : v.voix).quandFini(() => this.enCours--);
  }

  private pilon(t: number, a: number, dest: AudioNode): void {
    const v = new Voix();
    const o = v.src(this.ctx.createOscillator());
    const g = v.n(this.ctx.createGain());
    g.gain.value = 0;
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.12);
    const fin = enveloppe(g.gain, t, 0.004, a, 0.14);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(fin);
    this.compter(v);
    this.compter(eclat(this.ctx, this.bruitTampon, t, 'lowpass', 900, 0.7, 0.002, a * 0.5, 0.04, dest));
  }

  private stridule(p: GainNode, prochain: number, t: number, horizon: number, periode: number): number {
    if (prochain < t) prochain = t + alea(0, 0.3);
    while (prochain < horizon) {
      const n = choisir([2, 3, 3, 4]);
      let tp = prochain;
      for (let i = 0; i < n; i++) {
        p.gain.setValueAtTime(0, tp);
        p.gain.linearRampToValueAtTime(1, tp + 0.004);
        p.gain.setValueAtTime(1, tp + 0.011);
        p.gain.linearRampToValueAtTime(0, tp + 0.016);
        tp += 0.03;
      }
      prochain += periode * alea(0.75, 1.3);
    }
    return prochain;
  }
}
