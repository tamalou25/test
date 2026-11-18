"""Vérifie les GLB livrés contre CONVENTIONS.md (lecture directe du JSON glTF, sans bpy).

    python3 assets_src/tools/check_glb.py            # tous les modèles du manifeste
    python3 assets_src/tools/check_glb.py maison_a   # un seul

Contrôles : nœud racine au nom du modèle, nœuds enfants requis, matériaux autorisés,
COLOR_0 sur chaque primitive, ni texture ni Draco, triangles = manifeste,
emprise et y >= 0 (bassins : -0,12) d'après la boîte du manifeste.
"""
import json
import os
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, "public", "assets", "models")
ALLOWED_MATS = {"vc", "lumiere", "eau", "tissu"}
REQUIRED_NODES = {
    "palmier": {"tronc", "palmes"},
    "chameau": {"corps", "patte_avg", "patte_avd", "patte_arg", "patte_ard", "charge"},
    "habitant": {"robe", "tete"},
    "fontaine": {"eau"}, "repartiteur": {"eau"}, "bassin": {"eau"}, "citerne": {"eau"},
    "source": {"eau"}, "hammam": {"eau"}, "puits": {"bras"}, "noria": {"roue"},
}
MIN_Y = {"bassin": -0.12}


def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, _ = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF" and version == 2, "pas un GLB v2"
    n = struct.unpack("<I", data[12:16])[0]
    return json.loads(data[20:20 + n])


def check(name, entry):
    errs = []
    g = read_glb(os.path.join(MODELS, entry["fichier"]))
    nodes = g.get("nodes", [])
    roots = [nodes[i] for i in g["scenes"][g.get("scene", 0)]["nodes"]]
    if len(roots) != 1 or roots[0].get("name") != name:
        errs.append(f"racine attendue unique '{name}', trouvé {[r.get('name') for r in roots]}")
    names = {nd.get("name") for nd in nodes}
    missing = REQUIRED_NODES.get(name, set()) - names
    if missing:
        errs.append(f"nœuds manquants : {sorted(missing)}")
    mats = {m.get("name") for m in g.get("materials", [])}
    if mats - ALLOWED_MATS:
        errs.append(f"matériaux hors convention : {sorted(mats - ALLOWED_MATS)}")
    if g.get("images") or g.get("textures"):
        errs.append("textures présentes")
    if any("draco" in e.lower() for e in g.get("extensionsUsed", [])):
        errs.append("compression Draco utilisée")
    tris = 0
    for mi, mesh in enumerate(g.get("meshes", [])):
        for prim in mesh["primitives"]:
            if "COLOR_0" not in prim["attributes"]:
                errs.append(f"primitive sans COLOR_0 (maillage {mesh.get('name')})")
            mname = g["materials"][prim["material"]]["name"] if "material" in prim else None
            if mname == "eau":
                owner = [nd.get("name") for nd in nodes if nd.get("mesh") == mi]
                if owner != ["eau"]:
                    errs.append(f"matériau eau hors du nœud 'eau' ({owner})")
            acc = g["accessors"][prim["indices"]]
            tris += acc["count"] // 3
    if tris != entry["triangles"]:
        errs.append(f"triangles GLB {tris} != manifeste {entry['triangles']}")
    if entry.get("budget") and tris > entry["budget"]:
        errs.append(f"budget dépassé {tris} > {entry['budget']}")
    lo, hi = entry["boite"]["min"], entry["boite"]["max"]
    if lo[1] < MIN_Y.get(name, 0.0) - 1e-3:
        errs.append(f"géométrie sous le sol (min y {lo[1]})")
    if entry.get("emprise"):
        fx, fz = entry["emprise"]
        if (max(-lo[0], hi[0]) > fx / 2 - 0.06 + 1e-3) or (max(-lo[2], hi[2]) > fz / 2 - 0.06 + 1e-3):
            errs.append(f"hors emprise {fx}x{fz} : {lo} {hi}")
    return tris, errs


def main():
    with open(os.path.join(MODELS, "manifest.json"), encoding="utf-8") as fh:
        man = json.load(fh)["modeles"]
    wanted = sys.argv[1:] or sorted(man)
    bad = 0
    for name in wanted:
        tris, errs = check(name, man[name])
        status = "OK " if not errs else "ERR"
        print(f"{status} {name:14s} {tris:5d} tri  {'; '.join(errs)}")
        bad += bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
