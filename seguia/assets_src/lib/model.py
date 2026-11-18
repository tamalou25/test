"""Cœur de la bibliothèque : Model (nœuds + maillages bmesh) et Piece (sélection de faces).

Toute la géométrie est construite en COORDONNÉES DU JEU (glTF) :
    +Y en haut, +Z = façade, origine au centre de l'emprise au sol.
La conversion vers les axes de Blender (Z en haut) n'a lieu qu'à l'export
(voir export.py), donc les scripts de modèles n'ont jamais à y penser.

Chaque nœud (racine ou enfant animé) possède UN bmesh ; chaque matériau y est un
indice de matériau. À l'export, un nœud = un objet = un maillage glTF avec une
primitive par matériau : c'est le « minimum de maillages par matériau ».
"""
import math
import random
import zlib
from contextlib import contextmanager

import bmesh
from mathutils import Matrix, Vector

from .palette import linear, srgb

MATERIALS = ("vc", "lumiere", "eau", "tissu")
COLOR_LAYER = "Col"


def V(*a):
    if len(a) == 1:
        a = a[0]
    return Vector((float(a[0]), float(a[1]), float(a[2])))


class Node:
    def __init__(self, name, origin, parent):
        self.name = name
        self.origin = V(origin)
        self.parent = parent
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new(COLOR_LAYER)
        # couche « ao » : 1 = la face reçoit l'occlusion, 0 = non (ex. eau, lumière)
        self.ao_flag = self.bm.faces.layers.float.new("ao_w")
        # couche « cast » : 1 = la face occulte les autres ; 0 = petit détail qui
        # n'assombrit pas les murs (évite les traînées diagonales sur les grands triangles)
        self.cast_flag = self.bm.faces.layers.int.new("ao_cast")
        self.mats = []  # noms de matériaux, l'indice = material_index

    def mat_index(self, mat):
        if mat not in MATERIALS:
            raise ValueError(f"matériau inconnu {mat!r} (attendus : {MATERIALS})")
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)


