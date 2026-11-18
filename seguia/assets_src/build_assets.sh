#!/usr/bin/env bash
# Reconstruit les modèles 3D de Séguia depuis zéro.
#
#   assets_src/build_assets.sh                 # tout : efface GLB/.blend/manifeste puis reconstruit
#   assets_src/build_assets.sh maison_a palmier  # seulement ces modèles (manifeste mis à jour)
#   assets_src/build_assets.sh --previews      # + captures large/rapprochée dans assets_src/previews/
#
# Crée assets_src/.venv (Python 3.13 + bpy) s'il est absent. Aucun affichage requis.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
VENV="$HERE/.venv"
PYTHON="${PYTHON:-python3.13}"
OUT="$ROOT/public/assets/models"
PREVIEWS=0
MODELS=()

for a in "$@"; do
  case "$a" in
    --previews) PREVIEWS=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) MODELS+=("$a") ;;
  esac
done

# --- environnement Python + bpy -------------------------------------------------
if [ ! -x "$VENV/bin/python" ]; then
  echo "== création du venv $VENV ($PYTHON)"
  "$PYTHON" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$HERE/requirements.txt"
fi
"$VENV/bin/python" -c "import bpy; print('== bpy', bpy.app.version_string)" 2>/dev/null

# --- liste des modèles -----------------------------------------------------------
if [ ${#MODELS[@]} -eq 0 ]; then
  for f in "$HERE"/models/*.py; do
    n="$(basename "$f" .py)"
    [[ "$n" == _* ]] && continue
    MODELS+=("$n")
  done
  echo "== reconstruction complète : nettoyage des sorties"
  rm -f "$OUT"/*.glb "$OUT/manifest.json" "$HERE"/blend/*.blend "$HERE"/blend/*.blend1
fi
mkdir -p "$OUT" "$HERE/blend" "$HERE/previews"

# Bruit connu de bpy en module (bibliothèques optionnelles absentes : Draco, MeshOptimizer)
noise='MeshOptimizer is not available|Draco is not available|^[0-9:]+ \| INFO:|^$'

fail=0
for n in "${MODELS[@]}"; do
  if [ ! -f "$HERE/models/$n.py" ]; then echo "!! modèle inconnu : $n"; fail=1; continue; fi
  set +e
  "$VENV/bin/python" "$HERE/models/$n.py" 2>&1 | grep -Ev "$noise"
  rc=${PIPESTATUS[0]}
  set -e
  if [ "$rc" -ne 0 ]; then echo "!! échec $n (code $rc)"; fail=1; fi
done

echo "== contrôle des GLB"
"$VENV/bin/python" "$HERE/tools/check_glb.py" "${MODELS[@]}" || fail=1

if [ "$PREVIEWS" -eq 1 ]; then
  echo "== captures"
  for n in "${MODELS[@]}"; do
    node "$ROOT/scripts/shot-model.mjs" "$n" "$HERE/previews/$n.png" >/dev/null
    node "$ROOT/scripts/shot-model.mjs" "$n" "$HERE/previews/${n}_close.png" --close >/dev/null
    echo "   $n.png, ${n}_close.png"
  done
fi

if [ "$fail" -ne 0 ]; then echo "== ÉCHEC"; exit 1; fi
echo "== terminé : ${#MODELS[@]} modèle(s) dans $OUT"
