# Recette de la version distribuable

51 vérifications réussies sur 51.

| Section | Vérification | Résultat | Détail |
|---|---|---|---|
| ZIP Windows | extraction dans un chemin avec espaces et accents | OK | /tmp/seguia-recette-y2TlL3/Jeux de Gary/Séguia version 1 |
| ZIP Windows | un seul dossier racine « Seguia » | OK |  |
| ZIP Windows | point d’entrée Seguia.exe (PE32+ x86-64) | OK |  |
| ZIP Windows | contient LISEZMOI.txt | OK |  |
| ZIP Windows | contient CREDITS.md | OK |  |
| ZIP Windows | contient LICENSE | OK |  |
| ZIP Windows | contient LICENSES.chromium.html | OK |  |
| ZIP Windows | contient resources/app.asar | OK |  |
| ZIP Windows | contient locales/fr.pak | OK |  |
| ZIP Windows | taille du ZIP | OK | 139.9 Mo |
| ZIP Windows | même app.asar (code et ressources du jeu) dans le ZIP Windows et dans le paquet testé | OK | 4affc5f95e3e8b08 |
| Lancement | page servie par app://seguia/ | OK | app://seguia/index.html |
| Lancement | menu principal affiché | OK |  |
| Parcours | nouvelle partie lancée par le menu | OK | pas 140, 4 habitants |
| Parcours | séguia tracée à la souris (8 cases payées) | OK | pièces 102 |
| Parcours | jardin posé à la souris | OK | bâtiments 3 |
| Parcours | placement refusé : cause et remède affichés | OK | Une séguia passe ici.Posez le bâtiment à côté du canal : il s’y branche tout seul. |
| Parcours | premier effet visible (jardin irrigué, sol qui verdit) en moins de 2 minutes de jeu | OK | 9.1 s à vitesse ×1 |
| Parcours | fontaine, maisons, second jardin et bassin posés à la souris | OK | 8 bâtiments, 31 pièces |
| Parcours | réglage par l’interface (commande de matériaux à 0) | OK |  |
| Reprise | une caravane fait halte et boit au bassin | OK | abreuvage |
| Reprise | la caravane est en train de boire au moment de la sauvegarde | OK | 26.4 / 88 u bues |
| Reprise | Échap ouvre le menu de pause | OK |  |
| Reprise | fichier de sauvegarde écrit sur disque | OK | /tmp/seguia-recette-y2TlL3/Données du joueur é/Seguia/saves/manuel1.json |
| Reprise | l’écran indique où sont les sauvegardes | OK | Dossier des sauvegardes : /tmp/seguia-recette-y2TlL3/Données du joueur é/Seguia/saves |
| Reprise | fermer la fenêtre enregistre la partie en cours (sauvegarde automatique) | OK | pas 999 dans auto.json, pas 999 à la fermeture |
| Reprise | après relance, « Continuer » est proposé (sauvegarde automatique) | OK |  |
| Reprise | état identique après fermeture et relance (empreinte) | OK | a44dcac2c6e710a1 = a44dcac2c6e710a1 |
| Reprise | caravane reprise au même point | OK | pas 979, 26.4 u bues, 31 pièces |
| Reprise | la caravane est comptée une seule fois | OK | servies 1 |
| Reprise | le paiement est appliqué une seule fois | OK | +46 pièces (attendu +46 : 4 chameaux × 4 + prime de palier 30) |
| Fichier abîmé | la version précédente est gardée en .bak | OK |  |
| Fichier abîmé | l’emplacement est signalé illisible, avec sa copie | OK | Emplacement 2 Fichier illisible — une copie de secours existe Copie de secours |
| Fichier abîmé | la copie de secours se charge et la partie reprend | OK | pas 1381 |
| Fichier abîmé | fichier modifié refusé avec un message clair | OK | Chargement impossible La sauvegarde a été modifiée ou abîmée (somme de contrôle incorrecte).  Aucune copie de secours n’existe pour cet emplacement.   |
| Parcours | aucune erreur JavaScript pendant le parcours | OK |  |
| Stratégies | etape : partie rejouée dans l'application, identique à la référence (empreinte) | OK | 1daa00bb3a39dd5d = 1daa00bb3a39dd5d |
| Stratégies | etape : écrans de palier, de vocation et de victoire affichés | OK | palier, vocation, victoire |
| Stratégies | etape : objectif final atteint (victoire) | OK | jour 35, renommée 124 |
| Stratégies | grenier : partie rejouée dans l'application, identique à la référence (empreinte) | OK | de4fe45a3a6fac54 = de4fe45a3a6fac54 |
| Stratégies | grenier : écrans de palier, de vocation et de victoire affichés | OK | palier, vocation, victoire |
| Stratégies | grenier : objectif final atteint (victoire) | OK | jour 31, renommée 162 |
| Stratégies | les deux parties partent du même état initial | OK | 53bc829d0a9e162e |
| Stratégies | résultats visiblement différents | OK | dattes vendues 380 / 1025 ; caravanes bien reçues 15 / 11 |
| Affichage | fenêtre 1366×768 | OK | 1366×768 |
| Affichage | interface lisible à 1366×768 (rien ne déborde, rien ne se recouvre) | OK | objectifs 268 px, barre de construction 843 px |
| Affichage | fenêtre 1920×1080 | OK | 1920×1080 |
| Affichage | interface lisible à 1920×1080 (rien ne déborde, rien ne se recouvre) | OK | objectifs 292 px, barre de construction 843 px |
| Affichage | charge de rendu d’une grande oasis sous 250 appels de dessin et 400 000 triangles (visé au départ : 150 et 300 000) | OK | 209 appels, 343235 triangles |
| Affichage | aucun modèle 3D manquant | OK |  |
| Parcours | aucune erreur JavaScript pendant la recette | OK |  |

