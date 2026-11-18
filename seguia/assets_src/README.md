# Chaîne de production des modèles 3D — Séguia

Modèles procéduraux écrits en Python avec **bpy 5.3.0** (Blender 5.3 en module PyPI,
sans affichage), exportés en GLB à couleurs de sommets. Les règles (axes, unités,
matériaux, palette, budgets) sont dans [`CONVENTIONS.md`](CONVENTIONS.md) : figées.

## Prérequis
- Python **3.13** (`python3.13`), accès à PyPI (bpy ≈ 400 Mo, mis en cache par pip).
  Aucune bibliothèque système supplémentaire n'a été nécessaire sur Ubuntu 24.04.
- Pour les captures : Node 22, `three` dans `node_modules/`, Playwright avec Chromium
  (rendu logiciel SwiftShader, pas de GPU requis).

## Commandes
```bash
assets_src/build_assets.sh                    # tout reconstruire depuis zéro (crée .venv si absent)
assets_src/build_assets.sh maison_a palmier   # quelques modèles (le manifeste est fusionné)
assets_src/build_assets.sh --previews         # + captures large / rapprochée dans assets_src/previews/
assets_src/.venv/bin/python assets_src/models/maison_a.py   # un modèle, à la main
python3 assets_src/tools/check_glb.py         # contrôle des GLB livrés contre les conventions
node scripts/shot-model.mjs maison_a /tmp/m.png [--close] [--night] [--az 200] [--el 60] [--zoom 0.8]
```
Sorties : `public/assets/models/<nom>.glb`, `public/assets/models/manifest.json`,
`assets_src/blend/<nom>.blend` (scène inspectable dans Blender).

## Organisation
| Chemin | Rôle |
|---|---|
| `lib/palette.py` | palette de CONVENTIONS.md, conversion sRGB → linéaire, `mix_srgb` |
| `lib/model.py` | `Model` (nœuds, bmesh par nœud, contexte `with m.using(node=, mat=)`) et `Piece` (transformations, couleur, lissage, chanfrein, `no_ao`, `no_cast`, `taper`…) |
| `lib/prims.py` | primitives : `box` (subdivisée, faces omissibles), `lathe`, `cylinder`, `cone`, `dome`, `sphere`, `jar`, `tube`, `beam`, `log_end`, `prism`, `arch_wall` (arc outrepassé percé), `cloth`, `frond`, `ladder`, `parapet` |
| `lib/archi.py` | architecture de terre : `earth_block`, `roof`, `door`, `window`, `beam_ends`, `spout`, `rug`, `basket`, `tower`, `arcade`, `lantern`, `awning`, `water`, `barrel_vault` |
| `lib/nature.py` | `rock` (grès tabulaire facetté), `tuft` (roseaux) |
| `lib/shading.py` | occlusion ambiante + dégradé vertical cuits dans les couleurs de sommets |
| `lib/export.py` | contrôles, objets Blender, export GLB, `.blend`, manifeste |
| `models/<nom>.py` | un script par modèle ; `maison_a.py` est le gabarit |
| `tools/check_glb.py` | validation des GLB (nœuds, matériaux, COLOR_0, emprise, budgets) |

## Ajouter un modèle (ex. `maison_b`)
1. Copier `models/maison_a.py` en `models/maison_b.py`, changer `NAME`, `FOOTPRINT`, `BUDGET`.
2. Ajuster `PARAMS` puis les fonctions de composition (`corps`, `ouvertures`, `poutres`,
   `details_facade`, `details_toit`). Construire en **coordonnées du jeu** : +Y haut,
   +Z façade, origine au centre de l'emprise au sol. Jamais d'axes Blender.
3. Toute pièce doit recevoir une couleur (`.color("pise")`, `.color_fn(...)`) ; sinon
   elle reste **magenta** et l'export échoue.
4. Matériaux : `with m.using(mat="lumiere"):` / `"tissu"` ; l'eau via `archi.water(...)`
   (crée le nœud `eau`). Parties animées : `m.node("bras", origine_pivot)` puis
   `with m.using(node="bras"):`.
5. `finalize(build(), ao=dict(...))` : l'export **échoue (code 2)** si hors emprise
   (marge 0,06), sous le sol, au-delà du budget, ou s'il reste du magenta.
