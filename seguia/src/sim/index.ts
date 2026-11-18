/** API publique de la simulation. */
export * from './types';
export { B, BATIMENTS, PRIORITE_PERSONNEL, type DefBatiment, type Categorie } from './balance';
export {
  creerPartie,
  calendrier,
  population,
  logements,
  batimentParId,
  casesDe,
  pourtourDe,
  idx,
  cx,
  cz,
  dans,
  canicule,
  tempeteEnCours,
  GRAINE_SCENARIO,
  PAS_DEPART,
  VERSION_ETAT,
} from './etat';
export { cacheDe, topologie, invalider, expositionApercu, type Cache } from './cache';
export { debitSource, facteurEvap, tauxPerte, besoinEau } from './eau';
export {
  appliquer,
  verifierConstruction,
  verifierCanal,
  verifierCloture,
  coutCanal,
  estDebloque,
  raisonVerrou,
  distancePiste,
  aEauPotable,
  logementsLibres,
  type Verification,
} from './commandes';
export { avancer, indiceArret, rechaufferCache, type ResultatPas } from './pas';
export {
  objectifs,
  conseil,
  detailRenommee,
  partReseauEnEau,
  partCanauxDegages,
  compterCasesVertes,
  batimentActif,
  NOM_PALIER,
  type Objectif,
  type DetailRenommee,
} from './progression';
export {
  serialiser,
  deserialiser,
  empreinte,
  lireMeta,
  metaDe,
  versObjet,
  depuisObjet,
  type Chargement,
  type MetaSauvegarde,
  type UiSauvegarde,
} from './sauvegarde';
