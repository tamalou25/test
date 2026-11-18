import { describe, expect, it } from 'vitest';
import { creerMoteurAudio } from '../../src/audio/index';
import type { EtatSonore, NomEffet } from '../../src/audio/types';

const ETAT: EtatSonore = {
  saison: 2,
  lumiere: 0.8,
  tempete: 0.5,
  canicule: true,
  proximite: 0.7,
  eauProche: 0.5,
  verdureProche: 0.5,
  vieProche: 0.5,
  caravane: true,
  pause: false,
  vitesse: 2,
};

const EFFETS: NomEffet[] = [
  'clic', 'survol', 'poser', 'canal', 'refus', 'demolir', 'annuler', 'eau_arrive', 'recolte',
  'pieces', 'chantier_fini', 'caravane', 'habitant', 'alerte', 'objectif', 'palier', 'victoire',
];

describe('moteur audio sans WebAudio (Node)', () => {
  it("n'expose pas d'AudioContext dans cet environnement", () => {
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();
  });

  it('toutes les méthodes sont appelables avant démarrage sans lever', () => {
    const m = creerMoteurAudio();
    expect(m.demarre).toBe(false);
    expect(() => {
      m.maj(ETAT, 0.016);
      for (const e of EFFETS) m.jouer(e);
      m.reglerVolumes({ general: 0.5, musique: 0.5, ambiance: 0.5, effets: 0.5 });
      m.suspendre();
      m.reprendre();
    }).not.toThrow();
  });

  it('devient un moteur muet après démarrer et respecte l’interface', async () => {
    const m = creerMoteurAudio();
    await expect(m.demarrer()).resolves.toBeUndefined();
    await m.demarrer(); // second appel sans effet
    expect(typeof m.demarre).toBe('boolean');
    expect(() => {
      for (let i = 0; i < 100; i++) m.maj({ ...ETAT, lumiere: i / 100 }, 0.016);
      for (const e of EFFETS) m.jouer(e, 0.5);
      m.jouer('canal', Number.NaN);
      m.maj({ ...ETAT, proximite: Number.NaN } as EtatSonore, Number.POSITIVE_INFINITY);
      m.reglerVolumes({ general: Number.NaN, musique: 2, ambiance: -1, effets: 1 });
      m.suspendre();
      m.suspendre();
      m.reprendre();
      m.detruire();
      m.detruire();
      m.maj(ETAT, 0.016);
      m.jouer('victoire');
    }).not.toThrow();
  });

  it('un contexte injecté défaillant rend aussi un moteur muet', async () => {
    const m = creerMoteurAudio({ contexte: {} as BaseAudioContext });
    const avant = console.warn;
    console.warn = () => {};
    try {
      await expect(m.demarrer()).resolves.toBeUndefined();
    } finally {
      console.warn = avant;
    }
    expect(() => {
      m.maj(ETAT, 0.1);
      m.jouer('alerte');
      m.detruire();
    }).not.toThrow();
  });
});