class Piece:
    """Un ensemble de faces d'un même nœud, manipulé comme un tout."""

    def __init__(self, model, node, faces):
        self.m = model
        self.node = node
        self.faces = [f for f in faces if f.is_valid]

    # -- accès -----------------------------------------------------------
    @property
    def bm(self):
        return self.m.nodes[self.node].bm

    def verts(self):
        seen = {}
        for f in self.faces:
            for v in f.verts:
                seen[v] = v
        return list(seen.values())

    def edges(self):
        seen = {}
        for f in self.faces:
            for e in f.edges:
                seen[e] = e
        return list(seen.values())

    def __add__(self, other):
        assert other.node == self.node, "pièces de nœuds différents"
        return Piece(self.m, self.node, self.faces + other.faces)

    def bounds(self):
        vs = [v.co for v in self.verts()]
        lo = V(min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))
        hi = V(max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))
        return lo, hi

    # -- transformations ------------------------------------------------
    def transform(self, M, pivot=(0, 0, 0)):
        p = V(pivot)
        M4 = Matrix.Translation(p) @ M.to_4x4() @ Matrix.Translation(-p)
        bmesh.ops.transform(self.bm, matrix=M4, verts=self.verts())
        for f in self.faces:
            f.normal_update()
        return self

    def translate(self, x=0, y=0, z=0):
        bmesh.ops.translate(self.bm, vec=V(x, y, z), verts=self.verts())
        return self

    def rotate(self, axis, deg, pivot=(0, 0, 0)):
        return self.transform(Matrix.Rotation(math.radians(deg), 4, axis), pivot)

    def rotate_y(self, deg, pivot=(0, 0, 0)):
        return self.rotate("Y", deg, pivot)

    def scale(self, sx, sy=None, sz=None, pivot=(0, 0, 0)):
        sy = sx if sy is None else sy
        sz = sx if sz is None else sz
        M = Matrix.Diagonal((sx, sy, sz, 1.0))
        r = self.transform(M, pivot)
        if sx * sy * sz < 0:
            for f in self.faces:
                f.normal_flip()
        return r

    def mirror_x(self):
        """Renvoie une COPIE miroir (x -> -x)."""
        return self.copy().scale(-1, 1, 1)

    def copy(self):
        ret = bmesh.ops.duplicate(self.bm, geom=self.faces)
        faces = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMFace)]
        return Piece(self.m, self.node, faces)

    def jitter(self, amount, seed=None):
        """Déplace aléatoirement les sommets (aspect « fait main »)."""
        rnd = random.Random(seed if seed is not None else self.m.rnd.random())
        for v in self.verts():
            v.co += V(rnd.uniform(-amount, amount), rnd.uniform(-amount, amount),
                      rnd.uniform(-amount, amount))
        for f in self.faces:
            f.normal_update()
        return self

    # -- apparence -------------------------------------------------------
    def color(self, c, var=None, face_var=None, shade=1.0):
        """Couleur d'élément (+variation ±var par élément, ±face_var par face).

        Les variations sont appliquées en sRGB (perceptuel) puis converties en linéaire.
        """
        var = self.m.default_var if var is None else var
        face_var = self.m.default_face_var if face_var is None else face_var
        rnd = self.m.rnd
        base = srgb(c)
        k = 1.0 + rnd.uniform(-var, var)
        hue = [1.0 + rnd.uniform(-var, var) * 0.35 for _ in range(3)]
        el = [min(1.0, base[i] * k * hue[i] * shade) for i in range(3)]
        layer = self.m.nodes[self.node].col
        for f in self.faces:
            kf = 1.0 + rnd.uniform(-face_var, face_var)
            rgb = linear(tuple(min(1.0, x * kf) for x in el))
            for l in f.loops:
                l[layer] = (rgb[0], rgb[1], rgb[2], 1.0)
        return self

    def color_fn(self, fn, var=None):
        """fn(face) -> spécification de couleur (nom, hex, triplet sRGB) ou (spec, shade)."""
        var = self.m.default_face_var if var is None else var
        rnd = self.m.rnd
        layer = self.m.nodes[self.node].col
        for f in self.faces:
            spec = fn(f)
            shade = 1.0
            if isinstance(spec, tuple) and len(spec) == 2 and not isinstance(spec[0], float):
                spec, shade = spec
            base = srgb(spec)
            kf = (1.0 + rnd.uniform(-var, var)) * shade
            rgb = linear(tuple(min(1.0, x * kf) for x in base))
            for l in f.loops:
                l[layer] = (rgb[0], rgb[1], rgb[2], 1.0)
        return self

    def color_vertex_fn(self, fn):
        """fn(position, face) -> spec sRGB : couleur par COIN (dégradés)."""
        layer = self.m.nodes[self.node].col
        for f in self.faces:
            for l in f.loops:
                rgb = linear(fn(l.vert.co, f))
                l[layer] = (rgb[0], rgb[1], rgb[2], 1.0)
        return self

    def no_ao(self, weight=0.0):
        """Exclut (ou atténue) ces faces de l'ombrage d'occlusion."""
        lay = self.m.nodes[self.node].ao_flag
        for f in self.faces:
            f[lay] = weight
        return self

    def no_cast(self):
        """Ces faces reçoivent l'occlusion mais n'en projettent pas (petits détails)."""
        lay = self.m.nodes[self.node].cast_flag
        for f in self.faces:
            f[lay] = 0
        return self

    def material(self, mat):
        idx = self.m.nodes[self.node].mat_index(mat)
        for f in self.faces:
            f.material_index = idx
        return self

    def flat(self):
        for f in self.faces:
            f.smooth = False
        return self

    def smooth(self, angle=50.0):
        """Ombrage lisse, arêtes vives au-delà de `angle` degrés (≈ auto-smooth)."""
        fs = set(self.faces)
        for f in self.faces:
            f.smooth = True
        lim = math.radians(angle)
        for e in self.edges():
            lf = [f for f in e.link_faces if f in fs]
            if len(lf) == 2:
                e.smooth = lf[0].normal.angle(lf[1].normal, 0.0) <= lim
            else:
                e.smooth = True
        return self

    def bevel(self, offset, angle=30.0, segments=1):
        """Chanfreine les arêtes dont l'angle dièdre dépasse `angle`."""
        if offset <= 0:
            return self
        lim = math.radians(angle)
        fs = set(self.faces)
        edges = []
        for e in self.edges():
            lf = [f for f in e.link_faces if f in fs]
            if len(lf) == 2 and lf[0].normal.angle(lf[1].normal, 0.0) > lim:
                edges.append(e)
        if not edges:
            return self
        seeds = self.verts()
        old_faces = self.faces
        ret = bmesh.ops.bevel(self.bm, geom=edges, offset=offset, offset_type="OFFSET",
                              segments=segments, profile=0.5, affect="EDGES",
                              clamp_overlap=True)
        seeds = [v for v in seeds if v.is_valid]
        seeds += [v for f in ret["faces"] for v in f.verts]
        seeds += [v for f in old_faces if f.is_valid for v in f.verts]
        self.faces = _connected_faces(seeds)
        for f in self.faces:
            f.normal_update()
        return self

    def taper(self, k, cx=0.0, cz=0.0, y0=0.0, y1=1.0):
        """Fruit (murs inclinés) : resserre en X/Z de k (fraction) entre y0 et y1."""
        for v in self.verts():
            t = min(1.0, max(0.0, (v.co.y - y0) / (y1 - y0)))
            f = 1.0 - k * t
            v.co.x = cx + (v.co.x - cx) * f
            v.co.z = cz + (v.co.z - cz) * f
        for f in self.faces:
            f.normal_update()
        return self

    def clamp_floor(self, y=0.0):
        """Ramène à y les sommets légèrement sous le sol (ex. base d'un tube incliné)."""
        for v in self.verts():
            if v.co.y < y:
                v.co.y = y
        for f in self.faces:
            f.normal_update()
        return self

    def delete_faces(self, pred):
        """Supprime les faces f telles que pred(f) (ex. faces cachées)."""
        kill = [f for f in self.faces if pred(f)]
        bmesh.ops.delete(self.bm, geom=kill, context="FACES_ONLY")
        self.faces = [f for f in self.faces if f.is_valid]
        return self


