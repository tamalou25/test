# Séguia — bilan de la V1

*18 novembre 2026. Tout ce qui est écrit « vérifié » ci-dessous l'a été par un test réellement exécuté ; ce qui n'a pas pu l'être est dit à la fin.*

## 1. Ce qui est livré

| Élément | Chemin |
|---|---|
| Jeu Windows (ZIP, 140 Mo) | `release/Seguia-v1.0.0-win64.zip` |
| Sources (code, scripts Blender, modèles, tests, documents) | `release/Seguia-v1.0.0-sources.zip` |
| Captures prises dans le jeu | `release/captures/` |
| Séquence de jeu | `release/Seguia-sequence-de-jeu.mp4` |
| Concept et arbitrages | `CONCEPT.md` |
| Positionnement et test commercial | `VENTE.md` |
| Crédits, licences, part générée par IA | `CREDITS.md` |
| Construire et tester | `BUILD.md` |
| Notice du joueur (aussi dans le ZIP) | `LISEZMOI.txt` |
| Rapport de recette détaillé | `release/recette-rapport.md` |

## 2. Comment jouer

1. Décompresser le ZIP, ouvrir le dossier `Seguia`, double-cliquer sur `Seguia.exe`.
2. Au premier lancement, Windows affiche « Windows a protégé votre ordinateur » (exécutable non signé) : « Informations complémentaires », puis « Exécuter quand même ».
3. Nouvelle partie → suivre le conseil en haut à gauche : tracer une séguia depuis la source, poser un jardin contre le canal.

Aucune installation, aucun compte, aucune connexion. Sauvegardes dans `%APPDATA%\Seguia\saves`.

## 3. Le jeu en une minute

