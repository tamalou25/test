"""Finalisation d'un modèle : contrôles, ombrage, objets Blender, GLB, .blend, manifeste."""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import shading

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS_SRC = os.path.dirname(HERE)
PROJECT = os.path.dirname(ASSETS_SRC)
OUT_DIR = os.path.join(PROJECT, "public", "assets", "models")
BLEND_DIR = os.path.join(ASSETS_SRC, "blend")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")

MARGIN = 0.06
EPS = 1e-4

# jeu (x, y haut, z façade)  ->  Blender (x, -z, y)
GAME_TO_BL = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def _material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (1, 1, 1, 1)
    mat.roughness = 0.9 if name in ("vc", "tissu") else 0.4
    mat.metallic = 0.0
    # vc / lumiere : faces simples ; tissu : double face ; eau : simple
    mat.use_backface_culling = name != "tissu"
    return mat


def _clean_hidden_bottoms(model, floor_y=0.0):
    """Supprime les faces posées au sol et tournées vers le bas (invisibles)."""
    for nd in model.nodes.values():
        kill = [f for f in nd.bm.faces
                if f.normal.y < -0.95 and all(abs(v.co.y - floor_y) < 2e-3 for v in f.verts)]
        if kill:
            bmesh.ops.delete(nd.bm, geom=kill, context="FACES_ONLY")


def _bounds(model):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for nd in model.nodes.values():
        for v in nd.bm.verts:
            for i in range(3):
                lo[i] = min(lo[i], v.co[i])
                hi[i] = max(hi[i], v.co[i])
    return lo, hi


def check(model, min_y=0.0):
    """Contrôles des conventions. Renvoie la liste des problèmes (vide = OK)."""
    probs = []
    lo, hi = _bounds(model)
    if lo.y < min_y - EPS:
        probs.append(f"géométrie sous y={min_y} (min y = {lo.y:.3f})")
    if model.footprint:
        fx, fz = model.footprint
        lx, lz = fx / 2 - MARGIN, fz / 2 - MARGIN
        if lo.x < -lx - EPS or hi.x > lx + EPS or lo.z < -lz - EPS or hi.z > lz + EPS:
            probs.append(f"hors emprise {fx}x{fz} (marge {MARGIN}) : x[{lo.x:.3f},{hi.x:.3f}]"
                         f" z[{lo.z:.3f},{hi.z:.3f}] (limite ±{lx:.2f} / ±{lz:.2f})")
    if model.budget and model.triangles() > model.budget:
        probs.append(f"budget dépassé : {model.triangles()} > {model.budget} triangles")
    for nd in model.nodes.values():
        lay = nd.col
        for f in nd.bm.faces:
            c = f.loops[0][lay]
            if c[0] > 0.99 and c[1] < 0.01 and c[2] > 0.99:
                probs.append(f"faces magenta (couleur oubliée) dans le nœud {nd.name}")
                break
    if "eau" in [m for nd in model.nodes.values() for m in nd.mats]:
        for nd in model.nodes.values():
            if "eau" in nd.mats and nd.name != "eau":
                probs.append(f"matériau eau hors du nœud 'eau' ({nd.name})")
    return probs


def finalize(model, ao=None, min_y=0.0, strict=True, extra_manifest=None):
    """Ombre, contrôle, exporte GLB + .blend et met à jour le manifeste."""
    ao = dict(ao or {})
    _clean_hidden_bottoms(model)
    for nd in model.nodes.values():
        nd.bm.normal_update()
    shading.bake(model, **ao)
    probs = check(model, min_y)
    tris = model.triangles()

    # ---------------------------------------------------- scène Blender
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    objs = {}
    for nd in model.nodes.values():
        bm = nd.bm.copy()
        T = Matrix.Translation(-nd.origin)
        bmesh.ops.transform(bm, matrix=GAME_TO_BL @ T, verts=bm.verts)
        if bm.faces:
            me = bpy.data.meshes.new(nd.name)
            bm.to_mesh(me)
            for mname in nd.mats:
                me.materials.append(_material(mname))
            attr = me.color_attributes.get("Col")
            me.color_attributes.active_color = attr
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
            # nettoyage de la couche interne
            for internal in ("ao_w", "ao_cast"):
                if internal in me.attributes:
                    me.attributes.remove(me.attributes[internal])
            ob = bpy.data.objects.new(nd.name, me)
        else:
            ob = bpy.data.objects.new(nd.name, None)
        bm.free()
        scene.collection.objects.link(ob)
        objs[nd.name] = ob
    for nd in model.nodes.values():
        ob = objs[nd.name]
        if nd.parent:
            par = model.nodes[nd.parent]
            ob.parent = objs[nd.parent]
            ob.location = (GAME_TO_BL @ (nd.origin - par.origin).to_4d()).to_3d()
        if ob.name != nd.name:
            raise RuntimeError(f"nom de nœud altéré par Blender : {ob.name}")

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(BLEND_DIR, exist_ok=True)
    glb = os.path.join(OUT_DIR, model.name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", use_selection=False,
        export_yup=True, export_apply=False,
        export_texcoords=False, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_draco_mesh_compression_enable=False,
        export_animations=False, export_extras=False, export_cameras=False,
        export_lights=False,
    )
    bpy.context.preferences.filepaths.save_version = 0  # pas de .blend1
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, model.name + ".blend"),
                                compress=True)

    lo, hi = _bounds(model)
    entry = {
        "nom": model.name,
        "fichier": f"{model.name}.glb",
        "emprise": list(model.footprint) if model.footprint else None,
        "noeuds": [
            {"nom": nd.name, "parent": nd.parent,
             "origine": [round(c, 4) for c in nd.origin],
             "materiaux": list(nd.mats)}
            for nd in model.nodes.values()
        ],
        "triangles": tris,
        "budget": model.budget,
        "boite": {"min": [round(c, 4) for c in lo], "max": [round(c, 4) for c in hi]},
    }
    if extra_manifest:
        entry.update(extra_manifest)
    update_manifest(entry)
    print(f"[{model.name}] {tris} triangles, boîte {entry['boite']} -> {glb}")
    for p in probs:
        print(f"[{model.name}] PROBLÈME : {p}", file=sys.stderr)
    if probs and strict:
        sys.exit(2)
    return entry


def update_manifest(entry):
    data = {"version": 1, "modeles": {}}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as fh:
            data = json.load(fh)
    data.setdefault("modeles", {})[entry["nom"]] = entry
    data["modeles"] = dict(sorted(data["modeles"].items()))
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