def _connected_faces(verts):
    seen_v, seen_f, out = set(), set(), []
    stack = list(verts)
    while stack:
        v = stack.pop()
        if v in seen_v or not v.is_valid:
            continue
        seen_v.add(v)
        for f in v.link_faces:
            if f not in seen_f:
                seen_f.add(f)
                out.append(f)
                stack.extend(f.verts)
    return out


class Model:
    """Un modèle = un nœud racine + éventuels nœuds enfants animés."""

    def __init__(self, name, footprint=None, budget=None, seed=None):
        from . import prims  # noqa: F401  (attache les primitives)
        self.name = name
        self.footprint = footprint  # (cases X, cases Z) ou None
        self.budget = budget
        self.rnd = random.Random(seed if seed is not None else zlib.crc32(name.encode()))
        self.default_var = 0.04
        self.default_face_var = 0.015
        self.nodes = {name: Node(name, (0, 0, 0), None)}
        self._node = name
        self._mat = "vc"

    # -- nœuds et contexte ---------------------------------------------
    def node(self, name, origin=(0, 0, 0), parent=None):
        """Déclare un nœud enfant (pour les parties animées) ; origine = pivot."""
        if name not in self.nodes:
            self.nodes[name] = Node(name, origin, parent or self.name)
        return name

    @contextmanager
    def using(self, node=None, mat=None):
        old = (self._node, self._mat)
        if node is not None:
            if node not in self.nodes:
                raise KeyError(f"nœud {node!r} non déclaré (Model.node)")
            self._node = node
        if mat is not None:
            self._mat = mat
        try:
            yield self
        finally:
            self._node, self._mat = old

    # -- ajout brut ----------------------------------------------------
    def add(self, verts, faces, node=None, mat=None):
        """Ajoute des sommets (coordonnées jeu) et des faces (indices). -> Piece."""
        node = node or self._node
        mat = mat or self._mat
        nd = self.nodes[node]
        bm = nd.bm
        bv = [bm.verts.new(V(p)) for p in verts]
        idx = nd.mat_index(mat)
        out = []
        for f in faces:
            vs = [bv[i] for i in f]
            try:
                face = bm.faces.new(vs)
            except ValueError:
                continue  # face déjà existante (dégénérée)
            face.material_index = idx
            face[nd.ao_flag] = 1.0
            face[nd.cast_flag] = 1
            face.normal_update()
            out.append(face)
        # supprime les sommets inutilisés
        lone = [v for v in bv if not v.link_faces]
        if lone:
            bmesh.ops.delete(bm, geom=lone, context="VERTS")
        p = Piece(self, node, out)
        p.color("#FF00FF", var=0, face_var=0)  # magenta = « couleur oubliée »
        p.flat()
        return p

    def triangles(self):
        return sum(len(f.verts) - 2 for nd in self.nodes.values() for f in nd.bm.faces)
