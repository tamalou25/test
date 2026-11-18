"""Ombrage cuit dans les couleurs de sommets : occlusion ambiante + dégradé de hauteur.

Méthode retenue : occlusion calculée PAR COIN de face (domaine CORNER) en lançant
des rayons (BVHTree de mathutils) dans l'hémisphère de la normale, avec un sol
infini à y = 0 comme occultant et une atténuation avec la distance
(« ambient obscurance »). Le point d'échantillonnage de chaque coin est rentré
légèrement vers le centre de sa face : un coin au pied d'un mur voit le sol, un
coin d'arête vive n'est pas faussement noirci par sa propre face voisine.

Pourquoi pas la cuisson AO de Cycles vers les sommets : elle échantillonne au
sommet exact (souvent à l'intérieur d'une arête concave -> noir ou rien), sans
réglage d'atténuation par distance, et les résultats sur des maillages très
peu denses étaient moins contrôlables. Le calcul maison est déterministe, rapide
(quelques secondes pour 8 000 triangles) et réglable par modèle.
"""
import math
import random

from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from .palette import linear_to_srgb_channel, srgb_to_linear_channel


def _hemisphere(n, seed=7):
    """Directions à pondération cosinus (repère local, axe Z), suite de Fibonacci."""
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        u = (i + 0.5) / n
        r = math.sqrt(u)
        a = i * ga
        out.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u)))))
    return out


def _front_hit(bvh, origin, direction, max_dist, tries=4):
    """Distance du premier impact sur une face VUE DE FACE (les faces vues de dos sont
    traversées). Un sommet caché sous un objet sans fond (tapis, acrotère, coffre posé)
    n'est donc pas noirci, ce qui évite les bavures sombres interpolées sur les faces
    visibles voisines."""
    travelled = 0.0
    o = origin
    for _ in range(tries):
        loc, nrm, _i, dist = bvh.ray_cast(o, direction, max_dist - travelled)
        if loc is None:
            return None
        travelled += dist
        if nrm.dot(direction) < 0:
            return travelled
        o = loc + direction * 1e-4
        travelled += 1e-4
    return None


def _basis(nrm):
    t = Vector((1, 0, 0)) if abs(nrm.x) < 0.8 else Vector((0, 1, 0))
    b1 = nrm.cross(t).normalized()
    b2 = nrm.cross(b1)
    return Matrix((b1, b2, nrm)).transposed()


def bake(model, samples=40, max_dist=0.5, strength=0.75, ground=True,
         height_grad=(0.90, 1.0), grad_height=None, gamma=1.0, extra_occluders=()):
    """Multiplie les couleurs de sommets par l'occlusion et un dégradé vertical.

    samples      : rayons par coin
    max_dist     : portée des rayons (unités de jeu) ; au-delà rien n'occulte
    strength     : 0 = pas d'AO, 1 = AO pleine
    height_grad  : facteur (bas, haut) appliqué selon y / grad_height
    """
    verts, polys = [], []
    for nd in model.nodes.values():
        base = len(verts)
        nd.bm.verts.index_update()
        verts += [v.co.copy() for v in nd.bm.verts]
        polys += [[base + v.index for v in f.verts] for f in nd.bm.faces
                  if f[nd.cast_flag]]
    if ground:
        g = 200.0
        b = len(verts)
        verts += [Vector((-g, 0, -g)), Vector((g, 0, -g)), Vector((g, 0, g)), Vector((-g, 0, g))]
        polys.append([b, b + 1, b + 2, b + 3])
    for (vs, ps) in extra_occluders:
        b = len(verts)
        verts += [Vector(v) for v in vs]
        polys += [[b + i for i in p] for p in ps]
    bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)
    hemi = _hemisphere(samples)
    ymax = max((v.y for v in verts[:len(verts) - (4 if ground else 0)]), default=1.0)
    gh = grad_height or max(ymax, 0.3)
    rnd = random.Random(1234)
    lo, hi = height_grad
    for nd in model.nodes.values():
        lay = nd.col
        wlay = nd.ao_flag
        for f in nd.bm.faces:
            w = f[wlay]
            if w <= 0:
                continue  # eau, lumière : ni AO ni dégradé
            fn = f.normal.copy()
            c = f.calc_center_median()
            for l in f.loops:
                p = l.vert.co
                ao = 1.0
                if w > 0 and strength > 0:
                    d = c - p
                    L = d.length
                    q = p + d * min(0.3, 0.035 / L) if L > 1e-9 else p.copy()
                    nrm = fn
                    if f.smooth:
                        vn = l.vert.normal
                        if vn.dot(fn) > 0.2:
                            nrm = (vn + fn).normalized()
                    q = q + nrm * 0.004
                    M = _basis(nrm) @ Matrix.Rotation(rnd.random() * 6.2832, 3, "Z")
                    occ = 0.0
                    for hd in hemi:
                        dirw = M @ hd
                        d_hit = _front_hit(bvh, q, dirw, max_dist)
                        if d_hit is not None:
                            occ += 1.0 - d_hit / max_dist
                    ao = 1.0 - occ / len(hemi)
                    ao = ao ** gamma
                    ao = 1.0 - (1.0 - ao) * strength * w
                t = min(1.0, max(0.0, p.y / gh))
                k = (lo + (hi - lo) * t) * ao
                col = l[lay]
                # on module en sRGB (perceptuel) pour que le réglage soit intuitif
                rgb = [srgb_to_linear_channel(min(1.0, linear_to_srgb_channel(col[i]) * k))
                       for i in range(3)]
                l[lay] = (rgb[0], rgb[1], rgb[2], 1.0)