## Mesures

```json
{
  "premierEffetSecondes": 9.1,
  "reprise": {
    "piecesAvant": 31,
    "piecesApres": 77,
    "chameaux": 4
  },
  "strategies": {
    "etape": {
      "jour": 40,
      "an": 3,
      "palier": 3,
      "vocation": "etape",
      "habitants": 40,
      "pieces": 2036,
      "materiaux": 296,
      "vivres": 59,
      "dattes": 9,
      "renommee": 124,
      "renCaravanes": 86,
      "renVerdure": 10,
      "renDattes": 10,
      "casesVertes": 158,
      "caravanesServies": 15,
      "caravanesPartielles": 9,
      "caravanesManquees": 1,
      "dattesVendues": 380,
      "jardinsPerdus": 25,
      "palmiersPerdus": 9,
      "habitantsPartis": 10,
      "eauUtilePct": 58,
      "eauEvaporeePct": 9,
      "eauDeverseePct": 32,
      "reseauEnEauPct": 82,
      "victoireJour": 34
    },
    "grenier": {
      "jour": 40,
      "an": 3,
      "palier": 3,
      "vocation": "grenier",
      "habitants": 44,
      "pieces": 1557,
      "materiaux": 354,
      "vivres": 57,
      "dattes": 930,
      "renommee": 162,
      "renCaravanes": 45,
      "renVerdure": 31,
      "renDattes": 64,
      "casesVertes": 174,
      "caravanesServies": 11,
      "caravanesPartielles": 12,
      "caravanesManquees": 0,
      "dattesVendues": 1025,
      "jardinsPerdus": 2,
      "palmiersPerdus": 6,
      "habitantsPartis": 2,
      "eauUtilePct": 61,
      "eauEvaporeePct": 10,
      "eauDeverseePct": 29,
      "reseauEnEauPct": 100,
      "victoireJour": 30
    }
  },
  "fluidite": {
    "leger": 12,
    "equilibre": 11,
    "appelsDeDessin": 209,
    "triangles": 343235,
    "scene": "oasis du jour 40 (stratégie grenier), vue moyenne, 1366×768",
    "configuration": "conteneur sans carte graphique, rendu logiciel SwiftShader, 4 cœurs"
  }
}
```