- **Mécanique centrale** : l'eau est un débit qu'on partage. Elle ne remonte jamais, se perd en route, et l'amont boit d'abord. Le répartiteur règle la part de chaque branche.
- **Arbitrage récurrent** : avant chaque événement annoncé (caravane, canicule, tempête), choisir qui boit : bassin, jardins, palmeraie ou citerne.
- **Progression** : La première eau → Le relais (choix d'une vocation) → L'oasis renommée (120 de renommée après la grande tempête), puis mode libre.
- **Rejouer** : l'autre vocation, une carte au hasard, une année sèche.
- **Contenu** : 14 bâtiments, 2 types de séguia, 2 brise-vent, 3 saisons, cycle jour/nuit, tempêtes et canicules, 32 modèles 3D, son et musique synthétisés.

## 4. Tests exécutés et résultats

### Tests automatiques (`npm test`) : 142 réussis sur 142

| Sujet | Ce qui est vérifié |
|---|---|
| Eau | Bilan exact à chaque pas (entrées = évaporation + consommation + déversement), l'eau ne remonte pas, l'amont est servi d'abord, poids du répartiteur, citerne, 150 réseaux tirés au hasard, canal ensablé |
| Règles | Chaque refus de placement donne sa cause et un remède, annulation remboursée, jardin qui verdit puis meurt à sec, famine, brise-vent |
| Caravanes | Paiement compté une seule fois, caravane qui passe son chemin |
| Sauvegarde | Partie rechargée identique à la partie continue, fichier tronqué, modifié, étranger ou trop récent refusés avec un message, 50 cas de fichiers incohérents, en-tête recalculé |
| Scénarios | Deux vocations menées à la victoire, joueur négligent en retard, crise de sable et rétablissement, 10 années accélérées avec actions au hasard |
| Stockage | Écriture atomique, copie de secours, noms d'emplacement invalides |
| Audio | Le moteur reste muet sans carte son, sans jamais planter |

### Deux stratégies depuis la même carte (40 jours de jeu chacune)

| | Étape des caravanes | Grenier du désert | Joueur qui ne règle rien |
|---|---|---|---|
| Victoire | jour 35 | jour 31 | pas au jour 40 |
| Renommée au jour 40 | 124 | 162 | 90 |
| dont caravanes | 86 | 45 | 53 |
| dont dattes et verdure | 20 | 95 | 18 |
| Caravanes bien abreuvées | 15 | 11 | 9 |
| Dattes vendues | 380 | 1 025 | 374 |
| Jardins perdus | 25 | 2 | 10 |
| Eau évaporée | 9 % | 10 % | 19 % |

Causes observables : l'étape garde l'eau pour ses bassins et sacrifie des jardins pendant la canicule ; le grenier arrose d'abord ses cultures et reçoit moins bien les grosses caravanes ; sans répartiteur, citerne ni canal maçonné, le joueur négligent évapore deux fois plus d'eau.

### Crise et rétablissement (testé)

- La grande tempête, sans brise-vent, ensable plus de 40 % des séguias et coupe l'eau de l'aval.
- Corvée générale : réseau dégagé en moins d'un jour. Sans corvée et sans bras libres : plus de trois fois plus long.
- Des brise-vent posés avant la tempête réduisent l'ensablement des cases abritées de plus de 65 %.

### Recette de la version distribuable

Voir la section 5.

## 5. Recette de la version distribuable

**51 vérifications réussies sur 51** (`npm run recette`, détail dans `release/recette-rapport.md`).

Méthode : le ZIP Windows est extrait dans un dossier à espaces et accents et son contenu est contrôlé. Comme il n'y a pas de Windows ici, c'est le paquet Linux des mêmes sources qui est lancé et piloté ; son `app.asar` (code et ressources du jeu) est identique, octet pour octet, à celui du ZIP Windows. Les constructions se font à la souris ; le temps avance par un crochet de test, le rendu logiciel étant trop lent pour attendre.

| Vérification | Résultat |
|---|---|
| Contenu du ZIP (exécutable Windows 64 bits, notice, crédits, licences) | OK |
| Menu → nouvelle partie → séguia et jardin posés à la souris | OK |
| Placement refusé : cause et remède affichés | OK |
| Premier effet visible (jardin irrigué, sol qui verdit) | 9 s de jeu à vitesse ×1 |
| Sauvegarde pendant qu'une caravane boit (39,6 u sur 88) → fermeture → relance → chargement | Empreinte d'état identique |
| Caravane comptée une fois, paiement appliqué une fois | OK (+46 pièces = 16 de paiement + 30 de prime de palier) |
| Fermer la fenêtre enregistre la partie | OK |
| Fichier tronqué : signalé illisible, copie de secours chargée | OK |
| Fichier modifié : refusé avec un message clair | OK |
| Stratégie « étape » rejouée dans l'application jusqu'à la victoire | Empreinte identique à la référence, victoire jour 35 |
| Stratégie « grenier », depuis le même état initial | Empreinte identique à la référence, victoire jour 31 |
| Écrans de palier, de vocation et de victoire | Affichés et fermés par de vrais clics |
| Interface à 1366 × 768 et 1920 × 1080, caméra à trois distances | Rien ne déborde, rien ne se recouvre |
| Erreurs JavaScript pendant toute la recette | Aucune |

Mesure de fluidité, à lire avec prudence : 11 à 12 images par seconde, oasis du jour 40, vue moyenne, 1366 × 768, réglages « Léger » et « Équilibré », **en rendu logiciel sur 4 cœurs sans carte graphique**. Cette scène demande 209 appels de dessin et 343 000 triangles, au-dessus des 150 et 300 000 visés au départ.

## 6. Délégations

| Modèle | Mission | Résultat |
|---|---|---|
| Sonnet | Inventaire des outils et du réseau | Electron et Blender (`bpy`) téléchargeables, pas de GPU ni de Wine : a fixé le choix three.js + Electron |
| Sonnet | Veille marché (14 comparables, prix, démos) | Base de `VENTE.md` ; aucun jeu équivalent trouvé |
| Opus | Relecture d'architecture avant le code | Algorithme du solveur d'eau, règles de sauvegarde, 8 risques avec parades |
| Opus | Socle Electron, build Windows, test de fumée | ZIP reproductible, protocole `app://`, sauvegardes atomiques |
| Opus | Chaîne Blender et 10 modèles de référence | `assets_src/`, reconstruction complète vérifiée |
| Sonnet | 16 variantes (maisons, clôtures, accessoires, rochers) | Livrées, contrôlées à l'image |
| Opus | 6 bâtiments avancés (hammam, fanal, séchoir, noria, puits, briqueterie) | Livrés, pivots d'animation vérifiés |
| Opus | Moteur audio procédural | 17 effets, ambiances, musique ; niveaux mesurés, aucune saturation |
| Opus | Relecture de la cohérence des sauvegardes | 233 rechargements balayés sans divergence ; 6 défauts trouvés, tous corrigés |
| Sonnet | Licences et crédits | `CREDITS.md` ; a signalé que les avis de licence manquaient dans le ZIP (corrigé) |

J'ai gardé le concept, les règles, la simulation, le rendu, l'interface, l'intégration et les tests de la version assemblée. Trois agents au plus ont travaillé en même temps, sur des fichiers distincts.

Défauts trouvés par les relectures et corrigés : blocage si la partie était enregistrée pendant le choix de vocation ; deux sauvegardes simultanées pouvaient s'écrire dans le désordre ; un fichier abîmé pouvait remplacer la bonne copie de secours ; valeurs de cache lues par la simulation après un chargement ; en-tête de sauvegarde non vérifié ; fichiers incohérents acceptés.

## 6 bis. Limites vérifiées et vérifications bloquées

| Point | État | Cause |
|---|---|---|
| Lancement de `Seguia.exe` sous Windows 11 | **Non vérifié** | Pas de Windows ici. Essai sous Wine 9 : le processus démarre et crée `%APPDATA%\Seguia`, mais la fenêtre reste noire (`DCompositionCreateDevice3` non implémenté par Wine). Le PC « G2B » est listé mais ses dossiers ne sont pas utilisables depuis cette session. |
| Fluidité sur un PC de joueur | **Non mesurée** | Pas de carte graphique dans le conteneur. Les mesures de la section 5 sont en rendu logiciel et ne valent pas pour un PC. |
| Son | Mesuré, **jamais écouté** | Niveaux, saturation et spectres contrôlés ; le caractère de la musique reste à juger à l'oreille. |
| Plaisir de jeu | **Non testé par un humain** | L'équilibrage repose sur des bots. Le test de démo de `VENTE.md` est fait pour ça. |
| Taille du ZIP | 140 Mo | Electron embarque Chromium. |
| Avertissement SmartScreen | Attendu | Exécutable non signé. |
| Nom « Séguia » | Vérifié sur Steam seulement | Aucun registre de marques consulté. |

**Pour lever le premier point en deux minutes sur ton PC :** décompresse le ZIP dans un dossier dont le nom contient un espace, lance `Seguia.exe`, commence une partie, trace une séguia, appuie sur F5, ferme la fenêtre, relance et clique sur « Continuer ».

## 7. Mon avis sur la suite

Le projet mérite le test de démo de `VENTE.md`, pas plus pour l'instant. La mécanique tient debout, se lit à l'écran et produit des parties différentes selon la stratégie. Ce qui manque pour décider d'un investissement est précisément ce qui n'a pas pu être vérifié ici : le comportement sur un vrai PC et la réaction de dix vrais joueurs.
