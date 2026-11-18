"""tente — tente de caravanier 2x2 : toile `tissu` rayée indigo / écru, faîtage sur X=0 le long de Z.

Ouverture (pignon) vers +Z, intérieur sombre, piquets et haubans, tapis, jarre et sacs devant.
Budget 400 triangles.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import plane, sac, join

NAME = "tente"
FOOTPRINT = (2, 2)
BUDGET = 400

HW = 0.70       # demi-largeur aux égouts
HE = 0.24       # hauteur des égouts (mur bas)
HR = 0.72       # hauteur du faîtage
ZB, ZF = -0.72, 0.64
NS = 8          # bandes de toile le long de Z


def rayure(f, z0=ZB, z1=ZF):
    c = f.calc_center_median()
    k = int((c.z - z0) / (z1 - z0) * NS)
    return "indigo" if k % 2 == 0 else "ecru"


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    # versants et murs bas, des deux côtés
    for s in (-1, 1):
        roof = m.cloth((0, HR, ZB), (0, HR, ZF), (s * HW, HE, ZF), (s * HW, HE, ZB), nu=NS, nv=2, sag=0.025)
        roof.color_fn(rayure, var=0.025)
        wall = m.cloth((s * HW, HE, ZB), (s * HW, HE, ZF), (s * HW, 0.0, ZF), (s * HW, 0.0, ZB),
                       nu=NS, nv=1, sag=0.0, up=(s, 0, 0))
        wall.color_fn(rayure, var=0.025)
    # pignon arrière plein
    back = m.add([(-HW, 0, ZB), (HW, 0, ZB), (HW, HE, ZB), (0, HR, ZB), (-HW, HE, ZB)], [[0, 1, 2, 3, 4]], mat="tissu")
    for f in back.faces:
        f.normal_update()
        if f.normal.z > 0:
            f.normal_flip()
    back.color("indigo", var=0.03, shade=0.85)
    # pignon avant : deux pans relevés laissant une ouverture triangulaire
    for s in (-1, 1):
        pts = [(s * HW, 0, ZF), (s * 0.22, 0, ZF), (s * 0.03, 0.58, ZF), (0, HR, ZF), (s * HW, HE, ZF)]
        pan = m.add(pts, [[0, 1, 2, 3, 4]], mat="tissu")
        for f in pan.faces:
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        pan.color("ecru" if s > 0 else "indigo", var=0.03)
    # intérieur sombre dans l'ouverture
    ouv = m.add([(-0.22, 0, ZF - 0.04), (0.22, 0, ZF - 0.04), (0.03, 0.58, ZF - 0.04), (-0.03, 0.58, ZF - 0.04)],
                [[0, 1, 2, 3]])
    for f in ouv.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    ouv.color("#2a1a12", var=0.0, face_var=0.0).no_ao()
    # faîtage de palmier dépassant, poteaux d'entrée
    fa = m.boxmm((-0.02, HR - 0.015, ZB - 0.05), (0.02, HR + 0.025, ZF + 0.07), bevel=0.0, skip=("-y",))
    fa.color("bois", var=0.05)
    for s in (-1, 1):
        po = m.tube([(s * 0.23, 0, ZF + 0.02), (s * 0.13, 0.66, ZF + 0.03)], 0.016, 4, cap=(False, True), smooth=60)
        po.color("bois", var=0.05)
        po.clamp_floor()
    # haubans + piquets
    for (px, pz, ex, ey, ez) in ((-0.88, 0.78, -HW, HE, ZF), (0.88, 0.78, HW, HE, ZF),
                                 (-0.88, -0.80, -HW, HE, ZB), (0.88, -0.80, HW, HE, ZB)):
        h = m.tube([(px, 0.03, pz), (ex, ey, ez)], 0.006, 3, cap=(False, False), smooth=90)
        h.color("bois_sombre", var=0.04)
        h.clamp_floor()
        pg = m.lathe([(0.016, 0.0), (0.0, 0.05)], 3, (px, 0, pz), smooth=0)
        pg.color("bois", var=0.05)
    # devant : tapis, jarre, sacs
    tx, tz = 0.0, 0.82
    sl = m.boxmm((tx - 0.22, 0, tz - 0.10), (tx + 0.22, 0.012, tz + 0.10), skip=("+y", "-y"))
    sl.color("garance", var=0.02, shade=0.8)
    for i, c in enumerate(("garance", "ecru", "indigo", "safran", "indigo", "ecru", "garance")):
        z0 = tz - 0.10 + i * 0.20 / 7
        q = plane(m, [(tx - 0.22, 0.0125, z0), (tx + 0.22, 0.0125, z0), (tx + 0.22, 0.0125, z0 + 0.20 / 7),
                      (tx - 0.22, 0.0125, z0 + 0.20 / 7)])
        q.color(c, var=0.03)
    sac(m, 0.80, 0.55, h=0.19, r=0.09, color="ecru", tie="garance", yaw=20, seg=5)
    sac(m, 0.84, 0.74, h=0.16, r=0.08, color="chaux_ombre", tie="bois", yaw=70, seg=5)
    jr = m.jar(0.22, 0.08, 7, (-0.80, 0, 0.60), neck=0.5)
    jr.color("pise_sombre", var=0.05)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.4, strength=0.7))
