# Conventions des modèles 3D — Séguia

Ces conventions sont FIGÉES : le moteur (three.js) s'appuie dessus.

## Univers et style
Oasis-relais imaginaire d'inspiration saharienne : architecture de terre crue (pisé), toits plats à acrotères,
poutres de palmier qui dépassent des murs, enduits de chaux, arcs outrepassés simples, textiles indigo / safran / garance,
lanternes de cuivre. Rendu « maquette » : formes lisibles de loin, volumes francs légèrement chanfreinés,
proportions un peu trapues, petits détails qui récompensent le zoom (jarres, tapis, échelles, linge, paniers de dattes).
Pas de textures images : tout passe par les COULEURS DE SOMMETS.

## Unités, axes, échelle
- 1 unité = 1 case de la grille (≈ 3 m). Un habitant mesure 0,50 unité, un chameau 0,70 au sommet de la bosse.
- Un étage de maison ≈ 0,85 à 1,0 unité. Un palmier adulte ≈ 3,0 unités.
- glTF : +Y vers le haut. La FAÇADE (porte) regarde vers +Z. Origine au CENTRE de l'emprise, au niveau du sol (y = 0).
- L'emprise est donnée en cases (largeur X × profondeur Z). Le modèle tient dans l'emprise avec une marge de 0,06 par bord.
- Rien sous y = 0 sauf mention contraire (bassins : le fond peut descendre à y = -0,12).

## Matériaux (par NOM — le moteur les remplace)
- `vc`       : tout le reste. Couleur = couleur de sommet (attribut COLOR_0), rugosité élevée.
- `lumiere`  : fenêtres, lanternes, braseros. Le moteur les rend émissifs la nuit. Couleur de sommet = teinte de jour.
- `eau`      : surfaces d'eau (plan horizontal). Le moteur y met son matériau d'eau. Mettre ces faces dans un NŒUD séparé nommé `eau` (le moteur change sa hauteur).
- `tissu`    : auvents, drapeaux, linge. Le moteur les fait onduler au vent.
Un modèle = un nœud racine au nom du modèle ; nœuds enfants seulement pour les parties animées listées ci-dessous.

## Couleurs de sommets
- Attribut de couleur actif, domaine CORNER ou POINT, exporté en COLOR_0 (`export_vertex_color='ACTIVE'`).
- Intégrer un ombrage d'occlusion dans la couleur : assombrir creux, pieds de murs et dessous (cuisson AO ou « dirty vertex colors »), léger dégradé plus clair vers le haut.
- Ajouter de légères variations de teinte (±4 %) par face ou par élément pour éviter l'aplat.

## Palette (sRGB hex)
| Rôle | Couleurs |
|---|---|
| Pisé | `#C98A5E` base, `#DBA77C` clair, `#A8683F` sombre |
| Chaux | `#F3E9D8`, ombrée `#E2D2B8` |
| Pierre / maçonnerie | `#B8A58C`, sombre `#8F7D66` |
| Roche | `#9A6B4F`, sombre `#6E4A38` |
| Bois de palmier | `#7A5536`, sombre `#4F3523` |
| Palmes | `#4F8F3A`, sombres `#2F6B2E`, jeunes `#8DBB4A` |
| Terre humide / boue | `#7A5236`, `#5E3F2A` |
| Textiles | indigo `#2E4A8F`, safran `#E6A21E`, garance `#B8402E`, écru `#F2E8D5`, turquoise `#2A9D8F` |
| Cuivre | `#C8823A` ; lumière `#FFC56B` |
| Eau | `#2FB5B0` |
| Chameau | `#C9A06A`, sombre `#A07C4E` |
| Peau | `#B07850`, `#8A5A3C`, `#D29C72` |
| Dattes | `#8A4B2A`, `#C27A2C` |

## Budget de triangles
Maison ≤ 1 500 ; grand bâtiment ≤ 5 000 (caravansérail ≤ 8 000) ; palmier ≤ 350 ; chameau ≤ 700 ; habitant ≤ 220 ; accessoire ≤ 200.

