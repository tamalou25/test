# Séguia : crédits et licences

Date de vérification : 2026-11-18. Les versions et lignes de copyright ci-dessous ont été relevées dans `node_modules/`, dans le build produit par `npx vite build` et dans `release/Seguia-v1.0.0-win64.zip`.

## Séguia

Conception, code, modèles 3D, sons, musique et textes créés pour ce projet (2026). Auteur du projet : Gary. Séguia est un logiciel propriétaire (`"license": "UNLICENSED"` dans `package.json`) ; seuls les composants tiers listés ci-dessous suivent leurs propres licences.

## Composants redistribués

Contenu du ZIP joueur : `Seguia.exe` (Electron + Chromium), `resources/app.asar` (bundle JS du jeu, polices, modèles 3D), `LICENSE`, `LICENSES.chromium.html`, `LISEZMOI.txt` et ce fichier `CREDITS.md`.

| Composant | Version | Licence | Titulaire | Obligation à respecter | Où elle est satisfaite dans le ZIP |
|---|---|---|---|---|---|
| three.js (cœur + `three/addons` : `GLTFLoader`, `EffectComposer`, `RenderPass`, `ShaderPass`, `OutputPass`, `UnrealBloomPass`), empaqueté dans le bundle JS | 0.187.0 | MIT | « three.js authors » | Inclure l'avis de copyright et le texte MIT dans toutes les copies ou parties substantielles | Le bundle Vite ne conserve aucun avis (aucun `@license` ni `Copyright` dans le JS). À satisfaire par le texte reproduit plus bas : `CREDITS.md` doit être livré à la racine du ZIP (voir « Points à vérifier ») |
| Electron | 45.3.4 | MIT | « Electron contributors » et « GitHub Inc. » | Inclure l'avis de copyright et la licence | Fichier `Seguia/LICENSE` du ZIP (présent, commence par `Copyright (c) Electron contributors` / `Copyright (c) 2013-2020 GitHub Inc.`) |
| Chromium et ses dépendances (embarqués dans Electron) | celle d'Electron 45.3.4 | Licences multiples (BSD, MIT, Apache, etc.) | Chromium Authors et tiers | Livrer les avis de toutes les licences des composants embarqués | Fichier `Seguia/LICENSES.chromium.html` du ZIP (présent, 5,7 Mo) |
| Fraunces (variable, sous-ensembles woff2 : latin, latin-ext, vietnamese) via `@fontsource-variable/fraunces` | 5.3.0 (paquet) | SIL OFL 1.1 | « The Fraunces Project Authors (github.com/undercasetype/Fraunces) » | Copie de chaque police avec l'avis de copyright et la licence (clause 2) ; ne pas vendre la police seule (clause 1) ; pas de licence autre que l'OFL pour la police (clause 5) | Avis et texte OFL reproduits plus bas ; à livrer avec le jeu via `CREDITS.md` |
| Inter (variable, sous-ensembles woff2 : latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext, vietnamese) via `@fontsource-variable/inter` | 5.3.0 (paquet) | SIL OFL 1.1 | « The Inter Project Authors (https://github.com/rsms/inter) » | Idem | Idem |
| Modèles 3D `public/assets/models/*.glb` (32 fichiers) | n/a | Création originale (voir plus bas) | Gary | Aucune | n/a |

Aucune des deux polices ne déclare de « Reserved Font Name » dans son fichier LICENSE ; les polices sont embarquées sans modification (les sous-ensembles woff2 sont ceux publiés par Fontsource).

Autres paquets de `devDependencies` utilisés à la compilation mais absents du ZIP : voir le tableau suivant. `@types/three` ne sert qu'au typage et n'est pas redistribué.

## Avis de droit d'auteur à reproduire

### three.js (r187, paquet 0.187.0), texte lu dans `node_modules/three/LICENSE`

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Electron et Chromium

Déjà dans le ZIP : `LICENSE` (Electron, MIT) et `LICENSES.chromium.html` (Chromium). Ne pas les retirer ni les renommer.

### Polices Fraunces et Inter

Avis de copyright, tels qu'ils figurent dans les fichiers `LICENSE` des paquets :

```
Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces)
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
```

Ces deux polices sont distribuées sous la licence suivante (texte identique dans les deux paquets) :

```
This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

Position de l'OFL pour un jeu commercial (FAQ officielle, https://openfontlicense.org/ofl-faq/) : les polices peuvent être embarquées dans un logiciel ou un jeu vendu, original ou modifié ; seules les parties issues de la police doivent rester sous OFL, le code du jeu reste propriétaire ; interdit : vendre la police seule. Séguia ne vend pas les polices seules.

## Outils de fabrication (non redistribués)

| Outil | Version | Licence | Pourquoi elle ne s'applique pas au jeu livré |
|---|---|---|---|
| Vite | 8.3.8 | MIT | Outil de build ; son code n'est pas dans le ZIP (le bundle produit ne contient que three et le code du jeu, voir ci-dessus) |
| TypeScript | 7.0.2 | Apache-2.0 | Compilateur, non livré |
| Vitest | 5.1.1 | MIT | Tests, non livré |
| tsx | 4.23.15 | MIT | Exécution de scripts, non livré |
| @electron/packager | 20.3.0 | BSD-2-Clause | Outil de packaging ; le ZIP ne contient que le résultat |
| @types/three | 0.187.0 | MIT | Types uniquement, supprimés à la compilation |
| Playwright | 1.63.0 (installé dans `/opt/node-tools`, hors projet) | Apache-2.0 | Tests de rendu et captures, non livré |
| Blender, via le module Python `bpy` | 5.3.0 | GPL-3.0 (METADATA du paquet) | Génération des `.glb` par scripts. Le manuel officiel indique : « The GPL only applies to the Blender application and not the artwork you create with it ». Les `.glb` produits (exportés par « Khronos glTF Blender I/O v5.3.43 ») ne contiennent ni code de Blender ni son binaire ; `bpy` n'est pas livré |
| ImageMagick | 6.9.12-98 | Licence ImageMagick (permissive, Apache-2.0 compatible) | Traitement d'images pour captures et aperçus de travail, non livré |
| FFmpeg | 6.1.1 | LGPL-2.1+/GPL selon le build | Traitement de captures, non livré. Note : Electron embarque sa propre `ffmpeg.dll` (couverte par `LICENSES.chromium.html`) |

## Contenus originaux et mode de fabrication

- Modèles 3D : générés par des scripts Python/Blender dans `assets_src/`, exportés en `.glb` dans `public/assets/models/`. Aucun modèle tiers.
- Sons et musique : entièrement synthétisés à l'exécution par le code (`src/audio/`). Aucun fichier audio, aucun échantillon.
- Icônes : dessinées en SVG dans `src/ui/icones.ts`.
- Aucune image, texture ou police autre que celles listées plus haut.

## Contenu généré avec une IA (à déclarer en boutique)

Le code, les scripts de génération des modèles 3D, les textes d'interface et les documents du projet ont été produits avec l'assistant de programmation Claude Code (Anthropic), sous la direction de l'auteur. Aucun contenu n'est généré par IA pendant le jeu. Les modèles 3D sont issus de scripts, les sons sont synthétisés par le code.

Steam demande de déclarer le contenu pré-généré par IA livré aux joueurs (catégorie « Pre-Generated » du questionnaire de contenu) : https://partner.steamgames.com/doc/gettingstarted/contentsurvey

## Points à vérifier avant une mise en vente

1. **Fait le 2026-11-18 :** le ZIP a été reconstruit avec le jeu complet (bundle JS, 32 modèles, polices). Revérifier les versions listées ici à chaque nouveau build.
2. **Fait le 2026-11-18 :** `CREDITS.md` est copié à la racine du dossier du jeu par le script de build (contrôlé par la recette : `Seguia/CREDITS.md` présent dans le ZIP). Les avis MIT de three.js et OFL des polices accompagnent donc la distribution.
3. Relire les obligations de `LICENSES.chromium.html` au moment du build final et vérifier que `LICENSE` et ce fichier sont bien à la racine du dossier du jeu.
4. Déposer ou vérifier la disponibilité du nom « Séguia » (marque, noms de domaine, boutique).
5. Revérifier les versions (`package-lock.json`) et les licences au moment du build final ; mettre à jour ce fichier si une dépendance change.
6. Vérifier la version d'Electron livrée (45.3.4 dans le ZIP actuel) et l'état de ses correctifs de sécurité à la date de sortie.
7. Remplir honnêtement le questionnaire de contenu de la boutique (section IA ci-dessus).

## Sources

- Blender, manuel, « About Free Software and the GPL » : https://docs.blender.org/manual/en/latest/getting_started/about/license.html
- SIL OFL 1.1 et FAQ officielle : https://openfontlicense.org/ofl-faq/ ; texte : https://openfontlicense.org/open-font-license-official-text/
- Steamworks, questionnaire de contenu : https://partner.steamgames.com/doc/gettingstarted/contentsurvey
- three.js : https://threejs.org/ ; Electron : https://github.com/electron/electron ; Fontsource : https://fontsource.org/fonts/fraunces et https://fontsource.org/fonts/inter
