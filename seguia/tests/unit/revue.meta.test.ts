/**
 * REVUE : l'en-tête `meta` (hors somme de contrôle) est affiché sans vérification dans l'écran des emplacements.
 * Un seul octet modifié dans `meta` laisse la sauvegarde « lisible » (deserialiser ok) mais fait lever l'écran.
 *   npx vitest run tests/unit/revue.meta
 */
import { describe, expect, it } from 'vitest';
import { creerPartie, deserialiser, GRAINE_SCENARIO, lireMeta, serialiser } from '../../src/sim';
import { htmlSauvegardes } from '../../src/ui/ecrans';

const texte = serialiser(creerPartie(GRAINE_SCENARIO), { vitesse: 1 }, '2026-11-18T10:00:00Z');

function ecran(t: string) {
  const meta = lireMeta(t);
  const illisible = !meta || !deserialiser(t).ok; // logique de Jeu.lignesEmplacements
  return htmlSauvegardes('charger', [{ slot: 'manuel1', nom: 'Emplacement 1', meta, existe: true, illisible, copie: true }] as any, '/tmp', true);
}

describe('revue : en-tête meta abîmé', () => {
  it('fichier sain : l’écran se construit', () => {
    expect(() => ecran(texte)).not.toThrow();
  });
  it('un octet changé dans meta.saison (0 → 7) : sauvegarde acceptée, écran des emplacements qui lève', () => {
    const t = texte.replace('"saison":0', '"saison":7');
    expect(t).not.toBe(texte);
    expect(deserialiser(t).ok).toBe(true); // la somme ne couvre pas meta
    expect(() => ecran(t)).not.toThrow();
  });
  it('meta.carte devenu un nombre : écran qui lève', () => {
    const b = JSON.parse(texte);
    b.meta.carte = 12;
    const t = JSON.stringify(b);
    expect(deserialiser(t).ok).toBe(true);
    expect(() => ecran(t)).not.toThrow();
  });
});