## Liste des modèles (nom de fichier = `<nom>.glb` dans `public/assets/models/`)
| Nom | Emprise X×Z | Description | Nœuds animés |
|---|---|---|---|
| `maison_a` | 2×2 | Maison de pisé à un étage, toit-terrasse à acrotères, poutres, porte en bois, 2 fenêtres `lumiere`, échelle, jarres | — |
| `maison_b` | 2×2 | Maison à étage partiel (cube sur l'arrière), escalier extérieur, linge `tissu` | — |
| `maison_c` | 2×2 | Maison basse en L avec courette, auvent `tissu` safran, tapis | — |
| `fontaine` | 1×1 | Vasque de pierre octogonale avec bec, margelle, jarre | `eau` |
| `repartiteur` | 1×1 | Peigne répartiteur (kesria) : petit bassin de pierre rond bas, peigne à dents sur 4 côtés, hauteur ≤ 0,18 | `eau` |
| `bassin` | 3×2 | Abreuvoir des caravanes : bassin rectangulaire à murets bas, marches, 4 poteaux d'attache, auge | `eau` |
| `citerne` | 2×2 | Citerne maçonnée à demi couverte d'une voûte, escalier, vanne en bois | `eau` |
| `caravanserail` | 3×3 | Enceinte carrée à cour, porche à arc outrepassé côté +Z, tours d'angle basses, galerie à arcades, auvents `tissu`, lanternes `lumiere` | — |
| `briqueterie` | 2×2 | Four à briques, rangées de briques qui sèchent, fosse de boue, moule | — |
| `puits` | 1×1 | Puits à margelle avec chadouf (balancier) | `bras` (pivote autour de X à son origine) |
| `brise_vent` | 1×1 | Segment de clôture de palmes sèches (afreg), aligné sur X, traversant la case de bord à bord, hauteur 0,55 | — |
| `haie` | 1×1 | Segment de haie de tamaris, aligné sur X, hauteur 0,6 | — |
| `hammam` | 3×2 | Bains : 2 coupoles à oculi `lumiere`, cheminée, bassin d'entrée | `eau` |
| `fanal` | 1×1 | Tour de guet haute (2,6) avec brasero `lumiere` au sommet, échelle | — |
| `sechoir` | 2×2 | Séchoir à dattes : claies en étages, toile d'ombrage `tissu`, paniers de dattes | — |
| `noria` | 1×1 | Roue à godets verticale sur bâti de bois | `roue` (tourne autour de Z à son origine) |
| `source` | 2×2 | Bouche de foggara : affleurement rocheux, ouverture voûtée sombre côté +Z, petite vasque | `eau` |
| `palmier` | — | Palmier-dattier adulte, hauteur 3,0, tronc annelé légèrement courbe, 9 à 11 palmes arquées, régimes de dattes. Origine au pied. Les palmes dans un nœud `palmes`, le tronc dans `tronc` | `palmes` |
| `chameau` | — | Dromadaire stylisé, longueur 0,95 selon +Z (tête vers +Z), hauteur 0,70. Corps+cou+tête dans `corps` ; 4 pattes séparées `patte_avg`, `patte_avd`, `patte_arg`, `patte_ard` (origine de chaque patte à la hanche) ; chargement (sacs, tapis) dans `charge` | pattes |
| `habitant` | — | Personnage 0,50 de haut : robe longue (couleur de sommet BLANCHE pour être teintée par le moteur) dans `robe`, tête + chèche dans `tete` | — |
| `tente` | 2×2 | Tente de caravanier en toile `tissu` rayée, piquets | — |
| `etal` | 1×1 | Étal de marché avec auvent `tissu`, paniers | — |
| `jarre`, `panier`, `sacs`, `tapis`, `lanterne` | — | Accessoires (≤ 0,3 de haut ; lanterne sur pied 0,6 avec `lumiere`) | — |
| `rocher_a`, `rocher_b`, `rocher_c` | — | Rochers de grès 0,3 à 0,8 | — |
| `touffe`, `roseaux`, `buisson` | — | Végétation spontanée basse (0,10 à 0,35) | — |

## Reproductibilité
- Chaque modèle a son script `assets_src/models/<nom>.py` qui s'appuie sur la bibliothèque commune `assets_src/lib/`.
- `assets_src/build_assets.sh` reconstruit tout : `.blend` dans `assets_src/blend/`, `.glb` dans `public/assets/models/`,
  et `public/assets/models/manifest.json` (nom, emprise, nœuds, nombre de triangles, boîte englobante).
