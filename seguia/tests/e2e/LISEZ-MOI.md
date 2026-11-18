# Tests pilotés

| Script | Rôle | Commande |
|---|---|---|
| `smoke.mjs` | Lancement de l'application empaquetée, protocole `app://`, sauvegardes sur disque, chemins à espaces et accents | `npm run smoke` |
| `recette.mjs` | Recette complète de la version distribuable (voir `BILAN.md`) | `npm run recette` |
| `video.mjs` | Captures de présentation et séquence vidéo, image par image | `node tests/e2e/video.mjs` |
| `heures.mjs` | Planche de contrôle de la lumière à huit heures de la journée | `node tests/e2e/heures.mjs` |
| `essai-souris.mjs` | Essai court des gestes à la souris sur le serveur de développement | `node tests/e2e/essai-souris.mjs` |
| `lib/pilote.mjs` | Pilote commun : clics, tracés, cadrage, rejeu d'un journal de commandes | — |

## Ce que les tests font à la souris, et ce qu'ils font par crochet

- **À la souris et au clavier** : menus, choix d'un outil, tracé d'une séguia, pose d'un bâtiment, réglages, sauvegarde et chargement, choix de la vocation, fermeture des écrans.
- **Par le crochet de test `window.__seguia`** (actif seulement avec `SEGUIA_TEST=1` ou `?test=1`) :
  - `avancer(n)` fait avancer la simulation de `n` pas, parce que le rendu logiciel du conteneur est trop lent pour attendre en temps réel ;
  - `geler(true)` fait que le temps ne s'écoule que par `avancer`, pour rejouer un journal de commandes au pas près ;
  - `jeu.commande(...)` applique une commande du journal d'un bot (la même fonction que celle appelée par l'interface) ;
  - `vue(...)` place la caméra ; `image(dt)` calcule une image exactement (vidéo).

## Rejeu des stratégies

`npm run journaux` fait jouer les bots `etape` et `grenier` sans affichage et consigne leurs commandes avec le pas où elles ont été appliquées. La recette rejoue ces commandes dans l'application empaquetée ; à la fin, l'empreinte de l'état doit être celle de la partie de référence. Les écrans de palier, de vocation et de victoire sont fermés par de vrais clics.

`video.mjs` attend un serveur qui sert une copie figée du jeu :

```bash
npx vite build --outDir build/apercu
```

```bash
npx vite preview --outDir build/apercu --port 4173 --strictPort
```
