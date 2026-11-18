"""jarre — jarre à eau de terre cuite à deux anses, bandeau décoré indigo / écru.

Accessoire (≤ 200 triangles), origine au pied, hauteur 0,30.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize

NAME = "jarre"
FOOTPRINT = None
BUDGET = 200
H, R, SEG = 0.30, 0.115, 10


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    body = m.jar(H, R, SEG, (0, 0, 0), neck=0.5, smooth=45)

    def col(f):
        c = f.calc_center_median()
        k = int(((math.atan2(c.x, c.z) / (2 * math.pi)) % 1.0) * SEG)
        if f.normal.y > 0.9:
            return ("boue_sombre", 0.7)           # ouverture, dans l'ombre
        if c.y < 0.075:
            return ("pise_sombre", 1.0)           # pied
        if c.y < 0.144:
            return ("pise", 1.0)
        if c.y < 0.234:                           # épaule : motif en dents indigo / écru
            return ("indigo", 1.0) if k % 2 == 0 else ("ecru", 0.96)
        if c.y < 0.27:
            return ("pise_clair", 1.0)            # col
        return ("pise_sombre", 1.0)               # lèvre
    body.color_fn(col, var=0.02)
    for sx in (-1, 1):
        a = m.tube([(sx * 0.047, 0.262, 0), (sx * 0.118, 0.248, 0), (sx * 0.137, 0.196, 0),
                    (sx * 0.114, 0.152, 0)], 0.011, 3, cap=(False, False), smooth=70)
        a.color("pise_sombre", var=0.03)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.25, strength=0.8))