6. `assets_src/build_assets.sh maison_b --previews`, puis **regarder les deux PNG**.

## Couleurs (piège sRGB / linéaire)
Les hex sont sRGB. `lib/palette.linear()` les convertit en linéaire, stockés dans un
attribut `FLOAT_COLOR` de domaine CORNER ; l'exporteur les écrit tels quels dans COLOR_0,
que three.js lit comme linéaire. Vérifié à l'écran (pisé rendu #CC8E56 pour #C98A5E, palme #508F2E pour #4F8F3A sous
la lumière de `shot-model`, face éclairée ; les blancs sont comprimés par ACES, attendu).
Ne jamais passer d'hex directement à un attribut, ni utiliser `BYTE_COLOR`.
Les variations (±4 % par élément, ±1,5 % par face) se font en sRGB.

## Occlusion
`lib/shading.py` lance par COIN de face des rayons (BVH mathutils) dans l'hémisphère de
la normale, avec un sol infini en y = 0 et une atténuation linéaire par distance ;
le point de départ est rentré vers le centre de la face. Plus un dégradé clair vers le haut.
Réglages par modèle : `ao=dict(samples, max_dist, strength, height_grad)`.
Pourquoi pas la cuisson AO Cycles vers les sommets : elle fonctionne en bpy, mais
échantillonne exactement au sommet (noir ou rien dans les arêtes concaves), n'a pas de
portée réglable et ne permet pas les exclusions ci-dessous. Le calcul maison est
déterministe et prend 0,1 à 2 s par modèle.

## Pièges rencontrés (à lire avant de décliner `maison_a`)
- **Une grande face = 4 coins** : l'occlusion n'existe qu'aux sommets. Un long muret dont
  les extrémités passent sous des cornes devient noir partout. → `cell=` sur `box`
  (grandes faces subdivisées), sol de terrasse séparé via `earth_block(parapet_t=...)`.
- **Sommets cachés** (sous un tapis, sous un acrotère) : on ignore les impacts sur faces vues
  de dos, sinon ils deviennent noirs et bavent sur les faces visibles voisines. Les objets
  posés sur une surface doivent donc être **sans fond** (`bottom=False`) ou fermés.
- **Petits détails sur grands triangles** (poutres, cadres de fenêtres) : leur occlusion sur
  un mur peu maillé fait des traînées diagonales. → `piece.no_cast()` (ils reçoivent l'AO
  mais n'en projettent pas). `archi.door/window/beam_ends` le font déjà.
- **Budget** : un chanfrein coûte ~32 triangles par boîte. Ne chanfreiner que ce qui se
  voit ; `skip=("-z",)` pour les faces collées à un mur. Les faces posées au sol et
  tournées vers le bas sont supprimées automatiquement à l'export.
- **Lissage** : `lathe`/`tube` lissent sous un angle (`smooth=`) ; pour 5 côtés il faut
  > 72° sinon facettes. Les boîtes sont plates (arêtes vives).
- `beam(a, b)` va bien de a vers b ; `arch_wall` : la face avant est +Z local ;
  `archi.arcade(a, b)` : la face avant regarde à DROITE du trajet a → b.
- Tout ce qui dépasse (potences de lanternes, appuis de fenêtres, échelle) doit rester
  dans l'emprise moins 0,06 : l'export le refuse sinon.
- Les fenêtres `lumiere` ont une teinte de jour **sombre** (baie), le moteur les allume la nuit.
- Matériau `tissu` = double face ; `vc` = simple face (le moteur remplace les matériaux
  par nom : ne pas compter sur `doubleSided` du GLB pour `vc`). Les fines lames
  (roseaux) sont donc doublées géométriquement.
- Logs bpy « Draco / MeshOptimizer is not available » : bruit sans conséquence (pas de
  Draco voulu). `build_assets.sh` les filtre.
- three.js découpe un nœud multi-matériaux en sous-maillages `<nom>_1`, `<nom>_2` au
  chargement : c'est le même nœud glTF.

## Budgets retenus quand CONVENTIONS.md n'en fixe pas
`fontaine` 900, `repartiteur` 1000, `bassin` / `citerne` / `source` 1500 (barème « maison »).
