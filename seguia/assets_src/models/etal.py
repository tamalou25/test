"""etal — étal de marché 1x1 : comptoir de terre, auvent `tissu` rayé safran / écru, paniers, sac.

Façade (client) vers +Z. Budget 200 triangles (accessoire).
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import petit_panier, sac, plane

NAME = "etal"
FOOTPRINT = (1, 1)
BUDGET = 200

X0, X1 = -0.40, 0.40
ZB, ZF = -0.32, 0.36           # arrière / avant de l'auvent
YB, YF = 0.60, 0.46            # hauteur arrière / avant de l'auvent


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    # poteaux de palmier (4 faces, sans dessus ni dessous)
    for (x, z, y) in ((X0 + 0.02, ZB + 0.02, YB), (X1 - 0.02, ZB + 0.02, YB),
                      (X0 + 0.02, ZF - 0.02, YF), (X1 - 0.02, ZF - 0.02, YF)):
        p = m.boxmm((x - 0.02, 0, z - 0.02), (x + 0.02, y, z + 0.02), top=False, bottom=False)
        p.color("bois", var=0.06)
    # auvent de toile rayée, en pente vers l'avant
    n = 6
    cl = m.cloth((X0, YB, ZB), (X1, YB, ZB), (X1, YF, ZF), (X0, YF, ZF), nu=n, nv=2, sag=0.03)
    cl.color_fn(lambda f: ("safran", 1.0) if int((f.calc_center_median().x - X0) / (X1 - X0) * n) % 2 == 0
                else ("ecru", 1.0), var=0.02)
    # lambrequin (bavolet) sur le devant
    bav = m.cloth((X0, YF, ZF), (X1, YF, ZF), (X1, YF - 0.07, ZF), (X0, YF - 0.07, ZF), nu=n, nv=1,
                  sag=0.0, up=(0, 0, 1))
    bav.color_fn(lambda f: ("garance", 1.0) if int((f.calc_center_median().x - X0) / (X1 - X0) * n) % 2 == 0
                 else ("ecru", 1.0), var=0.02)
    # comptoir de terre
    cp = m.boxmm((-0.36, 0, 0.14), (0.36, 0.17, 0.32), bottom=False, bevel=0.0)
    cp.color_fn(lambda f: ("pise_clair", 1.0) if f.normal.y > 0.9 else ("pise", 1.0), var=0.03)
    # marchandises sur le comptoir
    petit_panier(m, -0.22, 0.23, 0.17, r=0.085, h=0.055, fill="datte", fill2="datte_claire")
    petit_panier(m, 0.0, 0.23, 0.17, r=0.085, h=0.055, fill="safran", fill2="datte_claire")
    petit_panier(m, 0.22, 0.23, 0.17, r=0.085, h=0.055, fill="palme", fill2="palme_jeune")
    # sac et tenture du fond
    sac(m, 0.27, -0.03, h=0.17, r=0.085, color="ecru", tie="indigo", yaw=20, seg=5)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.3, strength=0.75))
