# Séguia — construire le jeu

Tout se fait depuis ce dossier. Le ZIP Windows se fabrique sous Linux (ou sous Windows), sans Wine.

## Prérequis

| Outil | Version utilisée | Rôle |
|---|---|---|
| Node.js | 22 | build, tests |
| npm | 10 | dépendances |
| `zip`, `unzip`, `file`, `curl` | ceux du système | archive et contrôles |
| ImageMagick (`convert`) | 6.9 | icône `.ico` |
| Python | 3.13 | uniquement pour refaire les modèles 3D (Blender `bpy` 5.3.0) |
| Xvfb + Playwright (Chromium) | 1.63 | uniquement pour les tests pilotés |

Accès réseau nécessaire au premier build : registre npm, et `github.com/electron/electron/releases/download/` pour le binaire Electron (mis en cache dans `build/electron-zips/`, somme SHA-256 vérifiée).

## Commandes

```bash
npm install
```

```bash
npm run build:win
```

Produit `release/Seguia-v1.0.0-win64.zip` : un dossier `Seguia/` avec `Seguia.exe`, `LISEZMOI.txt`, `CREDITS.md` et les fichiers d'Electron. Le build est reproductible : deux builds des mêmes sources donnent le même ZIP.

```bash
npm test
```

Tests de la simulation, des sauvegardes et du moteur audio muet (37 tests).

```bash
npm run dev
```

Jeu dans un navigateur sur `http://127.0.0.1:5173/` pendant le développement (sauvegardes dans le stockage du navigateur).

## Tests pilotés de la version empaquetée

```bash
npm run build:linux-test
```

```bash
npm run smoke
```

```bash
npm run journaux
```

```bash
npm run recette
```

- `build:linux-test` empaquette les mêmes sources pour Linux dans `build/linux-test/` (jamais livré).
- `smoke` vérifie le lancement, le protocole `app://`, l'écriture des sauvegardes et les chemins à espaces et accents.
- `journaux` fait jouer les deux stratégies de référence sans affichage et consigne leurs commandes.
- `recette` extrait le ZIP Windows, vérifie son contenu, puis pilote la version Linux à la souris : premières minutes, sauvegarde pendant qu'une caravane boit, relance, fichier abîmé, deux stratégies rejouées jusqu'à la victoire, résolutions. Rapport dans `build/recette/rapport.md`.

## Modèles 3D

```bash
assets_src/build_assets.sh
```

Recrée le venv Python, installe `bpy`, régénère les 32 modèles (`public/assets/models/*.glb`), leurs fichiers `.blend` (`assets_src/blend/`) et le manifeste. Voir `assets_src/README.md` et `assets_src/CONVENTIONS.md`.

```bash
node scripts/shot-model.mjs maison_a apercu.png
```

Rend un modèle seul pour le contrôler à l'image.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/sim/` | Simulation pure et déterministe : eau, cultures, sable, population, caravanes, progression, sauvegarde. Chiffres d'équilibrage dans `balance.ts`. |
| `src/render/` | Scène three.js : terrain, séguias, bâtiments, personnages, ciel, tempête, caméra, post-traitement. |
| `src/ui/` | Interface en HTML/CSS : HUD, écrans, icônes. |
| `src/audio/` | Son entièrement synthétisé (WebAudio). |
| `src/jeu/` | Boucle de jeu, entrées du joueur, sauvegardes, états des bâtiments. |
| `src/platform/`, `electron/` | Stockage des sauvegardes, fenêtre, protocole `app://`. |
| `tests/` | Tests unitaires, bots de stratégie, tests pilotés. |

## Équilibrage

```bash
npm run bots
```

Fait jouer trois stratégies (étape, grenier, négligent) sur 40 jours depuis la même carte et affiche un tableau comparatif.

## Sauvegardes

- Windows : `%APPDATA%\Seguia\saves\` (`auto.json`, `manuel1.json` à `manuel3.json`, `reglages.json`, et leurs copies `.bak`).
- La variable d'environnement `SEGUIA_USERDATA` déplace ce dossier (tests).
- Format : JSON versionné avec somme de contrôle (`src/sim/sauvegarde.ts`). Pour changer le format, augmenter `VERSION_ETAT` et ajouter une fonction dans `MIGRATIONS`.

## Limites du build

- L'exécutable n'est pas signé : Windows affiche un avertissement SmartScreen au premier lancement.
- L'icône de l'exécutable vient de `assets_src/icon.png` s'il existe ; sinon c'est celle d'Electron.
